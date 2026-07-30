from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.auth_dependencies import current_user
from app.services.auth_service import AuthError, login_with_password


router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(request: LoginRequest) -> dict[str, Any]:
    try:
        return login_with_password(request.email, request.password)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng") from exc


@router.get("/me")
def me(user: dict = Depends(current_user)) -> dict[str, Any]:
    return {"user": user}
