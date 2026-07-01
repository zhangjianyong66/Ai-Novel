from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.utils import utc_now


class UserNotificationSettings(Base):
    __tablename__ = "user_notification_settings"

    user_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    browser_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    feishu_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    feishu_webhook_ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    feishu_webhook_masked: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
