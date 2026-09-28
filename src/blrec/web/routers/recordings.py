import asyncio

from fastapi import APIRouter

from ...application import Application
from ...disk_space.stats import RecordingStats, aggregate_recording_stats

app: Application = None  # type: ignore  # bypass flake8 F821

router = APIRouter(prefix='/api/v1/recordings', tags=['recordings'])


@router.get('/stats', response_model=RecordingStats)
async def get_recording_stats() -> RecordingStats:
    """统计各房间录像的文件数量与占用体积。"""

    # 扫描目录可能很慢，放到线程池里跑，避免阻塞事件循环
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, aggregate_recording_stats, app.out_dir)
