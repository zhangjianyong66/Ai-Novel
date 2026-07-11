from __future__ import annotations

import unittest

from app.services.memory_strategy import (
    DEEP_MEMORY_TOTAL_BUDGET_CHARS,
    resolve_memory_strategy,
)


class TestMemoryStrategy(unittest.TestCase):
    def test_off_disables_every_section_including_next_requirements(self) -> None:
        result = resolve_memory_strategy(
            memory_strategy="off",
            memory_injection_enabled=True,
            raw_modules={
                "worldbook": True,
                "tables": True,
                "next_requirements": True,
                "semantic_history": True,
                "foreshadow_open_loops": True,
                "vector_rag": True,
            },
        )

        self.assertFalse(result.enabled)
        self.assertEqual(result.strategy, "off")
        self.assertTrue(result.section_enabled)
        self.assertTrue(all(enabled is False for enabled in result.section_enabled.values()))
        self.assertFalse(result.section_enabled["next_requirements"])
        self.assertEqual(result.budget_overrides, {})

    def test_stable_uses_only_low_risk_context(self) -> None:
        result = resolve_memory_strategy(
            memory_strategy="stable",
            memory_injection_enabled=True,
            raw_modules={
                "story_memory": True,
                "structured": True,
                "semantic_history": True,
                "foreshadow_open_loops": True,
                "vector_rag": True,
                "graph": True,
                "fractal": True,
            },
        )

        self.assertTrue(result.enabled)
        self.assertEqual(result.strategy, "stable")
        self.assertEqual(
            {key for key, enabled in result.section_enabled.items() if enabled},
            {"worldbook", "tables", "next_requirements"},
        )
        self.assertEqual(result.budget_total_chars, None)

    def test_deep_defaults_to_history_foreshadows_and_vector_rag(self) -> None:
        result = resolve_memory_strategy(
            memory_strategy="deep",
            memory_injection_enabled=True,
            raw_modules={},
        )

        self.assertTrue(result.enabled)
        self.assertEqual(result.strategy, "deep")
        self.assertEqual(result.budget_total_chars, DEEP_MEMORY_TOTAL_BUDGET_CHARS)
        self.assertLessEqual(sum(result.budget_overrides.values()), DEEP_MEMORY_TOTAL_BUDGET_CHARS)
        self.assertTrue(result.section_enabled["worldbook"])
        self.assertTrue(result.section_enabled["tables"])
        self.assertTrue(result.section_enabled["next_requirements"])
        self.assertTrue(result.section_enabled["semantic_history"])
        self.assertTrue(result.section_enabled["foreshadow_open_loops"])
        self.assertTrue(result.section_enabled["vector_rag"])
        self.assertFalse(result.section_enabled["story_memory"])
        self.assertFalse(result.section_enabled["structured"])
        self.assertFalse(result.section_enabled["graph"])
        self.assertFalse(result.section_enabled["fractal"])

    def test_deep_advanced_modules_share_total_budget(self) -> None:
        result = resolve_memory_strategy(
            memory_strategy="deep",
            memory_injection_enabled=True,
            raw_modules={
                "story_memory": True,
                "structured": True,
                "graph": True,
                "fractal": True,
            },
        )

        for key in ["story_memory", "structured", "graph", "fractal"]:
            self.assertTrue(result.section_enabled[key])
            self.assertGreaterEqual(result.budget_overrides[key], 1000)

        self.assertLessEqual(sum(result.budget_overrides.values()), DEEP_MEMORY_TOTAL_BUDGET_CHARS)

    def test_missing_strategy_keeps_legacy_module_semantics(self) -> None:
        result = resolve_memory_strategy(
            memory_strategy=None,
            memory_injection_enabled=True,
            raw_modules={
                "worldbook": False,
                "story_memory": False,
                "tables": False,
                "semantic_history": True,
                "foreshadow_open_loops": True,
                "structured": True,
                "vector_rag": False,
                "graph": False,
                "fractal": False,
            },
        )

        self.assertTrue(result.enabled)
        self.assertEqual(result.strategy, "legacy")
        self.assertFalse(result.section_enabled["worldbook"])
        self.assertFalse(result.section_enabled["story_memory"])
        self.assertFalse(result.section_enabled["tables"])
        self.assertTrue(result.section_enabled["next_requirements"])
        self.assertTrue(result.section_enabled["semantic_history"])
        self.assertTrue(result.section_enabled["foreshadow_open_loops"])
        self.assertTrue(result.section_enabled["structured"])
        self.assertFalse(result.section_enabled["vector_rag"])


if __name__ == "__main__":
    unittest.main()
