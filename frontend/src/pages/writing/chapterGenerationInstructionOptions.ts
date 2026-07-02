export const DEFAULT_CHAPTER_GENERATION_INSTRUCTION_OPTIONS = [
  "按章节计划续写，保持人物语气和前文节奏一致。",
  "增强本章冲突和悬念，结尾留下自然钩子。",
  "放慢节奏，增加人物心理、动作和环境细节。",
  "加快节奏，减少铺垫，突出关键事件推进。",
  "强化对话张力，让人物表达更有个性。",
  "保持爽点密度，避免重复描写和无效过渡。",
] as const;

export function mergeChapterGenerationInstructionOptions(
  history: readonly string[],
  defaults: readonly string[] = DEFAULT_CHAPTER_GENERATION_INSTRUCTION_OPTIONS,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...history, ...defaults]) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
