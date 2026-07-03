from __future__ import annotations

import logging
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.api.routes import chapters
from app.core.errors import AppError
from app.schemas.chapter_generate import ChapterGenerateRequest
from app.schemas.chapter_plan import ChapterPlanRequest
from app.services import generation_pipeline
from app.services.generation_pipeline import PlanStepResult
from app.services.generation_service import PreparedLlmCall, RecordedLlmResult


class _FakeDb:
    def __init__(self) -> None:
        self.project = SimpleNamespace(id="project-1", name="Project", genre="", logline="")
        self.settings = SimpleNamespace(
            world_setting="",
            style_guide="",
            constraints="",
            context_optimizer_enabled=False,
        )
        self.outline = SimpleNamespace(id="outline-1", content_md="")

    def get(self, model, id_):  # type: ignore[no-untyped-def]
        name = getattr(model, "__name__", "")
        if name == "Project":
            return self.project
        if name == "ProjectSettings":
            return self.settings
        if name == "Outline":
            return self.outline
        return None

    def close(self) -> None:
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):  # type: ignore[no-untyped-def]
        self.close()
        return False


class TestChapterPlanGenerationContract(unittest.TestCase):
    def _request(self):
        return SimpleNamespace(state=SimpleNamespace(request_id="req-1"), url=SimpleNamespace(path="/api/test"), method="POST")

    def _chapter(self):
        return SimpleNamespace(
            id="chapter-1",
            project_id="project-1",
            outline_id="outline-1",
            number=1,
            title="第一章",
            plan="",
            content_md="",
            summary="",
        )

    def _prepared_call(self, *, max_tokens: int | None = 12000) -> PreparedLlmCall:
        params = {
            "temperature": 0.7,
            "top_p": 1.0,
            "presence_penalty": 0.0,
            "frequency_penalty": 0.0,
            "top_k": None,
            "stop": [],
        }
        if max_tokens is not None:
            params["max_tokens"] = max_tokens
        return PreparedLlmCall(
            provider="openai_compatible",
            model="deepseek-v4-flash",
            base_url="http://llm.local/v1",
            timeout_seconds=180,
            params=params,
            params_json="{}",
            extra={},
        )

    def test_run_plan_llm_step_keeps_configured_max_tokens(self) -> None:
        captured: list[PreparedLlmCall] = []

        def fake_call_llm_and_record(**kwargs):  # type: ignore[no-untyped-def]
            captured.append(kwargs["llm_call"])
            return RecordedLlmResult(
                text="<plan>ok</plan>",
                finish_reason="stop",
                latency_ms=1,
                dropped_params=[],
                run_id="run-plan",
            )

        with patch.object(generation_pipeline, "call_llm_and_record", side_effect=fake_call_llm_and_record):
            result = generation_pipeline.run_plan_llm_step(
                logger=logging.getLogger("test"),
                request_id="req-1",
                actor_user_id="user-1",
                project_id="project-1",
                chapter_id="chapter-1",
                api_key="sk-test",
                llm_call=self._prepared_call(max_tokens=12000),
                prompt_system="system",
                prompt_user="user",
                prompt_messages=[],
                prompt_render_log_json=None,
            )

        self.assertEqual(result.parse_error, None)
        self.assertEqual(captured[0].params["temperature"], 0.2)
        self.assertEqual(captured[0].params["max_tokens"], 12000)

    def test_run_plan_llm_step_uses_default_when_max_tokens_missing(self) -> None:
        captured: list[PreparedLlmCall] = []

        def fake_call_llm_and_record(**kwargs):  # type: ignore[no-untyped-def]
            captured.append(kwargs["llm_call"])
            return RecordedLlmResult(
                text="<plan>ok</plan>",
                finish_reason="stop",
                latency_ms=1,
                dropped_params=[],
                run_id="run-plan",
            )

        with patch.object(generation_pipeline, "call_llm_and_record", side_effect=fake_call_llm_and_record):
            with patch.object(generation_pipeline, "default_max_tokens", return_value=8192):
                generation_pipeline.run_plan_llm_step(
                    logger=logging.getLogger("test"),
                    request_id="req-1",
                    actor_user_id="user-1",
                    project_id="project-1",
                    chapter_id="chapter-1",
                    api_key="sk-test",
                    llm_call=self._prepared_call(max_tokens=None),
                    prompt_system="system",
                    prompt_user="user",
                    prompt_messages=[],
                    prompt_render_log_json=None,
                )

        self.assertEqual(captured[0].params["temperature"], 0.2)
        self.assertEqual(captured[0].params["max_tokens"], 8192)

    def test_plan_chapter_raises_when_plan_parse_fails(self) -> None:
        with patch.object(chapters, "SessionLocal", return_value=_FakeDb()):
            with patch.object(chapters, "require_chapter_editor", return_value=self._chapter()):
                with patch.object(
                    chapters,
                    "_resolve_task_llm_for_call",
                    return_value=SimpleNamespace(api_key="sk-test", llm_call=self._prepared_call()),
                ):
                    with patch.object(chapters, "ensure_default_plan_preset"):
                        with patch.object(chapters, "_load_previous_chapter_context", return_value=("", "")):
                            with patch.object(chapters, "render_preset_for_task", return_value=("system", "user", [], None, None, None, {})):
                                with patch.object(
                                    chapters,
                                    "run_plan_llm_step",
                                    return_value=PlanStepResult(
                                        plan_out={"plan": "", "raw_output": "<plan>broken"},
                                        warnings=[],
                                        parse_error={"code": "TAG_PARSE_ERROR", "message": "未找到 <plan>...</plan> 标签块"},
                                        finish_reason="length",
                                    ),
                                ):
                                    with self.assertRaises(AppError) as cm:
                                        chapters.plan_chapter(
                                            request=self._request(),
                                            chapter_id="chapter-1",
                                            body=ChapterPlanRequest(),
                                            user_id="user-1",
                                        )

        self.assertEqual(cm.exception.code, "PLAN_PARSE_ERROR")
        self.assertEqual(cm.exception.details.get("parse_error", {}).get("code"), "TAG_PARSE_ERROR")

    def test_generate_chapter_stops_when_plan_parse_fails(self) -> None:
        generate_called = False

        def fake_generate(**kwargs):  # type: ignore[no-untyped-def]
            nonlocal generate_called
            generate_called = True
            raise AssertionError("chapter generation should not run after plan parse failure")

        with patch.object(chapters, "SessionLocal", return_value=_FakeDb()):
            with patch.object(chapters, "require_chapter_editor", return_value=self._chapter()):
                with patch.object(
                    chapters,
                    "_resolve_task_llm_for_call",
                    return_value=SimpleNamespace(api_key="sk-test", llm_call=self._prepared_call()),
                ):
                    with patch.object(chapters, "build_chapter_generate_render_values", return_value=({}, "instruction", {}, {})):
                        with patch.object(chapters, "_prepare_chapter_memory_injection") as prep:
                            prep.return_value = SimpleNamespace(
                                memory_pack=None,
                                memory_injection_config={},
                                memory_retrieval_log_json={},
                            )
                            with patch.object(chapters, "run_mcp_research_step", return_value=SimpleNamespace(context_md="", warnings=[], applied=False, tool_runs=[])):
                                with patch.object(chapters, "ensure_default_plan_preset"):
                                    with patch.object(chapters, "render_preset_for_task", return_value=("system", "user", [], None, None, None, {})):
                                        with patch.object(
                                            chapters,
                                            "run_plan_llm_step",
                                            return_value=PlanStepResult(
                                                plan_out={"plan": "", "raw_output": "<plan>broken"},
                                                warnings=[],
                                                parse_error={"code": "TAG_PARSE_ERROR", "message": "未找到 <plan>...</plan> 标签块"},
                                                finish_reason="length",
                                            ),
                                        ):
                                            with patch.object(chapters, "run_chapter_generate_llm_step", side_effect=fake_generate):
                                                with self.assertRaises(AppError) as cm:
                                                    chapters.generate_chapter(
                                                        request=self._request(),
                                                        chapter_id="chapter-1",
                                                        body=ChapterGenerateRequest(mode="replace", plan_first=True),
                                                        user_id="user-1",
                                                    )

        self.assertFalse(generate_called)
        self.assertEqual(cm.exception.code, "PLAN_PARSE_ERROR")

    def test_generate_stream_stops_when_plan_parse_fails(self) -> None:
        generate_called = False

        def fake_stream_messages(**kwargs):  # type: ignore[no-untyped-def]
            nonlocal generate_called
            generate_called = True
            raise AssertionError("stream generation should not run after plan parse failure")

        with patch.object(chapters, "SessionLocal", return_value=_FakeDb()):
            with patch.object(chapters, "require_chapter_editor", return_value=self._chapter()):
                with patch.object(
                    chapters,
                    "_resolve_task_llm_for_call",
                    return_value=SimpleNamespace(api_key="sk-test", llm_call=self._prepared_call()),
                ):
                    with patch.object(chapters, "build_chapter_generate_render_values", return_value=({}, "instruction", {}, {})):
                        with patch.object(chapters, "_prepare_chapter_memory_injection") as prep:
                            prep.return_value = SimpleNamespace(
                                memory_pack=None,
                                memory_injection_config={},
                                memory_retrieval_log_json={},
                            )
                            with patch.object(chapters, "run_mcp_research_step", return_value=SimpleNamespace(context_md="", warnings=[], applied=False, tool_runs=[])):
                                with patch.object(chapters, "ensure_default_plan_preset"):
                                    with patch.object(chapters, "render_preset_for_task", return_value=("system", "user", [], None, None, None, {})):
                                        with patch.object(
                                            chapters,
                                            "run_plan_llm_step",
                                            return_value=PlanStepResult(
                                                plan_out={"plan": "", "raw_output": "<plan>broken"},
                                                warnings=[],
                                                parse_error={"code": "TAG_PARSE_ERROR", "message": "未找到 <plan>...</plan> 标签块"},
                                                finish_reason="length",
                                            ),
                                        ):
                                            with patch.object(chapters, "call_llm_stream_messages", side_effect=fake_stream_messages):
                                                response = chapters.generate_chapter_stream(
                                                    request=self._request(),
                                                    chapter_id="chapter-1",
                                                    body=ChapterGenerateRequest(mode="replace", plan_first=True),
                                                    user_id="user-1",
                                                )
                                                async def collect_body() -> str:
                                                    chunks: list[str] = []
                                                    async for chunk in response.body_iterator:
                                                        chunks.append(chunk.decode() if isinstance(chunk, bytes) else str(chunk))
                                                    return "".join(chunks)

                                                body = asyncio.run(collect_body())

        self.assertFalse(generate_called)
        self.assertIn("event: error", body)
        self.assertIn("PLAN_PARSE_ERROR", body)
        self.assertNotIn("将继续生成", body)


if __name__ == "__main__":
    unittest.main()
