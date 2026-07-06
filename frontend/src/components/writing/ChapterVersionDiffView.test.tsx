import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChapterVersionDiffView } from "./ChapterVersionDiffView";

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
