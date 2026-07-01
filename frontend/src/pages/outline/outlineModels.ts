import type { OutlineGenResult } from "../outlineParsing";

export type OutlineGenForm = {
  chapter_count: number;
  tone: string;
  pacing: string;
  include_world_setting: boolean;
  include_characters: boolean;
};

export type OutlineGenerationPreferences = {
  tone: string[];
  pacing: string[];
};

export type OutlineStreamProgress = {
  message: string;
  progress: number;
  status: string;
};

export const DEFAULT_OUTLINE_GEN_FORM: OutlineGenForm = {
  chapter_count: 12,
  tone: "偏现实，克制但有爆点",
  pacing: "前3章强钩子，中段升级，结尾反转",
  include_world_setting: true,
  include_characters: true,
};

export const DEFAULT_OUTLINE_TONE_OPTIONS = [
  "轻松幽默，节奏明快，带一点治愈感",
  "压抑悬疑，氛围紧张，情节层层反转",
  "热血爽文，节奏快，主角一路成长打脸",
  "温柔细腻，偏日常治愈，情感推进缓慢",
  "黑暗残酷，现实感强，人物命运沉重",
  "轻松搞笑的都市爽文基调，节奏快，冲突密集，主角成长带来持续爽感",
] as const;

export const DEFAULT_OUTLINE_PACING_OPTIONS = [
  "快节奏，开局迅速抛出矛盾，剧情持续推进，少写日常铺垫",
  "中等节奏，主线稳定推进，穿插人物成长和感情互动",
  "慢热节奏，前期重人物关系和世界观铺垫，中后期逐渐加速",
  "张弛有度，大事件后安排短暂日常缓冲，再进入下一轮冲突",
  "中快节奏，前期快速进入主线，章节之间保持悬念和冲突，每隔数章设置一次小高潮，重要剧情后适当留出情绪缓冲。",
] as const;

export const STREAM_RAW_MAX_CHARS = 36000;
const STREAM_RAW_PREFIX_RE = /^\[raw 已截断前 (\d+) 字符，仅保留最近 \d+ 字符\]\n/;

export function mergeOutlineGenerationOptions(history: readonly string[], defaults: readonly string[] = []): string[] {
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

export function toFinalPreviewJson(result: OutlineGenResult): string {
  return JSON.stringify(
    {
      outline_md: result.outline_md,
      chapters: result.chapters,
      parse_error: result.parse_error ?? undefined,
    },
    null,
    2,
  );
}

export function appendCappedRawText(prev: string, chunk: string, maxChars = STREAM_RAW_MAX_CHARS): string {
  if (!chunk) return prev;
  const previousMatch = prev.match(STREAM_RAW_PREFIX_RE);
  const previousOmitted = previousMatch ? Number(previousMatch[1] ?? 0) : 0;
  const previousBody = prev.replace(STREAM_RAW_PREFIX_RE, "");
  const merged = `${previousBody}${chunk}`;
  if (merged.length <= maxChars) return merged;
  const omitted = previousOmitted + merged.length - maxChars;
  return `[raw 已截断前 ${omitted} 字符，仅保留最近 ${maxChars} 字符]\n${merged.slice(-maxChars)}`;
}

export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export function buildNextOutlineTitle(outlineCount: number): string {
  return `大纲 v${Math.max(1, outlineCount + 1)}`;
}

export function buildGeneratedOutlineTitle(now = new Date()): string {
  return `AI 大纲 ${now.toISOString().slice(0, 16).replace("T", " ")}`;
}
