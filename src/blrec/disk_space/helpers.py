import asyncio
import json
import os
import shutil
from subprocess import PIPE, Popen
from typing import Literal, Optional, Tuple

from loguru import logger


def is_space_enough(path: str, size: int) -> bool:
    return shutil.disk_usage(path).free > size


async def get_video_resolution_and_duration(
    path: str,
) -> Optional[Tuple[int, int, float]]:
    """用 ffprobe 取视频的 (宽, 高, 时长/秒)，取不到时返回 None。"""

    loop = asyncio.get_running_loop()

    def _probe() -> Optional[Tuple[int, int, float]]:
        args = [
            'ffprobe',
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=width,height',
            '-show_entries',
            'format=duration',
            '-of',
            'json',
            path,
        ]
        with Popen(args, stdout=PIPE, stderr=PIPE) as process:
            stdout, _stderr = process.communicate(timeout=10)
        data = json.loads(stdout)
        streams = data.get('streams') or []
        if not streams:
            return None
        width = streams[0].get('width')
        height = streams[0].get('height')
        duration = data.get('format', {}).get('duration')
        if not width or not height or duration is None:
            return None
        return (int(width), int(height), float(duration))

    try:
        return await loop.run_in_executor(None, _probe)
    except Exception as e:
        logger.warning(f'Failed to probe {path!r}, due to: {repr(e)}')
        return None


async def delete_file(path: str, log_level: Literal['INFO', 'DEBUG'] = 'INFO') -> None:
    loop = asyncio.get_running_loop()

    try:
        await loop.run_in_executor(None, os.remove, path)
    except Exception as e:
        logger.error(f'Failed to delete {path!r}, due to: {repr(e)}')
    else:
        logger.log(log_level, f'Deleted {path!r}')
