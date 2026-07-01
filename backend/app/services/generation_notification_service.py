from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Literal

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.logging import exception_log_fields, log_event
from app.core.secrets import SecretCryptoError, decrypt_secret
from app.models.user_notification_settings import UserNotificationSettings

logger = logging.getLogger("ainovel")

GenerationNotificationStatus = Literal["success", "failed"]


@dataclass(frozen=True, slots=True)
class GenerationNotificationEvent:
    actor_user_id: str
    project_id: str
    chapter_id: str | None
    generation_run_id: str
    task_type: str
    status: GenerationNotificationStatus
    request_id: str
    error_message: str | None = None


def notify_generation_finished(db: Session, *, event: GenerationNotificationEvent) -> None:
    try:
        settings_row = db.get(UserNotificationSettings, event.actor_user_id)
    except SQLAlchemyError as exc:
        log_event(
            logger,
            "warning",
            event="GENERATION_NOTIFICATION_SETTINGS_LOOKUP_FAILED",
            actor_user_id=event.actor_user_id,
            generation_run_id=event.generation_run_id,
            **exception_log_fields(exc),
        )
        return
    if settings_row is None or not bool(settings_row.feishu_enabled):
        return
    ciphertext = str(settings_row.feishu_webhook_ciphertext or "").strip()
    if not ciphertext:
        return

    try:
        webhook_url = decrypt_secret(ciphertext)
    except SecretCryptoError as exc:
        log_event(
            logger,
            "warning",
            event="GENERATION_NOTIFICATION_FEISHU_DECRYPT_FAILED",
            actor_user_id=event.actor_user_id,
            generation_run_id=event.generation_run_id,
            **exception_log_fields(exc),
        )
        return

    try:
        _send_feishu_webhook(webhook_url, event=event)
    except Exception as exc:
        log_event(
            logger,
            "warning",
            event="GENERATION_NOTIFICATION_FEISHU_SEND_FAILED",
            actor_user_id=event.actor_user_id,
            generation_run_id=event.generation_run_id,
            **exception_log_fields(exc),
        )


def notify_generation_finished_fail_soft(db: Session, *, event: GenerationNotificationEvent) -> None:
    try:
        notify_generation_finished(db, event=event)
    except Exception as exc:
        log_event(
            logger,
            "warning",
            event="GENERATION_NOTIFICATION_FAILED",
            actor_user_id=event.actor_user_id,
            generation_run_id=event.generation_run_id,
            **exception_log_fields(exc),
        )


def _send_feishu_webhook(webhook_url: str, *, event: GenerationNotificationEvent) -> None:
    import httpx

    status_text = "成功" if event.status == "success" else "失败"
    lines = [
        f"AI 生成{status_text}",
        f"任务：{event.task_type}",
        f"项目：{event.project_id}",
        f"运行：{event.generation_run_id}",
        f"请求：{event.request_id}",
    ]
    if event.chapter_id:
        lines.append(f"章节：{event.chapter_id}")
    if event.error_message:
        lines.append(f"错误：{event.error_message[:300]}")

    payload = {"msg_type": "text", "content": {"text": "\n".join(lines)}}
    with httpx.Client(timeout=5.0) as client:
        resp = client.post(webhook_url, content=json.dumps(payload, ensure_ascii=False).encode("utf-8"), headers={"Content-Type": "application/json"})
        resp.raise_for_status()
