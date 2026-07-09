from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.api.routes import memory
from app.services.generation_service import PreparedLlmCall, RecordedLlmResult


class _FakeScalarResult:
    def __init__(self, rows):  # type: ignore[no-untyped-def]
        self._rows = rows

    def all(self):  # type: ignore[no-untyped-def]
        return self._rows


class _FakeExecuteResult:
    def __init__(self, rows):  # type: ignore[no-untyped-def]
        self._rows = rows

    def scalars(self) -> _FakeScalarResult:
        return _FakeScalarResult(self._rows)


class _FakeDb:
    def __init__(self) -> None:
        self.entities = [
            SimpleNamespace(
                id="e_pan_yue",
                entity_type="character",
                name="潘越",
                summary_md="主角之一",
                updated_at=None,
            )
        ]

    def get(self, model, id_):  # type: ignore[no-untyped-def]
        return SimpleNamespace(id=id_, name="Project", genre=None, logline=None)

    def execute(self, stmt):  # type: ignore[no-untyped-def]
        return _FakeExecuteResult(self.entities)

    def close(self) -> None:
        pass


class TestMemoryAutoProposeLlmParams(unittest.TestCase):
    def _request(self):
        return SimpleNamespace(state=SimpleNamespace(request_id="req-1"))

    def _prepared_call(self, *, max_tokens: int) -> PreparedLlmCall:
        return PreparedLlmCall(
            provider="openai_compatible",
            model="deepseek-v4-flash",
            base_url="http://llm.local/v1",
            timeout_seconds=180,
            params={
                "temperature": 0.7,
                "top_p": 1.0,
                "max_tokens": max_tokens,
                "presence_penalty": 0.0,
                "frequency_penalty": 0.0,
                "top_k": None,
                "stop": [],
            },
            params_json='{"temperature": 0.7, "top_p": 1.0, "max_tokens": %d}' % max_tokens,
            extra={},
        )

    def test_auto_propose_keeps_configured_max_tokens(self) -> None:
        captured: list[PreparedLlmCall] = []

        def fake_call_llm_and_record(**kwargs):  # type: ignore[no-untyped-def]
            captured.append(kwargs["llm_call"])
            return RecordedLlmResult(
                text='{"title":"Memory","summary_md":"","ops":[]}',
                finish_reason="stop",
                latency_ms=1,
                dropped_params=[],
                run_id="run-1",
            )

        with patch.object(memory, "SessionLocal", return_value=_FakeDb()):
            with patch.object(
                memory,
                "require_chapter_editor",
                return_value=SimpleNamespace(
                    id="chapter-1",
                    project_id="project-1",
                    status="done",
                    number=1,
                    title="第1章",
                    plan="",
                    content_md="正文",
                ),
            ):
                with patch.object(
                    memory,
                    "_resolve_task_llm_for_call",
                    return_value=SimpleNamespace(api_key="sk-test", llm_call=self._prepared_call(max_tokens=9000)),
                ):
                    with patch.object(memory, "_ensure_default_preset_from_resource"):
                        with patch.object(
                            memory,
                            "render_preset_for_task",
                            return_value=("system", "user", None, None, None, None, {}),
                        ):
                            with patch.object(memory, "call_llm_and_record", side_effect=fake_call_llm_and_record):
                                with patch.object(
                                    memory,
                                    "propose_chapter_memory_change_set",
                                    return_value={"idempotent": False, "change_set": {"id": "cs-1"}, "items": []},
                                ):
                                    memory.auto_propose_chapter_memory_update(
                                        request=self._request(),
                                        chapter_id="chapter-1",
                                        body=memory.MemoryAutoProposeRequest(),
                                        user_id="local-user",
                                    )

        self.assertEqual(captured[0].params["max_tokens"], 9000)
        self.assertEqual(captured[0].params["temperature"], 0.2)

    def test_auto_propose_passes_existing_entities_to_prompt_values(self) -> None:
        captured_values: list[dict] = []

        def fake_render_preset_for_task(*args, **kwargs):  # type: ignore[no-untyped-def]
            captured_values.append(dict(kwargs["values"]))
            return ("system", "user", None, None, None, None, {})

        def fake_call_llm_and_record(**kwargs):  # type: ignore[no-untyped-def]
            return RecordedLlmResult(
                text='{"title":"Memory","summary_md":"","ops":[]}',
                finish_reason="stop",
                latency_ms=1,
                dropped_params=[],
                run_id="run-1",
            )

        with patch.object(memory, "SessionLocal", return_value=_FakeDb()):
            with patch.object(
                memory,
                "require_chapter_editor",
                return_value=SimpleNamespace(
                    id="chapter-1",
                    project_id="project-1",
                    status="done",
                    number=1,
                    title="第1章",
                    plan="",
                    content_md="正文",
                ),
            ):
                with patch.object(
                    memory,
                    "_resolve_task_llm_for_call",
                    return_value=SimpleNamespace(api_key="sk-test", llm_call=self._prepared_call(max_tokens=9000)),
                ):
                    with patch.object(memory, "_ensure_default_preset_from_resource"):
                        with patch.object(memory, "render_preset_for_task", side_effect=fake_render_preset_for_task):
                            with patch.object(memory, "call_llm_and_record", side_effect=fake_call_llm_and_record):
                                with patch.object(
                                    memory,
                                    "propose_chapter_memory_change_set",
                                    return_value={"idempotent": False, "change_set": {"id": "cs-1"}, "items": []},
                                ):
                                    memory.auto_propose_chapter_memory_update(
                                        request=self._request(),
                                        chapter_id="chapter-1",
                                        body=memory.MemoryAutoProposeRequest(),
                                        user_id="local-user",
                                    )

        self.assertEqual(captured_values[0]["existing_entities"][0]["id"], "e_pan_yue")
        self.assertEqual(captured_values[0]["existing_entities"][0]["entity_type"], "character")
        self.assertIn('"id":"e_pan_yue"', captured_values[0]["existing_entities_json"])


if __name__ == "__main__":
    unittest.main()
