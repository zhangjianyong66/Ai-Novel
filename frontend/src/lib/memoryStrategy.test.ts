import { describe, expect, it } from "vitest";

import {
  DEEP_MEMORY_TOTAL_BUDGET_CHARS,
  DEFAULT_MEMORY_STRATEGY,
  deepMemoryBudgetOverrides,
  isMemoryEnabled,
  resolveMemoryModulesForStrategy,
} from "./memoryStrategy";

describe("memoryStrategy", () => {
  it("defaults to stable generation", () => {
    expect(DEFAULT_MEMORY_STRATEGY).toBe("stable");
    expect(isMemoryEnabled("stable")).toBe(true);
  });

  it("turns off every memory module for off mode", () => {
    const modules = resolveMemoryModulesForStrategy("off", {
      worldbook: true,
      story_memory: true,
      semantic_history: true,
      foreshadow_open_loops: true,
      structured: true,
      tables: true,
      vector_rag: true,
      graph: true,
      fractal: true,
    });

    expect(isMemoryEnabled("off")).toBe(false);
    expect(Object.values(modules).every((enabled) => enabled === false)).toBe(true);
  });

  it("uses only low-risk context in stable mode", () => {
    const modules = resolveMemoryModulesForStrategy("stable", {
      story_memory: true,
      semantic_history: true,
      foreshadow_open_loops: true,
      structured: true,
      vector_rag: true,
      graph: true,
      fractal: true,
      worldbook: false,
      tables: false,
    });

    expect(modules).toEqual({
      worldbook: true,
      story_memory: false,
      semantic_history: false,
      foreshadow_open_loops: false,
      structured: false,
      tables: true,
      vector_rag: false,
      graph: false,
      fractal: false,
    });
  });

  it("defaults deep memory to semantic history, open foreshadows, and vector rag", () => {
    const modules = resolveMemoryModulesForStrategy("deep", {});

    expect(modules.semantic_history).toBe(true);
    expect(modules.foreshadow_open_loops).toBe(true);
    expect(modules.vector_rag).toBe(true);
    expect(modules.worldbook).toBe(true);
    expect(modules.tables).toBe(true);
    expect(modules.story_memory).toBe(false);
    expect(modules.structured).toBe(false);
    expect(modules.graph).toBe(false);
    expect(modules.fractal).toBe(false);
  });

  it("keeps deep memory budget within total when advanced modules are enabled", () => {
    const modules = resolveMemoryModulesForStrategy("deep", {
      story_memory: true,
      structured: true,
      graph: true,
      fractal: true,
    });
    const budgets = deepMemoryBudgetOverrides(modules);

    expect(Object.values(budgets).reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(
      DEEP_MEMORY_TOTAL_BUDGET_CHARS,
    );
    expect(budgets.story_memory).toBeGreaterThanOrEqual(1000);
    expect(budgets.structured).toBeGreaterThanOrEqual(1000);
    expect(budgets.graph).toBeGreaterThanOrEqual(1000);
    expect(budgets.fractal).toBeGreaterThanOrEqual(1000);
  });
});
