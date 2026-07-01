from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.base import RequestModel


class UserNotificationSettingsOut(BaseModel):
    browser_enabled: bool
    feishu_enabled: bool
    feishu_webhook_configured: bool
    feishu_webhook_masked: str


class UserNotificationSettingsUpdate(RequestModel):
    browser_enabled: bool | None = None
    feishu_enabled: bool | None = None
    feishu_webhook_url: str | None = Field(default=None, max_length=2048)
