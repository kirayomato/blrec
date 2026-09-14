"""SEND_GIFT_V2（protobuf 协议）消息模型。

字段号取自社区公开的 proto 定义（``GiftMessage`` / ``SendGiftBroadcast``），
并已用线上真实样本逐条校验：

- ``gift_id`` 与消息内 ``batch:gift:combo_id`` 中的礼物 ID 一致；
- ``timestamp`` 与 combo_id 后缀一致，且与消息到达时刻吻合；
- ``total_coin == price * num`` 自洽。

发送者未登录时 ``uid`` 为 0、``uname`` 被服务端打码（如 ``云***``），
与旧的 ``SEND_GIFT`` 行为一致。
"""

import base64
from dataclasses import dataclass, field
from typing import Annotated, List

from pure_protobuf.annotations import Field
from pure_protobuf.message import BaseMessage

__all__ = (
    'SendGiftV2',
    'SendGiftV2BlindGift',
    'SendGiftV2Gift',
    'SendGiftV2GiftInfo',
    'SendGiftV2MedalInfo',
)


@dataclass
class SendGiftV2MedalInfo(BaseMessage):
    """发送者的粉丝勋章信息。"""

    target_id: Annotated[int, Field(1)] = 0
    """勋章所属主播的 UID"""
    anchor_roomid: Annotated[int, Field(4)] = 0
    """勋章所属直播间 ID，未登录时为 0"""
    medal_level: Annotated[int, Field(5)] = 0
    medal_name: Annotated[str, Field(6)] = ''


@dataclass
class SendGiftV2BlindGift(BaseMessage):
    """盲盒信息，盲盒礼物的真实礼物在此处。"""

    original_gift_name: Annotated[str, Field(3)] = ''
    original_gift_price: Annotated[int, Field(6)] = 0


@dataclass
class SendGiftV2GiftInfo(BaseMessage):
    """礼物物料信息。"""

    img_basic: Annotated[str, Field(1)] = ''


@dataclass
class SendGiftV2Gift(BaseMessage):
    """一个礼物条目，对应旧的 ``SEND_GIFT`` 单条消息。"""

    gift_id: Annotated[int, Field(1)] = 0
    gift_name: Annotated[str, Field(2)] = ''
    num: Annotated[int, Field(3)] = 0
    """该次投喂的礼物数量"""
    gift_type: Annotated[int, Field(4)] = 0
    price: Annotated[int, Field(5)] = 0
    """礼物单价，单位金瓜子（1000 金瓜子 = 1 元）"""
    total_coin: Annotated[int, Field(7)] = 0
    """实付总瓜子数，一般等于 ``price * num``"""
    coin_type: Annotated[str, Field(8)] = ''
    """``silver`` 或 ``gold``"""
    tid: Annotated[str, Field(9)] = ''
    timestamp: Annotated[int, Field(10)] = 0
    """送礼时刻的秒级时间戳"""
    rnd: Annotated[str, Field(12)] = ''
    action: Annotated[str, Field(18)] = ''
    """礼物操作，如 ``投喂``"""
    gift_info: Annotated[SendGiftV2GiftInfo, Field(35)] = field(
        default_factory=SendGiftV2GiftInfo
    )


@dataclass
class SendGiftV2(BaseMessage):
    """``SEND_GIFT_V2`` 的 protobuf 负载。

    这是一条「批量广播」：一次可能携带多个礼物（``gift_list``）。
    """

    uid: Annotated[int, Field(1)] = 0
    uname: Annotated[str, Field(2)] = ''
    face: Annotated[str, Field(3)] = ''
    guard_level: Annotated[int, Field(5)] = 0
    """0 非舰队，1 总督，2 提督，3 舰长"""
    medal_info: Annotated[SendGiftV2MedalInfo, Field(8)] = field(
        default_factory=SendGiftV2MedalInfo
    )
    blind_gift: Annotated[SendGiftV2BlindGift, Field(9)] = field(
        default_factory=SendGiftV2BlindGift
    )
    gift_list: Annotated[List[SendGiftV2Gift], Field(10)] = field(default_factory=list)

    @classmethod
    def from_pb(cls, pb: str) -> 'SendGiftV2':
        """解析 ``data['pb']``：base64 编码的 protobuf 负载。"""
        return cls.loads(base64.b64decode(pb))
