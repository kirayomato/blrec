from __future__ import annotations

import asyncio
import html
import re
from datetime import datetime, timedelta, timezone
from time import time
from typing import Any, AsyncIterator, Final, List

import aiofiles
import attr
from loguru import logger
from lxml import etree

from .models import (
    Danmu,
    GiftSendRecord,
    GuardBuyRecord,
    Metadata,
    SuperChatRecord,
    UserToast,
)
from .typing import Element

__all__ = 'DanmakuReader', 'DanmakuWriter'


class DanmakuReader:  # TODO rewrite
    def __init__(self, path: str) -> None:
        self._path = path

    async def __aenter__(self) -> DanmakuReader:
        await self.init()
        return self

    async def __aexit__(self, exc_type, exc, tb):  # type: ignore
        pass

    async def init(self) -> None:
        loop = asyncio.get_running_loop()
        self._tree = await loop.run_in_executor(None, etree.parse, self._path)

    async def read_metadata(self) -> Metadata:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._read_metadata)

    async def read_danmus(self) -> AsyncIterator[Danmu]:
        for elem in await self._get_danmu_elems():
            yield self._make_danmu(elem)

    def _read_metadata(self) -> Metadata:
        return Metadata(
            user_name=self._tree.xpath('/i/metadata/user_name')[0].text,
            room_id=int(self._tree.xpath('/i/metadata/room_id')[0].text),
            room_title=self._tree.xpath('/i/metadata/room_title')[0].text,
            area=self._tree.xpath('/i/metadata/area')[0].text,
            parent_area=self._tree.xpath('/i/metadata/parent_area')[0].text,
            live_start_time=int(
                datetime.fromisoformat(
                    self._tree.xpath('/i/metadata/live_start_time')[0].text
                ).timestamp()
            ),
            record_start_time=int(
                datetime.fromisoformat(
                    self._tree.xpath('/i/metadata/record_start_time')[0].text
                ).timestamp()
            ),
            recorder=self._tree.xpath('/i/metadata/recorder')[0].text,
        )

    async def _get_danmu_elems(self) -> List[Element]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._tree.xpath, '/i/d')

    def _make_danmu(self, elem: Element) -> Danmu:
        params = elem.get('p').split(',')
        return Danmu(
            stime=float(params[0]),
            mode=int(params[1]),
            size=int(params[2]),
            color=int(params[3]),
            date=int(params[4]),
            pool=int(params[5]),
            uid_hash=params[6],
            uid=elem.get('uid'),
            uname=elem.get('user'),
            dmid=int(params[7]),
            text=elem.text,
            isEmoji=bool(int(elem.get('isEmoji'))),
        )


class DanmakuWriter:
    _XML_HEAD: Final[str] = """\
<?xml version="1.0" encoding="UTF-8"?>
<i>
    <chatserver>chat.bilibili.com</chatserver>
    <chatid>0</chatid>
    <mission>0</mission>
    <maxlimit>0</maxlimit>
    <state>0</state>
    <real_name>0</real_name>
    <source>e-r</source>
"""

    def __init__(self, path: str):
        self._path = path
        self._file = None
        self.last = time()

    async def _write(self, s: str):
        await self._file.write(s)
        if time() - self.last > 60:
            await self._file.close()
            self._file = await aiofiles.open(self._path, 'at', encoding='utf8')
            self.last = time()

    async def __aenter__(self) -> DanmakuWriter:
        await self.init()
        return self

    async def __aexit__(self, exc_type, exc, tb):  # type: ignore
        if self._file is not None and not self._file.closed:
            await self.complete()

    async def init(self) -> None:
        self._file = await aiofiles.open(self._path, 'wt', encoding='utf8')
        await self._file.write(self._XML_HEAD)

    async def write_metadata(self, metadata: Metadata) -> None:
        await self._write(self._serialize_metadata(metadata))

    async def write_danmu(self, danmu: Danmu) -> None:
        await self._write(self._serialize_danmu(danmu))

    async def write_user_toast(self, toast: UserToast) -> None:
        await self._write(self._serialize_user_toast(toast))

    async def write_gift_send_record(self, record: GiftSendRecord) -> None:
        await self._write(self._serialize_gift_send_record(record))

    async def write_guard_buy_record(self, record: GuardBuyRecord) -> None:
        await self._write(self._serialize_guard_buy_record(record))

    async def write_super_chat_record(self, record: SuperChatRecord) -> None:
        await self._write(self._serialize_super_chat_record(record))

    async def complete(self) -> None:
        await self._write('</i>')
        await self._file.close()

    def _serialize_metadata(self, metadata: Metadata) -> str:
        tz = timezone(timedelta(hours=8))
        ts = metadata.live_start_time
        live_start_time = datetime.fromtimestamp(ts, tz).isoformat()
        ts = metadata.record_start_time
        record_start_time = datetime.fromtimestamp(ts, tz).isoformat()
        user_name = escape_xml_text(metadata.user_name, 'metadata user_name')
        room_title = escape_xml_text(metadata.room_title, 'metadata room_title')
        area = escape_xml_text(metadata.area, 'metadata area')
        parent_area = escape_xml_text(metadata.parent_area, 'metadata parent_area')
        return f"""\
    <metadata>
        <user_name>{user_name}</user_name>
        <room_id>{metadata.room_id}</room_id>
        <room_title>{room_title}</room_title>
        <area>{area}</area>
        <parent_area>{parent_area}</parent_area>
        <live_start_time>{live_start_time}</live_start_time>
        <record_start_time>{record_start_time}</record_start_time>
        <recorder>{metadata.recorder}</recorder>
    </metadata>
"""

    def _serialize_danmu(self, dm: Danmu) -> str:
        attrib = {
            'p': (
                f'{dm.stime:.3f},{dm.mode},{dm.size},{dm.color},{dm.date}'
                # f'{dm.pool},{dm.uid_hash},{dm.dmid}'
            ),
            'isEmoji': str(int(dm.isEmoji)),
            'uid': str(dm.uid),
            'user': remove_control_characters(dm.uname, 'danmu user'),
        }
        elem = etree.Element('d', attrib=attrib)
        elem.text = remove_control_characters(dm.text, f'danmu text (dmid={dm.dmid})')
        return '    ' + etree.tostring(elem, encoding='utf8').decode() + '\n'

    def _serialize_user_toast(self, toast: UserToast) -> str:
        attrib = attr.asdict(
            toast,
            filter=lambda a, v: a.name != 'msg',
            value_serializer=record_value_serializer,
        )
        elem = etree.Element('toast', attrib=attrib)
        elem.text = remove_control_characters(toast.msg, 'user toast msg')
        return '    ' + etree.tostring(elem, encoding='utf8').decode() + '\n'

    def _serialize_gift_send_record(self, record: GiftSendRecord) -> str:
        attrib = attr.asdict(record, value_serializer=record_value_serializer)
        elem = etree.Element('gift', attrib=attrib)
        return '    ' + etree.tostring(elem, encoding='utf8').decode() + '\n'

    def _serialize_guard_buy_record(self, record: GuardBuyRecord) -> str:
        attrib = attr.asdict(record, value_serializer=record_value_serializer)
        elem = etree.Element('guard', attrib=attrib)
        return '    ' + etree.tostring(elem, encoding='utf8').decode() + '\n'

    def _serialize_super_chat_record(self, record: SuperChatRecord) -> str:
        attrib = attr.asdict(
            record,
            filter=lambda a, v: a.name != 'message',
            value_serializer=record_value_serializer,
        )
        elem = etree.Element('sc', attrib=attrib)
        elem.text = remove_control_characters(record.message, 'super chat message')
        return '    ' + etree.tostring(elem, encoding='utf8').decode() + '\n'


def record_value_serializer(
    instance: Any, attribute: attr.Attribute[Any], value: Any
) -> Any:
    if attribute.name == 'ts':
        return f'{value:.3f}'
    if attribute.name == 'cointype':
        return '金瓜子' if value == 'gold' else '银瓜子'
    if not isinstance(value, str):
        value = str(value)
    return remove_control_characters(value, attribute.name)


_XML_INVALID_CHARS = re.compile(
    '[^\t\n\r\u0020-\ud7ff\ue000-\ufffd\U00010000-\U0010ffff]'
)

# 同一字段的告警间隔（秒），避免脏弹幕刷屏
_DROP_LOG_INTERVAL: Final[float] = 60.0
_last_warned: dict[str, float] = {}


def remove_control_characters(s: str, field: str) -> str:
    """移除 XML 1.0 不允许出现的字符。

    lxml 只接受 XML 1.0 的 Char 产生式所允许的字符，判据比"控制字符"更宽也更严：
    除 \\t \\n \\r 以外的 C0 控制符要剔除，此外 U+FFFE / U+FFFF 这类非字符、
    以及半个 emoji 造成的 lone surrogate（如 '\\ud83d'）同样会让赋值抛
    ValueError: All strings must be XML compatible。unicodedata 的 'Cc' 类别
    只覆盖 C0/C1，故这里直接按码位区间判断。

    真剔除字符时打一条 warning，含码位与原文片段；同一字段 60 秒内只报一次。
    """
    dropped = _XML_INVALID_CHARS.findall(s)
    if not dropped:
        return s
    _log_dropped_characters(dropped, s, field)
    return _XML_INVALID_CHARS.sub('', s)


def _log_dropped_characters(dropped: List[str], source: str, field: str) -> None:
    now = time()
    if now - _last_warned.get(field, 0.0) < _DROP_LOG_INTERVAL:
        return
    _last_warned[field] = now
    codes = ' '.join(dict.fromkeys(f'U+{ord(c):04X}' for c in dropped))
    logger.warning(
        f'Removed {len(dropped)} XML-incompatible character(s) [{codes}] '
        f'from {field}: {source!r:.120}'
    )


def escape_xml_text(s: str, field: str) -> str:
    return html.escape(remove_control_characters(s, field))
