import signal
from typing import Any, Dict

import attr
from fastapi import APIRouter, status

from ..schemas import ResponseMessage
from ...application import Application


app: Application = None  # type: ignore  # bypass flake8 F821

router = APIRouter(prefix='/api/v1/app', tags=['application'])


@router.get('/status')
async def get_app_status() -> Dict[str, Any]:
    return attr.asdict(app.status)


@router.get('/info')
async def get_app_info() -> Dict[str, Any]:
    return attr.asdict(app.info)


@router.post('/restart', response_model=ResponseMessage)
async def restart_app() -> ResponseMessage:
    await app.restart()
    return ResponseMessage(message='Application has been restarted')


@router.post('/exit', status_code=status.HTTP_204_NO_CONTENT)
async def exit_app() -> None:
    signal.raise_signal(signal.SIGINT)
    await app.exit()


@router.post('/test_notify', status_code=status.HTTP_204_NO_CONTENT)
async def test_notify() -> None:
    from blrec.event.event_center import EventCenter
    from blrec.event.models import (
        LiveBeganEventData,
        LiveBeganEvent,
        LiveEndedEvent,
        LiveEndedEventData,
        SpaceNoEnoughEvent,
        SpaceNoEnoughEventData,
    )
    from blrec.bili.models import UserInfo, RoomInfo, LiveStatus
    from blrec.disk_space.models import DiskUsage

    # Create test data
    user_info = UserInfo(
        name="测试用户", gender="男", face="https://example.com/face.jpg", uid=123456
    )
    room_info = RoomInfo(
        uid=123456,
        room_id=12345678,
        short_room_id=0,
        area_id=1,
        area_name="生活",
        parent_area_id=1,
        parent_area_name="生活",
        live_status=LiveStatus.LIVE,
        live_start_time=1640995200,  # 2022-01-01 00:00:00
        online=1000,
        title="测试直播间",
        cover="https://example.com/cover.jpg",
        tags="测试,直播",
        description="这是一个测试直播间",
    )
    disk_usage = DiskUsage(
        total=100000000000, used=50000000000, free=50000000000  # 100GB  # 50GB  # 50GB
    )
    path = "/test/path"
    threshold = 10000000000  # 10GB

    event_center = EventCenter.get_instance()
    data = LiveBeganEventData(user_info, room_info)
    event_center.submit(LiveBeganEvent.from_data(data))
    data = LiveEndedEventData(user_info, room_info)
    event_center.submit(LiveEndedEvent.from_data(data))

    event_center.submit(BaseException("test"))

    data = SpaceNoEnoughEventData(path, threshold, disk_usage)
    event_center.submit(SpaceNoEnoughEvent.from_data(data))
