import io
import os
import re
from typing import Callable, Optional, Tuple

from loguru import logger
from reactivex import Observable, Subject, abc
from reactivex.disposable import CompositeDisposable, Disposable, SerialDisposable

from ..io import FlvWriter
from ..models import FlvHeader
from .typing import FLVStream, FLVStreamItem

__all__ = ('Dumper',)


class Dumper:
    def __init__(
        self,
        path_provider: Callable[..., Tuple[str, int]],
        buffer_size: Optional[int] = None,
    ) -> None:
        self.buffer_size = buffer_size or io.DEFAULT_BUFFER_SIZE  # bytes
        self._path_provider = path_provider
        self._file_opened: Subject[Tuple[str, int]] = Subject()
        self._file_closed: Subject[str] = Subject()
        self._size_updates: Subject[int] = Subject()
        self._timestamp_updates: Subject[int] = Subject()
        self._prev_path = ''
        self._reset()

    def _reset(self) -> None:
        self._path: str = ''
        self._file: Optional[io.BufferedReader] = None
        self._flv_writer: Optional[FlvWriter] = None

    @property
    def path(self) -> str:
        return self._path

    @property
    def file_opened(self) -> Observable[Tuple[str, int]]:
        return self._file_opened

    @property
    def file_closed(self) -> Observable[str]:
        return self._file_closed

    @property
    def size_updates(self) -> Observable[int]:
        return self._size_updates

    @property
    def timestamp_updates(self) -> Observable[int]:
        return self._timestamp_updates

    def __call__(self, source: FLVStream) -> FLVStream:
        return self._dump(source)

    def _open_file(self) -> None:
        self._path, self.timestamp = self._path_provider()
        # 视频参数变化会在同一秒内触发 split，此时新分段会拿到与上一段完全相同的路径。
        # 直接以 'wb' 打开会把刚写完的上一段静默截断，故此处递增后缀避让。
        if self._path == self._prev_path:
            self._path = self._next_available_path(self._path)
        self._file = open(self._path, 'wb', buffering=self.buffer_size)  # type: ignore
        logger.debug(f'Opened file: {self._path}')
        self._file_opened.on_next((self._path, self.timestamp))

    @staticmethod
    def _next_available_path(path: str) -> str:
        """给撞车的分段名加 _ (1) / _ (2) 后缀，跳过已被占用的。"""
        root, ext = os.path.splitext(path)
        m = re.search(r'_\((\d+)\)$', root)
        index = int(m.group(1)) + 1 if m else 1
        while True:
            stem = (
                f'{root}_({index})'
                if m is None
                else re.sub(r'\(\d+\)$', f'({index})', root)
            )
            candidate = stem + ext
            if not os.path.exists(candidate):
                return candidate
            index += 1

    def _close_file(self) -> None:
        if self._file is not None and not self._file.closed:
            _path = self._path
            self.ts0 = self.timestamp
            self._file.close()
            self._prev_path = _path
            logger.debug(f'Closed file: {_path}')
            self._file_closed.on_next(_path)

    def _dump(self, source: FLVStream) -> FLVStream:
        def subscribe(
            observer: abc.ObserverBase[FLVStreamItem],
            scheduler: Optional[abc.SchedulerBase] = None,
        ) -> abc.DisposableBase:
            subscription = SerialDisposable()

            self._close_file()
            self._reset()

            def on_next(item: FLVStreamItem) -> None:
                try:
                    if isinstance(item, FlvHeader):
                        self._close_file()
                        self._open_file()
                        assert self._file is not None
                        self._flv_writer = FlvWriter(self._file)
                        size = self._flv_writer.write_header(item)
                        self._size_updates.on_next(size)
                        self._timestamp_updates.on_next(0)
                    else:
                        if self._flv_writer is not None:
                            size = self._flv_writer.write_tag(item)
                            self._size_updates.on_next(size)
                            self._timestamp_updates.on_next(item.timestamp)

                    observer.on_next(item)
                except Exception as e:
                    self._close_file()
                    self._reset()
                    observer.on_error(e)

            def on_completed() -> None:
                self._close_file()
                self._reset()
                observer.on_completed()

            def on_error(e: Exception) -> None:
                self._close_file()
                self._reset()
                observer.on_error(e)

            def dispose() -> None:
                self._close_file()
                self._reset()

            subscription.disposable = source.subscribe(
                on_next, on_error, on_completed, scheduler=scheduler
            )

            return CompositeDisposable(subscription, Disposable(dispose))

        return Observable(subscribe)
