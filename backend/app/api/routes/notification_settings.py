from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.deps import DbDep, UserIdDep
from app.core.errors import AppError, ok_payload
from app.core.secrets import SecretCryptoError, encrypt_secret, mask_api_key
from app.models.user_notification_settings import UserNotificationSettings
from app.schemas.notification_settings import UserNotificationSettingsOut, UserNotificationSettingsUpdate

router = APIRouter()


def _mask_webhook_url(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if len(raw) <= 12:
        return "****"
    return f"{raw[:8]}****{raw[-4:]}"


def _settings_out(row: UserNotificationSettings | None) -> dict:
    return UserNotificationSettingsOut(
        browser_enabled=bool(getattr(row, "browser_enabled", False)) if row is not None else False,
        feishu_enabled=bool(getattr(row, "feishu_enabled", False)) if row is not None else False,
        feishu_webhook_configured=bool(str(getattr(row, "feishu_webhook_ciphertext", "") or "").strip()) if row is not None else False,
        feishu_webhook_masked=(getattr(row, "feishu_webhook_masked", None) or "") if row is not None else "",
    ).model_dump()


@router.get("/me/notification-settings")
def get_notification_settings(request: Request, db: DbDep, user_id: UserIdDep) -> dict:
    row = db.get(UserNotificationSettings, user_id)
    return ok_payload(request_id=request.state.request_id, data={"settings": _settings_out(row)})


@router.put("/me/notification-settings")
def put_notification_settings(request: Request, db: DbDep, user_id: UserIdDep, body: UserNotificationSettingsUpdate) -> dict:
    row = db.get(UserNotificationSettings, user_id)
    if row is None:
        row = UserNotificationSettings(user_id=user_id)
        db.add(row)

    if "browser_enabled" in body.model_fields_set and body.browser_enabled is not None:
        row.browser_enabled = bool(body.browser_enabled)
    if "feishu_enabled" in body.model_fields_set and body.feishu_enabled is not None:
        row.feishu_enabled = bool(body.feishu_enabled)

    if "feishu_webhook_url" in body.model_fields_set:
        raw = str(body.feishu_webhook_url or "").strip()
        if not raw:
            row.feishu_webhook_ciphertext = None
            row.feishu_webhook_masked = None
        else:
            if not (raw.startswith("https://") or raw.startswith("http://")):
                raise AppError.validation(message="飞书 Webhook URL 必须以 http:// 或 https:// 开头")
            try:
                row.feishu_webhook_ciphertext = encrypt_secret(raw)
            except SecretCryptoError as exc:
                raise AppError.validation(message=str(exc), details={"field": "feishu_webhook_url"}) from exc
            row.feishu_webhook_masked = _mask_webhook_url(raw) or mask_api_key(raw)

    db.commit()
    db.refresh(row)
    return ok_payload(request_id=request.state.request_id, data={"settings": _settings_out(row)})
