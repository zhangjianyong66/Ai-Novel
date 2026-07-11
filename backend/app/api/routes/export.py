from __future__ import annotations

import json
import re
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Query, Request, Response
from sqlalchemy import select

from app.api.deps import DbDep, UserIdDep, require_project_editor, require_project_viewer
from app.models.chapter import Chapter
from app.models.character import Character
from app.models.outline import Outline
from app.models.project_settings import ProjectSettings
from app.services.import_export_service import export_project_bundle

router = APIRouter()


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value not in ("0", "false", "False", "FALSE", "")


def _safe_filename(name: str) -> str:
    name = name.strip() or "ainovel"
    name = re.sub(r"[\\\\/:*?\"<>|]+", "_", name)
    return name[:80]


def _download_timestamp() -> str:
    return datetime.now().strftime("%Y%m%d%H%M%S")


def _download_filenames(base_name: str, suffix: str) -> tuple[str, str]:
    base_utf8 = _safe_filename(base_name)
    timestamp = _download_timestamp()
    filename_utf8 = f"{base_utf8}_{timestamp}{suffix}"
    base_ascii = re.sub(r"[^A-Za-z0-9._-]+", "_", base_utf8).strip("._-") or "ainovel"
    filename_ascii = f"{base_ascii}_{timestamp}{suffix}"
    return filename_utf8, filename_ascii


def _active_outline_for_export(db: DbDep, *, project_id: str, active_outline_id: str | None) -> Outline | None:
    active_outline = db.get(Outline, active_outline_id) if active_outline_id else None
    if active_outline is not None:
        return active_outline
    return (
        db.execute(select(Outline).where(Outline.project_id == project_id).order_by(Outline.updated_at.desc()).limit(1))
        .scalars()
        .first()
    )


def _chapter_rows_for_export(db: DbDep, *, project_id: str, outline_id: str | None, chapters: str) -> list[Chapter]:
    if not outline_id:
        return []
    q = (
        select(Chapter)
        .where(Chapter.project_id == project_id, Chapter.outline_id == outline_id)
        .order_by(Chapter.number.asc())
    )
    if chapters == "done":
        q = q.where(Chapter.status == "done")
    return list(db.execute(q).scalars().all())


def _content_disposition_headers(request: Request, *, base_name: str, suffix: str) -> dict[str, str]:
    filename_utf8, filename_ascii = _download_filenames(base_name, suffix)
    quoted = quote(filename_utf8)
    return {
        "Content-Disposition": f"attachment; filename=\"{filename_ascii}\"; filename*=UTF-8''{quoted}",
        "X-Request-Id": request.state.request_id,
    }


def _build_txt_content(*, project_name: str, chapter_rows: list[Chapter]) -> str:
    parts: list[str] = [f"《{project_name}》", ""]
    if not chapter_rows:
        parts.append("（无章节）")
        return "\n".join(parts).rstrip() + "\n"

    for ch in chapter_rows:
        title = ch.title or ""
        parts.append(f"第{ch.number}章 {title}".rstrip())
        parts.append("")
        parts.append(ch.content_md if ch.content_md else "（空）")
        parts.append("")

    return "\n".join(parts).rstrip() + "\n"


@router.get("/projects/{project_id}/export/markdown")
def export_markdown(
    request: Request,
    db: DbDep,
    user_id: UserIdDep,
    project_id: str,
    include_settings: str | None = Query(default="1"),
    include_characters: str | None = Query(default="1"),
    include_outline: str | None = Query(default="1"),
    chapters: str = Query(default="all"),
) -> Response:
    project = require_project_viewer(db, project_id=project_id, user_id=user_id)
    active_outline = _active_outline_for_export(db, project_id=project_id, active_outline_id=project.active_outline_id)

    parts: list[str] = [f"# {project.name}", ""]
    if project.genre or project.logline:
        if project.genre:
            parts.append(f"- 类型：{project.genre}")
        if project.logline:
            parts.append(f"- Logline：{project.logline}")
        parts.append("")

    if _as_bool(include_settings, True):
        settings_row = db.get(ProjectSettings, project_id)
        parts.append("## 设定")
        parts.append("")
        parts.append("### 世界观")
        parts.append((settings_row.world_setting if settings_row else "") or "")
        parts.append("")
        parts.append("### 风格")
        parts.append((settings_row.style_guide if settings_row else "") or "")
        parts.append("")
        parts.append("### 约束")
        parts.append((settings_row.constraints if settings_row else "") or "")
        parts.append("")

    if _as_bool(include_characters, True):
        rows = (
            db.execute(select(Character).where(Character.project_id == project_id).order_by(Character.name.asc()))
            .scalars()
            .all()
        )
        parts.append("## 角色卡")
        parts.append("")
        if not rows:
            parts.append("_（无）_")
            parts.append("")
        for c in rows:
            parts.append(f"### {c.name}")
            if c.role:
                parts.append(f"- 角色：{c.role}")
            if c.profile:
                parts.append("")
                parts.append(c.profile)
            if c.notes:
                parts.append("")
                parts.append("**备注**：")
                parts.append(c.notes)
            parts.append("")

    if _as_bool(include_outline, True):
        parts.append("## 大纲")
        parts.append("")
        parts.append((active_outline.content_md if active_outline else "") or "")
        parts.append("")

    parts.append("## 正文")
    parts.append("")
    chapter_rows = _chapter_rows_for_export(
        db,
        project_id=project_id,
        outline_id=active_outline.id if active_outline else None,
        chapters=chapters,
    )
    if not chapter_rows:
        parts.append("_（无章节）_")
        parts.append("")
    for ch in chapter_rows:
        title = ch.title or ""
        parts.append(f"### 第{ch.number}章 {title}".rstrip())
        parts.append("")
        if ch.content_md:
            parts.append(ch.content_md)
        else:
            parts.append("_（空）_")
        parts.append("")

    content = "\n".join(parts).rstrip() + "\n"

    headers = _content_disposition_headers(request, base_name=project.name, suffix=".md")
    return Response(content=content, media_type="text/markdown; charset=utf-8", headers=headers)


@router.get("/projects/{project_id}/export/txt")
def export_txt(
    request: Request,
    db: DbDep,
    user_id: UserIdDep,
    project_id: str,
    chapters: str = Query(default="all"),
) -> Response:
    project = require_project_viewer(db, project_id=project_id, user_id=user_id)
    active_outline = _active_outline_for_export(db, project_id=project_id, active_outline_id=project.active_outline_id)
    chapter_rows = _chapter_rows_for_export(
        db,
        project_id=project_id,
        outline_id=active_outline.id if active_outline else None,
        chapters=chapters,
    )

    content = _build_txt_content(project_name=project.name, chapter_rows=chapter_rows)

    headers = _content_disposition_headers(request, base_name=project.name, suffix=".txt")
    return Response(content=content, media_type="text/plain; charset=utf-8", headers=headers)


@router.get("/projects/{project_id}/export/bundle")
def export_bundle(request: Request, db: DbDep, user_id: UserIdDep, project_id: str) -> Response:
    project = require_project_editor(db, project_id=project_id, user_id=user_id)
    export_obj = export_project_bundle(db, project_id=project_id)

    payload = json.dumps(export_obj, ensure_ascii=False, indent=2) + "\n"

    headers = _content_disposition_headers(request, base_name=project.name, suffix=".bundle.json")
    return Response(content=payload.encode("utf-8"), media_type="application/json; charset=utf-8", headers=headers)
