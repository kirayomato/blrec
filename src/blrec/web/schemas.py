from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel

from blrec.setting.typing import AliasKeyOfSettings

__all__ = (
    'ResponseMessage',
    'DataSelection',
    'AliasKeyOfSettings',
)


class ResponseMessage(BaseModel):
    code: int = 0
    message: str = ''
    data: Optional[Dict[str, Any]] = None


class DataSelection(str, Enum):
    ALL = 'all'

    # live status
    PREPARING = 'preparing'
    LIVING = 'living'
    ROUNDING = 'rounding'

    # task status
    MONITOR_ENABLED = 'monitor_enabled'
    MONITOR_DISABLED = 'monitor_disabled'
    RECORDER_ENABLED = 'recorder_enabled'
    RECORDER_DISABLED = 'recorder_disabled'

    # task running status
    STOPPED = 'stopped'
    WAITTING = 'waitting'
    RECORDING = 'recording'
    REMUXING = 'remuxing'
    INJECTING = 'injecting'
