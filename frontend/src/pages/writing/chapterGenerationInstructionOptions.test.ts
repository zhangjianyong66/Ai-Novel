import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHAPTER_GENERATION_INSTRUCTION_OPTIONS,
  mergeChapterGenerationInstructionOptions,
} from "./chapterGenerationInstructionOptions";

describe("chapterGenerationInstructionOptions", () => {
  it("provides the default user instruction options", () => {
    expect(DEFAULT_CHAPTER_GENERATION_INSTRUCTION_OPTIONS).toEqual([
      "按章节计划续写，保持人物语气和前文节奏一致。",
      "增强本章冲突和悬念，结尾留下自然钩子。",
      "放慢节奏，增加人物心理、动作和环境细节。",
      "加快节奏，减少铺垫，突出关键事件推进。",
      "强化对话张力，让人物表达更有个性。",
      "保持爽点密度，避免重复描写和无效过渡。",
    ]);
  });

  it("merges history before defaults and removes duplicates", () => {
    const merged = mergeChapterGenerationInstructionOptions([
      " 自定义指令 ",
      "增强本章冲突和悬念，结尾留下自然钩子。",
      "自定义指令",
      "",
    ]);

    expect(merged.slice(0, 2)).toEqual(["自定义指令", "增强本章冲突和悬念，结尾留下自然钩子。"]);
    expect(merged.filter((item) => item === "自定义指令")).toHaveLength(1);
    expect(merged.filter((item) => item === "增强本章冲突和悬念，结尾留下自然钩子。")).toHaveLength(1);
    expect(merged).toContain("保持爽点密度，避免重复描写和无效过渡。");
  });
});
