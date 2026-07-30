from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.services.auth_service import AuthError, get_user_by_token


ROLE_LOGIN_ENABLED = False
LOCAL_OWNER_USER = {
    "id": "local-owner",
    "email": "local@attendance-system",
    "role": "owner",
    "display_name": "Local",
    "allowed_factories": ["factory1", "factory2"],
}


def current_user(authorization: Annotated[str | None, Header()] = None) -> dict:
    if not ROLE_LOGIN_ENABLED:
        return LOCAL_OWNER_USER

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bạn cần đăng nhập")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bạn cần đăng nhập")
    try:
        return get_user_by_token(token)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ") from exc


def require_owner(user: dict = Depends(current_user)) -> dict:
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Tài khoản nhân viên không có quyền mở dữ liệu của chủ")
    return user


def require_staff_or_owner(user: dict = Depends(current_user)) -> dict:
    if user.get("role") not in {"owner", "staff"}:
        raise HTTPException(status_code=403, detail="Tài khoản không có quyền")
    return user
