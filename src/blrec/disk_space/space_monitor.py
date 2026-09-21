import asyncio
import shutil
from contextlib import suppress
from typing import Iterable, List

from loguru import logger

from ..event.event_emitter import EventEmitter, EventListener
from ..exception import ExceptionSubmitter, exception_callback
from ..utils.mixins import AsyncStoppableMixin, SwitchableMixin
from .helpers import is_space_enough
from .models import DiskUsage

__all__ = 'SpaceMonitor', 'SpaceEventListener'

_instances: List['SpaceMonitor'] = []


def space_monitors() -> Iterable['SpaceMonitor']:
    return tuple(_instances)


class SpaceEventListener(EventListener):
    async def on_space_no_enough(
        self, path: str, threshold: int, disk_usage: DiskUsage
    ) -> None: ...


class SpaceMonitor(
    EventEmitter[SpaceEventListener], SwitchableMixin, AsyncStoppableMixin
):
    def __init__(
        self,
        path: str,
        *,
        check_interval: int = 60,  # seconds
        space_threshold: int = 1024**3,  # 1GB
    ) -> None:
        super().__init__()
        _instances.append(self)
        self.path = path
        self._check_interval = check_interval
        self.space_threshold = space_threshold
        self._monitoring: bool = False

    @property
    def check_interval(self) -> int:
        return self._check_interval

    @check_interval.setter
    def check_interval(self, value: int) -> None:
        self._check_interval = value
        if value <= 0:
            self.disable()
        else:
            self.enable()

    def _do_enable(self) -> None:
        if self._check_interval <= 0:
            return
        asyncio.create_task(self.start())
        logger.debug('Enabled space monitor')

    def _do_disable(self) -> None:
        asyncio.create_task(self.stop())
        logger.debug('Disabled space monitor')

    async def _do_start(self) -> None:
        self._create_polling_task()

    async def _do_stop(self) -> None:
        await self._cancel_polling_task()

    def _create_polling_task(self) -> None:
        self._polling_task = asyncio.create_task(self._polling_loop())
        self._polling_task.add_done_callback(exception_callback)

    async def _cancel_polling_task(self) -> None:
        self._polling_task.cancel()
        with suppress(asyncio.CancelledError):
            await self._polling_task

    async def _polling_loop(self) -> None:
        while True:
            if not is_space_enough(self.path, self.space_threshold):
                logger.warning('No enough disk space left')
                await self._emit_space_no_enough()
            await asyncio.sleep(self.check_interval)

    async def emit_space_no_enough(
        self, path: str, threshold: int
    ) -> DiskUsage:
        """广播空间不足事件，返回本次的磁盘用量。

        监听者的异常仍交给异常中心，不会影响本方法。
        """

        usage = DiskUsage(*shutil.disk_usage(self.path))
        await self._emit('space_no_enough', path, threshold, usage)
        return usage

    async def reclaim_space(self, path: str, size: int) -> bool:
        """请求释放空间，返回释放后是否已满足要求。

        这里的成功判据是**实际磁盘余量**，而不是监听者的返回值或异常：
        回收器腾不够时会抛 `SpaceReclaimFailedError`，但该异常在这里被吞掉
        （避免污染异常中心、惊动用户），最终仍以磁盘真实余量下结论。
        也因此，清理失败是正常返回值，调用方无需 try/except。
        """

        logger.warning(f'No enough disk space for {path}, reclaiming {size} bytes ...')

        for listener in tuple(self._listeners):
            on_space_no_enough = getattr(listener, 'on_space_no_enough', None)
            if on_space_no_enough is None:
                continue
            usage = DiskUsage(*shutil.disk_usage(self.path))
            with ExceptionSubmitter():
                await on_space_no_enough(path, size, usage)

        return is_space_enough(path, size)

    async def _emit_space_no_enough(self) -> None:
        await self.emit_space_no_enough(self.path, self.space_threshold)
