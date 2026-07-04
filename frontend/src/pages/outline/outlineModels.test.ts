import { describe, expect, it } from "vitest";

import {
  DEFAULT_OUTLINE_PACING_OPTIONS,
  DEFAULT_OUTLINE_TONE_OPTIONS,
  appendCappedRawText,
  buildGeneratedOutlineTitle,
  buildNextOutlineTitle,
  buildUniqueGeneratedOutlineTitle,
  mergeOutlineGenerationOptions,
} from "./outlineModels";

describe("outlineModels", () => {
  it("caps streamed raw text and preserves a truncation prefix", () => {
    const first = appendCappedRawText("", "abcdef", 4);
    const second = appendCappedRawText(first, "gh", 4);

    expect(first).toBe("[raw 已截断前 2 字符，仅保留最近 4 字符]\ncdef");
    expect(second).toBe("[raw 已截断前 4 字符，仅保留最近 4 字符]\nefgh");
  });

  it("builds stable outline titles for local create flows", () => {
    expect(buildNextOutlineTitle(0)).toBe("大纲 v1");
    expect(buildNextOutlineTitle(3)).toBe("大纲 v4");
    expect(buildGeneratedOutlineTitle(new Date("2026-03-14T01:35:00Z"))).toBe("AI 大纲 2026-03-14 01:35");
  });

  it("deduplicates generated outline titles within the same minute", () => {
    const now = new Date("2026-03-14T01:35:00Z");

    expect(buildUniqueGeneratedOutlineTitle(["AI 大纲 2026-03-14 01:35"], now)).toBe("AI 大纲 2026-03-14 01:35 (2)");
    expect(buildUniqueGeneratedOutlineTitle(["AI 大纲 2026-03-14 01:35", "AI 大纲 2026-03-14 01:35 (2)"], now)).toBe(
      "AI 大纲 2026-03-14 01:35 (3)",
    );
  });

  it("provides built-in tone and pacing options", () => {
    expect(DEFAULT_OUTLINE_TONE_OPTIONS).toContain("轻松幽默，节奏明快，带一点治愈感");
    expect(DEFAULT_OUTLINE_TONE_OPTIONS).toContain("轻松搞笑的都市爽文基调，节奏快，冲突密集，主角成长带来持续爽感");
    expect(DEFAULT_OUTLINE_PACING_OPTIONS).toContain("快节奏，开局迅速抛出矛盾，剧情持续推进，少写日常铺垫");
    expect(DEFAULT_OUTLINE_PACING_OPTIONS).toContain(
      "中快节奏，前期快速进入主线，章节之间保持悬念和冲突，每隔数章设置一次小高潮，重要剧情后适当留出情绪缓冲。",
    );
  });

  it("merges history options before defaults and removes duplicates", () => {
    const merged = mergeOutlineGenerationOptions([
      " 自定义基调 ",
      "轻松幽默，节奏明快，带一点治愈感",
      "自定义基调",
      "",
    ]);

    expect(merged.slice(0, 2)).toEqual(["自定义基调", "轻松幽默，节奏明快，带一点治愈感"]);
    expect(merged.filter((item) => item === "自定义基调")).toHaveLength(1);
    expect(merged.filter((item) => item === "轻松幽默，节奏明快，带一点治愈感")).toHaveLength(1);
  });
});
