import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.services.cloud_sync import REQUEST_TIMEOUT_SECONDS, get_cloud_config


class AuthError(RuntimeError):
    pass


def login_with_password(email: str, password: str) -> dict[str, Any]:
    config = _auth_config()
    response = _auth_request(
        config,
        "POST",
        "/auth/v1/token?grant_type=password",
        body={"email": email.strip(), "password": password},
        bearer=config["service_role_key"],
    )
    user = _user_payload(response.get("user") or {})
    return {
        "access_token": response.get("access_token"),
        "refresh_token": response.get("refresh_token"),
        "expires_in": response.get("expires_in"),
        "token_type": response.get("token_type"),
        "user": user,
    }


def get_user_by_token(token: str) -> dict[str, Any]:
    config = _auth_config()
    response = _auth_request(config, "GET", "/auth/v1/user", bearer=token)
    return _user_payload(response)


def _user_payload(user: dict[str, Any]) -> dict[str, Any]:
    metadata = user.get("user_metadata") or {}
    role = str(metadata.get("role") or "").strip().lower()
    if role not in {"owner", "staff"}:
        role = "staff"
    allowed_factories = metadata.get("allowed_factories")
    if not isinstance(allowed_factories, list):
        allowed_factories = ["factory1", "factory2"]
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "role": role,
        "display_name": metadata.get("display_name") or user.get("email") or "",
        "allowed_factories": allowed_factories,
    }


def _auth_config() -> dict[str, str]:
    config = get_cloud_config(include_secret=True)
    url = str(config.get("supabase_url") or "").rstrip("/")
    key = str(config.get("service_role_key") or "").strip()
    if not url or not key:
        raise AuthError("Chưa cấu hình Supabase để đăng nhập")
    return {"supabase_url": url, "service_role_key": key}


def _auth_request(
    config: dict[str, str],
    method: str,
    path: str,
    body: Any | None = None,
    bearer: str | None = None,
) -> Any:
    headers = {
        "apikey": config["service_role_key"],
        "Authorization": f"Bearer {bearer or config['service_role_key']}",
        "Content-Type": "application/json",
    }
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(f"{config['supabase_url']}{path}", data=data, method=method, headers=headers)
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            text = response.read().decode("utf-8")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise AuthError(f"Supabase Auth lỗi HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise AuthError(f"Không kết nối được Supabase Auth: {exc.reason}") from exc

    if not text:
        return None
    return json.loads(text)
