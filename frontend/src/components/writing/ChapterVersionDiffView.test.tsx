import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChapterVersionDiffView } from "./ChapterVersionDiffView";
import { findCurrentDiffOrdinalByViewport } from "./chapterVersionDiffNavigation";

describe("findCurrentDiffOrdinalByViewport", () => {
  it("selects the diff block intersecting the line below sticky navigation", () => {
    expect(
      findCurrentDiffOrdinalByViewport(120, [
        { ordinal: 0, top: 20, bottom: 90 },
        { ordinal: 1, top: 100, bottom: 180 },
        { ordinal: 2, top: 220, bottom: 300 },
      ]),
    ).toBe(1);
  });

  it("keeps the nearest edge diff when scrolled before the first or after the last diff", () => {
    const rects = [
      { ordinal: 0, top: 160, bottom: 220 },
      { ordinal: 1, top: 300, bottom: 360 },
    ];

    expect(findCurrentDiffOrdinalByViewport(100, rects)).toBe(0);
    expect(findCurrentDiffOrdinalByViewport(420, rects)).toBe(1);
  });
});

describe("ChapterVersionDiffView", () => {
  it("renders changed paragraphs with quiet rails instead of full-block color wash", () => {
    const html = renderToStaticMarkup(
      <ChapterVersionDiffView
        baseContentMd="他握紧短剑，走进雨里。"
        targetContentMd="他握紧旧剑，慢慢走进雨里。"
        baseLabel="旧版本"
        targetLabel="新版本"
      />,
    );

    expect(html).toContain("border-l-4");
    expect(html).toContain("ring-danger/20");
    expect(html).toContain("ring-success/20");
    expect(html).not.toContain("bg-danger/5");
    expect(html).not.toContain("bg-success/5");
  });

  it("renders a muted placeholder for the empty side of inserted paragraphs", () => {
    const html = renderToStaticMarkup(
      <ChapterVersionDiffView
        baseContentMd="第一段。"
        targetContentMd={"第一段。\n\n新增段落。"}
        baseLabel="旧版本"
        targetLabel="新版本"
      />,
    );

    expect(html).toContain("此侧无对应段落");
  });

  it("renders diff navigation with count and initial current marker", () => {
    const html = renderToStaticMarkup(
      <ChapterVersionDiffView
        baseContentMd={"第一段。\n\n旧段落。\n\n第三段。\n\n删除段落。"}
        targetContentMd={"第一段。\n\n新段落。\n\n第三段。\n\n新增段落。"}
        baseLabel="旧版本"
        targetLabel="新版本"
      />,
    );

    expect(html).toContain("上一个差异");
    expect(html).toContain("下一个差异");
    expect(html).toContain("第 1 / 共 2 处");
    expect(html).toContain('aria-current="location"');
    expect(html).toContain("chapter_version_diff_navigation");
    expect(html).toContain("sticky");
    expect(html).toContain("-top-5");
  });

  it("does not render diff navigation when contents match", () => {
    const html = renderToStaticMarkup(
      <ChapterVersionDiffView
        baseContentMd="第一段。"
        targetContentMd="第一段。"
        baseLabel="旧版本"
        targetLabel="新版本"
      />,
    );

    expect(html).not.toContain("上一个差异");
    expect(html).not.toContain("chapter_version_diff_navigation");
  });
});
