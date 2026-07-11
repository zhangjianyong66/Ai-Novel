export type MemoryStrategy = "off" | "stable" | "deep";

export type MemoryModules = {
  worldbook: boolean;
  story_memory: boolean;
  semantic_history: boolean;
  foreshadow_open_loops: boolean;
  structured: boolean;
  tables: boolean;
  vector_rag: boolean;
  graph: boolean;
  fractal: boolean;
};

export const DEFAULT_MEMORY_STRATEGY: MemoryStrategy = "stable";
export const DEEP_MEMORY_TOTAL_BUDGET_CHARS = 9000;

const MIN_DEEP_SECTION_BUDGET_CHARS = 1000;

export const STABLE_MEMORY_MODULES: MemoryModules = {
  worldbook: true,
  story_memory: false,
  semantic_history: false,
  foreshadow_open_loops: false,
  structured: false,
  tables: true,
  vector_rag: false,
  graph: false,
  fractal: false,
};

export const DEEP_MEMORY_DEFAULT_MODULES: MemoryModules = {
  ...STABLE_MEMORY_MODULES,
  semantic_history: true,
  foreshadow_open_loops: true,
  vector_rag: true,
};

const OFF_MEMORY_MODULES: MemoryModules = {
  worldbook: false,
  story_memory: false,
  semantic_history: false,
  foreshadow_open_loops: false,
  structured: false,
  tables: false,
  vector_rag: false,
  graph: false,
  fractal: false,
};

const DEEP_BUDGET_WEIGHTS: Partial<Record<keyof MemoryModules, number>> = {
  semantic_history: 3,
  foreshadow_open_loops: 2.5,
  vector_rag: 3.5,
  graph: 2,
  fractal: 2,
  story_memory: 2,
  structured: 2,
};

export function isMemoryEnabled(strategy: MemoryStrategy): boolean {
  return strategy !== "off";
}

export function resolveMemoryModulesForStrategy(
  strategy: MemoryStrategy,
  advancedModules: Partial<MemoryModules>,
): MemoryModules {
  if (strategy === "off") return { ...OFF_MEMORY_MODULES };
  if (strategy === "stable") return { ...STABLE_MEMORY_MODULES };

  return {
    ...DEEP_MEMORY_DEFAULT_MODULES,
    story_memory: Boolean(advancedModules.story_memory ?? DEEP_MEMORY_DEFAULT_MODULES.story_memory),
    semantic_history: Boolean(advancedModules.semantic_history ?? DEEP_MEMORY_DEFAULT_MODULES.semantic_history),
    foreshadow_open_loops: Boolean(
      advancedModules.foreshadow_open_loops ?? DEEP_MEMORY_DEFAULT_MODULES.foreshadow_open_loops,
    ),
    structured: Boolean(advancedModules.structured ?? DEEP_MEMORY_DEFAULT_MODULES.structured),
    vector_rag: Boolean(advancedModules.vector_rag ?? DEEP_MEMORY_DEFAULT_MODULES.vector_rag),
    graph: Boolean(advancedModules.graph ?? DEEP_MEMORY_DEFAULT_MODULES.graph),
    fractal: Boolean(advancedModules.fractal ?? DEEP_MEMORY_DEFAULT_MODULES.fractal),
    worldbook: true,
    tables: true,
  };
}

export function deepMemoryBudgetOverrides(modules: MemoryModules): Partial<Record<keyof MemoryModules, number>> {
  const weighted = Object.entries(DEEP_BUDGET_WEIGHTS).filter(([key]) => modules[key as keyof MemoryModules]);
  if (!weighted.length) return {};

  const totalWeight = weighted.reduce((sum, [, weight]) => sum + Number(weight), 0);
  let remaining = DEEP_MEMORY_TOTAL_BUDGET_CHARS;
  const budgets: Partial<Record<keyof MemoryModules, number>> = {};

  weighted.forEach(([key, weight], index) => {
    const moduleKey = key as keyof MemoryModules;
    const budget =
      index === weighted.length - 1
        ? remaining
        : Math.min(
            remaining,
            Math.max(
              MIN_DEEP_SECTION_BUDGET_CHARS,
              Math.floor(DEEP_MEMORY_TOTAL_BUDGET_CHARS * (Number(weight) / totalWeight)),
            ),
          );
    budgets[moduleKey] = budget;
    remaining -= budget;
  });

  return budgets;
}
