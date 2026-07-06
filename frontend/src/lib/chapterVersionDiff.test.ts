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

  it("pairs the most similar paragraphs inside a consecutive change group", () => {
    const diff = buildChapterVersionDiff({
      baseContent:
        "混合着消毒水、霉菌和柠檬味清洁剂的凉气扑面而来。\n\n他在折叠椅上坐下，从包里掏出廉价威士忌。\n\n门缝里透出一点光。",
      targetContent:
        "混合着消毒水、霉菌和柠檬味清洁剂的凉气扑面而来，走廊通风，日光灯管有一根坏了。\n\n他在折叠椅上坐下，从包里掏出廉价威士忌，拧开盖子灌了一口。\n\n门缝里透出一点光。",
    });

    expect(diff.blocks.map((block) => block.type)).toEqual(["changed", "changed", "equal"]);
    expect(diff.blocks[0].baseText).toContain("消毒水");
    expect(diff.blocks[0].targetText).toContain("日光灯");
    expect(diff.blocks[1].baseText).toContain("折叠椅");
    expect(diff.blocks[1].targetText).toContain("威士忌");
  });

  it("keeps unrelated paragraphs as insertions and removals", () => {
    const diff = buildChapterVersionDiff({
      baseContent: "第一段。\n\n他握着短剑走进雨夜。\n\n第三段。",
      targetContent: "第一段。\n\n星舰越过土星环，广播里传来倒计时。\n\n第三段。",
    });

    expect(diff.blocks.map((block) => block.type)).toEqual(["equal", "removed", "added", "equal"]);
  });
});
