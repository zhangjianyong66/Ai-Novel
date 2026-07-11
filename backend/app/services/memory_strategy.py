from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

MemoryStrategy = Literal["off", "stable", "deep"]
ResolvedMemoryStrategyName = Literal["off", "stable", "deep", "legacy"]

DEEP_MEMORY_TOTAL_BUDGET_CHARS = 9000
_MIN_DEEP_SECTION_BUDGET_CHARS = 1000

_ALL_SECTIONS = (
    "worldbook",
    "story_memory",
    "next_requirements",
    "semantic_history",
    "foreshadow_open_loops",
    "structured",
    "tables",
    "vector_rag",
    "graph",
    "fractal",
)

_STABLE_MODULES: dict[str, bool] = {
    "worldbook": True,
    "story_memory": False,
    "next_requirements": True,
    "semantic_history": False,
    "foreshadow_open_loops": False,
    "structured": False,
    "tables": True,
    "vector_rag": False,
    "graph": False,
    "fractal": False,
}

_DEEP_DEFAULT_MODULES: dict[str, bool] = {
    **_STABLE_MODULES,
    "semantic_history": True,
    "foreshadow_open_loops": True,
    "vector_rag": True,
}

_LEGACY_DEFAULT_MODULES: dict[str, bool] = {
    "worldbook": True,
    "story_memory": True,
    "next_requirements": True,
    "semantic_history": False,
    "foreshadow_open_loops": False,
    "structured": True,
    "tables": True,
    "vector_rag": True,
    "graph": True,
    "fractal": True,
}

_DEEP_BUDGET_WEIGHTS: dict[str, float] = {
    "semantic_history": 3.0,
    "foreshadow_open_loops": 2.5,
    "vector_rag": 3.5,
    "graph": 2.0,
    "fractal": 2.0,
    "story_memory": 2.0,
    "structured": 2.0,
}


@dataclass(frozen=True)
class ResolvedMemoryStrategy:
    enabled: bool
    strategy: ResolvedMemoryStrategyName
    section_enabled: dict[str, bool]
    budget_overrides: dict[str, int]
    budget_total_chars: int | None
    budget_allocations: dict[str, int]


def _all_disabled() -> dict[str, bool]:
    return {section: False for section in _ALL_SECTIONS}


def _normalize_modules(raw_modules: dict[str, bool] | None) -> dict[str, bool]:
    raw = raw_modules or {}
    return {section: bool(raw.get(section, False)) for section in _ALL_SECTIONS}


def deep_memory_budget_overrides(section_enabled: dict[str, bool]) -> dict[str, int]:
    weighted_sections = [
        (section, weight)
        for section, weight in _DEEP_BUDGET_WEIGHTS.items()
        if bool(section_enabled.get(section, False))
    ]
    if not weighted_sections:
        return {}

    weight_total = sum(weight for _, weight in weighted_sections)
    budgets: dict[str, int] = {}
    remaining = DEEP_MEMORY_TOTAL_BUDGET_CHARS
    for idx, (section, weight) in enumerate(weighted_sections):
        if idx == len(weighted_sections) - 1:
            budget = remaining
        else:
            raw_budget = int(DEEP_MEMORY_TOTAL_BUDGET_CHARS * (weight / weight_total))
            budget = max(_MIN_DEEP_SECTION_BUDGET_CHARS, raw_budget)
            budget = min(budget, remaining)
        budgets[section] = budget
        remaining -= budget
    return {section: budget for section, budget in budgets.items() if budget > 0}


def resolve_memory_strategy(
    *,
    memory_strategy: MemoryStrategy | None,
    memory_injection_enabled: bool,
    raw_modules: dict[str, bool] | None,
) -> ResolvedMemoryStrategy:
    if memory_strategy == "off":
        return ResolvedMemoryStrategy(
            enabled=False,
            strategy="off",
            section_enabled=_all_disabled(),
            budget_overrides={},
            budget_total_chars=None,
            budget_allocations={},
        )

    if memory_strategy == "stable":
        modules = dict(_STABLE_MODULES)
        return ResolvedMemoryStrategy(
            enabled=True,
            strategy="stable",
            section_enabled=modules,
            budget_overrides={},
            budget_total_chars=None,
            budget_allocations={},
        )

    if memory_strategy == "deep":
        raw = _normalize_modules(raw_modules)
        modules = dict(_DEEP_DEFAULT_MODULES)
        for key in ("story_memory", "structured", "semantic_history", "foreshadow_open_loops", "vector_rag", "graph", "fractal"):
            if key in (raw_modules or {}):
                modules[key] = bool(raw.get(key, False))
        modules["worldbook"] = True
        modules["tables"] = True
        modules["next_requirements"] = True
        budget_overrides = deep_memory_budget_overrides(modules)
        return ResolvedMemoryStrategy(
            enabled=True,
            strategy="deep",
            section_enabled=modules,
            budget_overrides=budget_overrides,
            budget_total_chars=DEEP_MEMORY_TOTAL_BUDGET_CHARS,
            budget_allocations=dict(budget_overrides),
        )

    if not memory_injection_enabled:
        return ResolvedMemoryStrategy(
            enabled=False,
            strategy="legacy",
            section_enabled=_all_disabled(),
            budget_overrides={},
            budget_total_chars=None,
            budget_allocations={},
        )

    raw = raw_modules or {}
    modules = {
        section: bool(raw.get(section, default))
        for section, default in _LEGACY_DEFAULT_MODULES.items()
    }
    return ResolvedMemoryStrategy(
        enabled=True,
        strategy="legacy",
        section_enabled=modules,
        budget_overrides={},
        budget_total_chars=None,
        budget_allocations={},
    )
