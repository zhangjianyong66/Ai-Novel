import { describe, expect, it } from "vitest";

import { buildChapterVersionDiff } from "./chapterVersionDiff";

function textByKind(
  tokens: Array<{ kind: "equal" | "added" | "removed"; text: string }> | undefined,
  kind: "equal" | "added" | "removed",
): string {
  return (tokens ?? [])
    .filter((token) => token.kind === kind)
    .map((token) => token.text)
    .join("");
}

describe("buildChapterVersionDiff", () => {
  it("highlights changed Chinese text inside a paragraph", () => {
    const diff = buildChapterVersionDiff({
      baseContent: "他握紧短剑，走进雨里。",
      targetContent: "他握紧旧剑，慢慢走进雨里。",
    });

    expect(diff.hasChanges).toBe(true);
    expect(diff.blocks).toHaveLength(1);
    expect(diff.blocks[0].type).toBe("changed");
    expect(textByKind(diff.blocks[0].baseTokens, "removed")).toBe("短");
    expect(textByKind(diff.blocks[0].targetTokens, "added")).toBe("旧慢慢");
  });

  it("keeps markdown syntax as meaningful diff content", () => {
    const diff = buildChapterVersionDiff({
      baseContent: "他想起那句誓言。",
      targetContent: "他想起**那句誓言**。",
    });

    expect(diff.hasChanges).toBe(true);
    expect(diff.blocks[0].type).toBe("changed");
    expect(textByKind(diff.blocks[0].targetTokens, "added")).toContain("**");
  });

  it("ignores trailing spaces and excessive blank lines", () => {
    const diff = buildChapterVersionDiff({
      baseContent: "第一段。  \n\n\n\n第二段。",
      targetContent: "第一段。\n\n第二段。",
    });

    expect(diff.hasChanges).toBe(false);
    expect(diff.blocks.every((block) => block.type === "equal")).toBe(true);
  });

  it("marks inserted and removed paragraphs", () => {
    const diff = buildChapterVersionDiff({
      baseContent: "第一段。\n\n旧段落。\n\n第三段。",
      targetContent: "第一段。\n\n新段落。\n\n第三段。",
    });

    expect(diff.blocks.map((block) => block.type)).toEqual(["equal", "changed", "equal"]);
    expect(diff.blocks[1].baseText).toBe("旧段落。");
    expect(diff.blocks[1].targetText).toBe("新段落。");
  });
});
