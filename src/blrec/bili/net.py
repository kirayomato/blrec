import os
import socket
from functools import lru_cache

import aiohttp
import requests

__all__ = ('get_connector', 'timeout')

USE_IPV4_ONLY = bool(os.environ.get('BLREC_IPV4'))

if not USE_IPV4_ONLY:
    family = 0
else:
    requests.packages.urllib3.util.connection.HAS_IPV6 = False  # type: ignore
    family = socket.AF_INET

timeout = aiohttp.ClientTimeout(total=10)


@lru_cache(maxsize=1)
def get_connector() -> aiohttp.TCPConnector:
    return aiohttp.TCPConnector(family=family, limit=200)
