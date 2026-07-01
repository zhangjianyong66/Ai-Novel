import { describe, expect, it } from "vitest";

import { guessPreviewValues } from "./utils";

describe("guessPreviewValues", () => {
  it("includes outline generation guidance variables for prompt preview", () => {
    const values = guessPreviewValues({
      project: null,
      settings: null,
      outline: null,
      characters: [],
    });

    expect(values.target_chapter_count).toBe(12);
    expect(values.chapter_count_rule).toContain("12");
    expect(values.chapter_detail_rule).toContain("beats");
  });
});
