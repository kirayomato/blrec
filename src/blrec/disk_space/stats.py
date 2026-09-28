"""按房间汇总输出目录下的录像文件数量、体积与时间分布。"""

import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from loguru import logger

__all__ = (
    'RecordingStats',
    'RoomRecordingStats',
    'MonthlyStats',
    'aggregate_recording_stats',
)

# 只统计录像本身，弹幕、元数据、封面等附属文件不计入
_VIDEO_SUFFIX_SET = frozenset(('.flv', '.mp4', '.ts', '.m4s'))

# 文件名里的录制开始时间，优先于文件系统的 mtime 使用。
# 默认路径模板产出 2026-09-14-164227 形式，模板去掉分隔符时是 20260914164227。
_TIME_PATTERNS = (
    re.compile(r'(?<!\d)(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(?!\d)'),
    re.compile(r'(?<!\d)(\d{14})(?!\d)'),
)

_MIN_YEAR = 2009
_MAX_YEAR = 2100


@dataclass
class MonthlyStats:
    """某个月份的录像数量与体积，month 形如 2026-09。"""

    month: str
    file_count: int
    total_size: int  # bytes


@dataclass
class RoomRecordingStats:
    """单个房间的录像占用，房间名取自输出目录下的一级子目录名。"""

    name: str
    file_count: int
    total_size: int  # bytes
    first_time: Optional[float]  # 最早录像的时间戳(秒)
    last_time: Optional[float]  # 最晚录像的时间戳(秒)
    monthly: List[MonthlyStats] = field(default_factory=list)


@dataclass
class RecordingStats:
    out_dir: str
    file_count: int
    total_size: int
    first_time: Optional[float]
    last_time: Optional[float]
    rooms: List[RoomRecordingStats] = field(default_factory=list)
    monthly: List[MonthlyStats] = field(default_factory=list)


@dataclass
class _Accumulator:
    """累加一个房间（或全部房间）的数量、体积、时间范围与月度分布。"""

    file_count: int = 0
    total_size: int = 0
    first_time: Optional[float] = None
    last_time: Optional[float] = None
    monthly: Dict[str, Tuple[int, int]] = field(default_factory=dict)

    def add(self, size: int, ts: float) -> None:
        self.file_count += 1
        self.total_size += size
        if self.first_time is None or ts < self.first_time:
            self.first_time = ts
        if self.last_time is None or ts > self.last_time:
            self.last_time = ts
        month = datetime.fromtimestamp(ts).strftime('%Y-%m')
        count, total = self.monthly.get(month, (0, 0))
        self.monthly[month] = (count + 1, total + size)

    def make_monthly(self) -> List[MonthlyStats]:
        return [
            MonthlyStats(month=month, file_count=count, total_size=size)
            for month, (count, size) in sorted(self.monthly.items())
        ]


def _parse_recording_time(stem: str) -> Optional[float]:
    """从文件名解析录制开始时间的时间戳，解析不出时返回 None。"""

    for pattern in _TIME_PATTERNS:
        for match in pattern.finditer(stem):
            groups = match.groups()
            if len(groups) == 1:
                value = groups[0]
                groups = (
                    value[:4],
                    value[4:6],
                    value[6:8],
                    value[8:10],
                    value[10:12],
                    value[12:14],
                )
            try:
                year, month, day, hour, minute, second = map(int, groups)
                if not _MIN_YEAR <= year <= _MAX_YEAR:
                    continue
                return datetime(year, month, day, hour, minute, second).timestamp()
            except ValueError:
                continue
    return None


def aggregate_recording_stats(path: str) -> RecordingStats:
    """汇总输出目录下一级子目录的录像数量、体积与时间分布，按体积降序。

    子目录名即房间名，其下的录像文件全部计入该房间；直接放在输出目录下的
    录像归入空名房间，由调用方决定如何展示。录像时间优先取文件名里的时间戳，
    解析不出时才用 mtime。目录不存在或不可读时返回空统计。
    """

    total = _Accumulator()
    rooms: Dict[str, _Accumulator] = {}

    def add_file(room: str, file_path: str, stem: str) -> None:
        try:
            stat = os.stat(file_path)
        except OSError as e:
            logger.warning(f'Failed to stat {file_path!r}: {e!r}')
            return

        ts = _parse_recording_time(stem)
        if ts is None:
            ts = stat.st_mtime

        total.add(stat.st_size, ts)
        if room not in rooms:
            rooms[room] = _Accumulator()
        rooms[room].add(stat.st_size, ts)

    def scan_dir(room: str, dir_path: str) -> None:
        for dirpath, _dirnames, filenames in os.walk(dir_path):
            for filename in filenames:
                if Path(filename).suffix.lower() not in _VIDEO_SUFFIX_SET:
                    continue
                file_path = os.path.join(dirpath, filename)
                add_file(room, file_path, Path(filename).stem)

    try:
        entries = list(os.scandir(path))
    except OSError as e:
        logger.warning(f'Failed to scan {path!r}: {e!r}')
        entries = []

    for entry in entries:
        try:
            if entry.is_dir():
                scan_dir(entry.name, entry.path)
            elif (
                entry.is_file()
                and Path(entry.name).suffix.lower() in _VIDEO_SUFFIX_SET
            ):
                add_file('', entry.path, Path(entry.name).stem)
        except OSError as e:
            logger.warning(f'Failed to scan {entry.path!r}: {e!r}')

    room_list = sorted(
        (
            RoomRecordingStats(
                name=name,
                file_count=acc.file_count,
                total_size=acc.total_size,
                first_time=acc.first_time,
                last_time=acc.last_time,
                monthly=acc.make_monthly(),
            )
            for name, acc in rooms.items()
        ),
        key=lambda room: room.total_size,
        reverse=True,
    )

    return RecordingStats(
        out_dir=path,
        file_count=total.file_count,
        total_size=total.total_size,
        first_time=total.first_time,
        last_time=total.last_time,
        rooms=room_list,
        monthly=total.make_monthly(),
    )
