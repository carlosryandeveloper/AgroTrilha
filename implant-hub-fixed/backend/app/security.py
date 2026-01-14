from fastapi import Header
from typing import Optional

def get_actor_user_id(
    x_user_id: Optional[int] = Header(default=None, alias="X-User-Id")
) -> Optional[int]:
    return x_user_id
