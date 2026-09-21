from fastapi import APIRouter, Query

from ...application import Application
from ...bili.helpers import generate_qr_code, poll_qr_code
from ..schemas import ResponseMessage

app: Application = None  # type: ignore  # bypass flake8 F821

router = APIRouter(prefix='/api/v1/login', tags=['login'])


@router.get('/qrcode/generate', response_model=ResponseMessage)
async def generate_qrcode() -> ResponseMessage:
    """Request a login QR code, return the key used to poll the login state"""
    qrcode_key, url = await generate_qr_code()
    return ResponseMessage(
        code=0, message='ok', data={'qrcode_key': qrcode_key, 'url': url}
    )


@router.get('/qrcode/poll', response_model=ResponseMessage)
async def poll_qrcode(
    qrcode_key: str = Query(..., alias='qrcodeKey'),
) -> ResponseMessage:
    """Poll the login state of a QR code

    ``data.status`` is one of ``pending``, ``scanned``, ``succeeded``,
    ``expired``, and ``data.cookie`` is only present when it succeeded.
    """
    code, cookie, message = await poll_qr_code(qrcode_key)
    if code == -1:
        return ResponseMessage(code=code, message=message)
    return ResponseMessage(
        code=0,
        message='ok',
        data={'status': _status_of(code), 'cookie': cookie},
    )


def _status_of(code: int) -> str:
    if code == 0:
        return 'succeeded'
    elif code == 86090:
        return 'scanned'
    elif code == 86038:
        return 'expired'
    else:
        return 'pending'
