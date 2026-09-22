import asyncio
import glob
import os
import re
from dataclasses import dataclass
from datetime import datetime
from functools import partial
from pathlib import Path, PurePath
from typing import Dict, Iterable, List, Optional, Set

from loguru import logger
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_none

from ..path import extra_metadata_path, ffmpeg_metadata_path, playlist_path
from ..utils.mixins import SwitchableMixin
from .helpers import delete_file, get_video_resolution_and_duration, is_space_enough
from .space_monitor import DiskUsage, SpaceEventListener, SpaceMonitor

__all__ = 'SpaceReclaimer', 'space_reclaimers'

_instances: List['SpaceReclaimer'] = []


def space_reclaimers() -> Iterable['SpaceReclaimer']:
    return tuple(_instances)


def _video_of_sidecar(path: str) -> Optional[str]:
    """附属文件对应的主录像，主录像还在时附属文件不该被单独删除。"""

    for suffix in ('.flv.meta.json', '.flv.meta'):
        if path.endswith(suffix):
            return path[: -len(suffix)] + '.flv'
    if path.endswith('.m3u8'):
        return path[: -len('.m3u8')] + '.m4s'
    return None


def _sidecars_of_video(video_path: str) -> List[str]:
    """主录像的附属文件，删录像时一起删。"""

    suffix = PurePath(video_path).suffix
    if suffix == '.flv':
        return [ffmpeg_metadata_path(video_path), extra_metadata_path(video_path)]
    if suffix == '.m4s':
        return [playlist_path(video_path)]
    return []


@dataclass
class _RoomLimit:
    """单个房间的录像保存限额。"""

    max_keep_days: int
    max_keep_size: int  # bytes
    path_template: str


class SpaceReclaimer(SpaceEventListener, SwitchableMixin):
    _SUFFIX_SET = frozenset(
        ('.flv', '.mp4', '.ts', '.m4s', '.m3u8', '.json', '.meta', '.jpg', '.png')
    )
    _VIDEO_SUFFIX_SET = frozenset(('.flv', '.mp4', '.ts', '.m4s'))

    # 竖屏且码率低于该值的录像体积不大，删掉腾不出多少空间，跳过不删
    _VIDEO_BITRATE_THRESHOLD = 3000  # kbps

    # 体积清理时跳过一天内文件
    _RECENTLY_WRITE_WINDOW = 24 * 60 * 60  # seconds

    def __init__(
        self,
        space_monitor: SpaceMonitor,
        path: str,
        *,
        rec_ttl: int = 60 * 60 * 24,
        recycle_records: bool = False,
    ) -> None:
        super().__init__()
        _instances.append(self)
        self._space_monitor = space_monitor
        self.path = path
        if value := os.environ.get('BLREC_REC_TTL'):
            try:
                rec_ttl = int(value)
            except Exception as exc:
                logger.warning(repr(exc))
        self.rec_ttl = rec_ttl
        self.recycle_records = recycle_records
        self._room_limits: Dict[int, _RoomLimit] = {}

    async def on_space_no_enough(
        self, path: str, threshold: int, disk_usage: DiskUsage
    ) -> None:
        await self.free_space(threshold)

    async def on_poll(self) -> None:
        for room_id, limit in tuple(self._room_limits.items()):
            try:
                await self._enforce_room_limit(room_id, limit)
            except Exception as exc:
                logger.warning(
                    f'Failed to enforce room limit of room {room_id}: {repr(exc)}'
                )

    def set_room_limit(
        self,
        room_id: int,
        *,
        max_keep_days: int = 0,
        max_keep_size: int = 0,
        path_template: str = '',
    ) -> None:
        """登记房间的保存限额，两项都为 0 时不做限额清理。"""

        if max_keep_days <= 0 and max_keep_size <= 0:
            self._room_limits.pop(room_id, None)
            return
        self._room_limits[room_id] = _RoomLimit(
            max_keep_days=max_keep_days,
            max_keep_size=max_keep_size,
            path_template=path_template,
        )

    def remove_room_limit(self, room_id: int) -> None:
        self._room_limits.pop(room_id, None)

    def clear_room_limits(self) -> None:
        self._room_limits.clear()

    def _do_enable(self) -> None:
        self._space_monitor.add_listener(self)
        logger.debug('Enabled space reclaimer')

    def _do_disable(self) -> None:
        self._space_monitor.remove_listener(self)
        logger.debug('Disabled space reclaimer')

    async def free_space(self, size: int) -> bool:
        if is_space_enough(self.path, size):
            return True
        if self.recycle_records and not os.environ.get('BLREC_DANMAKU_ONLY'):
            if await self._free_space_from_records(size):
                return True
        return False

    async def _free_space_from_records(self, size: int) -> bool:
        logger.info('Free space from records ...')
        ttl = self.rec_ttl
        # 冷静期最多压缩到 1 小时，避免删到太新的录像；
        # rec_ttl 本身配得更短时以它为准，否则一轮都进不去、记录清理会彻底失效。
        min_ttl = min(60 * 60, self.rec_ttl)
        probed: Set[str] = set()
        while not is_space_enough(self.path, size):
            if ttl < min_ttl:
                logger.warning(f'Unable to free {size} bytes from records')
                return False
            ts = datetime.now().timestamp() - ttl
            for path in await self._get_record_file_paths(ts):
                if path in probed:
                    continue
                probed.add(path)
                # 探测要跑 ffprobe，代价高，所以逐个按需进行，够空间就停
                if await self._should_keep(path):
                    continue
                await self._delete_record(path)
                if is_space_enough(self.path, size):
                    break
            ttl /= 2
        return True

    async def _should_keep(self, path: str) -> bool:
        """判断该文件是否保留不删。"""

        video_path = _video_of_sidecar(path)
        if video_path is not None and os.path.isfile(video_path):
            return True

        if PurePath(path).suffix not in self._VIDEO_SUFFIX_SET:
            return False

        return await self._is_low_quality_video(path)

    async def _is_low_quality_video(self, path: str) -> bool:
        """竖屏且码率偏低的录像保留不删。"""

        info = await get_video_resolution_and_duration(path)
        if info is None:
            logger.warning(f'Failed to probe {path!r}, keep it instead')
            return True

        width, height, duration = info
        if duration <= 0:
            return True

        try:
            bitrate = os.path.getsize(path) * 8 / duration / 1000
        except OSError as e:
            logger.warning(f'Failed to get size of {path!r}: {repr(e)}')
            return True

        if height > width and bitrate < self._VIDEO_BITRATE_THRESHOLD:
            logger.info(f'Keep {path!r}, portrait {width}x{height}, {bitrate:.0f}kbps')
            return True

        return False

    async def _delete_record(self, path: str) -> None:
        """删除录像，其附属文件跟随一起删除。"""

        # 附属文件可能已随主录像删掉，或已被同轮的其它条目处理过
        if not os.path.isfile(path):
            return

        await delete_file(path)
        for sidecar in _sidecars_of_video(path):
            if os.path.isfile(sidecar):
                await delete_file(sidecar, 'DEBUG')

    async def _enforce_room_limit(self, room_id: int, limit: _RoomLimit) -> None:
        """按房间限额清理录像，先删超过天数的，再删到体积上限内。"""

        pattern = self._room_file_pattern(room_id, limit.path_template)
        if pattern is None:
            return

        keep_cache: Dict[str, bool] = {}

        async def should_keep(path: str) -> bool:
            if path not in keep_cache:
                keep_cache[path] = await self._should_keep(path)
            return keep_cache[path]

        now = datetime.now().timestamp()

        if limit.max_keep_days > 0:
            cutoff = now - limit.max_keep_days * 24 * 60 * 60
            for path in await self._get_room_file_paths(pattern):
                try:
                    stat = os.stat(path)
                except OSError:
                    continue
                # 按 mtime 升序排列，mtime 还没过期后面的都不会过期
                if stat.st_mtime >= cutoff:
                    break
                if stat.st_atime >= cutoff:
                    continue
                if await should_keep(path):
                    continue
                logger.info(f'Delete {path!r} exceeding keep days of room {room_id}')
                await self._delete_record(path)

        if limit.max_keep_size > 0:
            paths = await self._get_room_file_paths(pattern)
            total_size = sum(map(self._file_size, paths))
            for path in paths:
                if total_size <= limit.max_keep_size:
                    break
                try:
                    stat = os.stat(path)
                except OSError:
                    continue
                if now - stat.st_mtime < self._RECENTLY_WRITE_WINDOW:
                    continue
                if await should_keep(path):
                    continue
                freed = self._file_size(path)
                for sidecar in _sidecars_of_video(path):
                    if os.path.isfile(sidecar):
                        freed += self._file_size(sidecar)
                logger.info(f'Delete {path!r} exceeding keep size of room {room_id}')
                await self._delete_record(path)
                total_size -= freed

    @staticmethod
    def _file_size(path: str) -> int:
        try:
            return os.path.getsize(path)
        except OSError:
            return 0

    def _room_file_pattern(self, room_id: int, path_template: str) -> Optional[str]:
        """把路径模板转成该房间文件的 glob 模式，除 roomid 外的占位符换成 *。"""

        # 模板不含 roomid 时无法区分房间，清理会误伤其它房间的文件
        if not path_template or '{roomid}' not in path_template:
            return None

        segments: List[str] = []
        for part in re.split(r'(\{[^{}]+\})', path_template):
            if part.startswith('{') and part.endswith('}'):
                key = part[1:-1]
                segments.append(str(room_id) if key == 'roomid' else '*')
            else:
                # glob 里 [ 是字符集语法，转义掉模板字面量中的 [
                segments.append(part.replace('[', '[['))
        pattern = os.path.join(self.path, ''.join(segments))
        return os.path.normpath(pattern) + '.*'

    @retry(
        retry=retry_if_exception_type(OSError),
        wait=wait_none(),
        stop=stop_after_attempt(3),
    )
    async def _get_room_file_paths(self, pattern: str) -> List[str]:
        return await self._get_file_paths(pattern)

    @retry(
        retry=retry_if_exception_type(OSError),
        wait=wait_none(),
        stop=stop_after_attempt(3),
    )
    async def _get_record_file_paths(self, ts: float) -> List[str]:
        glob_path = os.path.join(self.path, '*/**/*.*')
        return await self._get_file_paths(glob_path, ts)

    async def _get_file_paths(
        self, glob_path: str, ts: Optional[float] = None
    ) -> List[str]:
        paths: Iterable[Path]
        paths = map(lambda p: Path(p), glob.iglob(glob_path, recursive=True))
        paths = filter(lambda p: p.suffix in self._SUFFIX_SET, paths)
        if ts is not None:
            paths = filter(lambda p: p.stat().st_mtime < ts > p.stat().st_atime, paths)
        func = partial(
            sorted, paths, key=lambda p: (p.stat().st_mtime, p.stat().st_atime)
        )
        loop = asyncio.get_running_loop()
        path_list = await loop.run_in_executor(None, func)
        return list(map(str, path_list))
