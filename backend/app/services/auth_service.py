from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.db.utils import new_id, utc_now
from app.models.user import User
from app.models.user_password import UserPassword

_LOGIN_NAME_RE = re.compile(r"^[a-z0-9_-]{1,64}$")


def normalize_login_name(value: str) -> str:
    return str(value or "").strip().lower()


def validate_login_name(value: str) -> str:
    login_name = normalize_login_name(value)
    if not login_name:
        raise AppError.validation("登录用户名不能为空")
    if len(login_name) > 64:
        raise AppError.validation("登录用户名长度不能超过 64 位")
    if not _LOGIN_NAME_RE.fullmatch(login_name):
        raise AppError.validation("登录用户名只能包含小写字母、数字、下划线和短横线")
    return login_name


def get_user_by_login_name(db: Session, login_name: str) -> User | None:
    normalized = normalize_login_name(login_name)
    if not normalized:
        return None
    return db.execute(select(User).where(User.login_name == normalized).limit(1)).scalars().first()


def new_user_id(db: Session) -> str:
    for _ in range(8):
        candidate = new_id()
        if db.get(User, candidate) is None:
            return candidate
    raise AppError(code="USER_ID_GENERATION_FAILED", message="生成用户 ID 失败", status_code=500)


def hash_password(password: str) -> str:
    raw = (password or "").strip()
    if len(raw) < 8:
        raise AppError.validation("密码长度至少 8 位")

    import bcrypt

    salt = bcrypt.gensalt(rounds=settings.auth_bcrypt_rounds)
    hashed = bcrypt.hashpw(raw.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    raw = (password or "").strip()
    if not raw:
        return False
    if not password_hash:
        return False
    try:
        import bcrypt

        return bcrypt.checkpw(raw.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def ensure_admin_user(db: Session) -> None:
    admin_user_id = settings.auth_admin_user_id
    admin_password = settings.auth_admin_password
    if not admin_user_id or not admin_password:
        return

    user = db.get(User, admin_user_id)
    if user is None:
        user = User(
            id=admin_user_id,
            login_name=validate_login_name(admin_user_id),
            email=settings.auth_admin_email,
            display_name=settings.auth_admin_display_name or "管理员",
            is_admin=True,
        )
        db.add(user)
    else:
        if not getattr(user, "login_name", None):
            user.login_name = validate_login_name(admin_user_id)
        user.is_admin = True
        if settings.auth_admin_email and not user.email:
            user.email = settings.auth_admin_email
        if settings.auth_admin_display_name and not user.display_name:
            user.display_name = settings.auth_admin_display_name

    pwd = db.get(UserPassword, admin_user_id)
    if pwd is None:
        pwd = UserPassword(
            user_id=admin_user_id,
            password_hash=hash_password(admin_password),
            password_updated_at=utc_now(),
            disabled_at=None,
        )
        db.add(pwd)

    db.commit()
