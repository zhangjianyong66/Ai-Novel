import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChapterVersionDiffView } from "./ChapterVersionDiffView";
import {
  findCurrentDiffOrdinalByViewport,
  resolveDiffNavigationStateAfterScroll,
} from "./chapterVersionDiffNavigation";

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

  it("prefers the diff entering the reading focus over a previous tall residual block", () => {
    expect(
      findCurrentDiffOrdinalByViewport(120, [
        { ordinal: 2, top: -420, bottom: 180 },
        { ordinal: 3, top: 124, bottom: 220 },
        { ordinal: 4, top: 360, bottom: 460 },
      ]),
    ).toBe(3);
  });
});

describe("resolveDiffNavigationStateAfterScroll", () => {
  it("keeps a programmatic jump target when scroll sync briefly reports the origin diff", () => {
    const resolved = resolveDiffNavigationStateAfterScroll({
      diffIdentity: "same",
      currentState: { diffIdentity: "same", ordinal: 3 },
      programmaticLock: { diffIdentity: "same", fromOrdinal: 2, targetOrdinal: 3 },
      scrollOrdinal: 2,
    });

    expect(resolved.state).toEqual({ diffIdentity: "same", ordinal: 3 });
    expect(resolved.programmaticLock).toEqual({ diffIdentity: "same", fromOrdinal: 2, targetOrdinal: 3 });
  });

  it("releases the programmatic lock once scroll sync reaches the target diff", () => {
    const resolved = resolveDiffNavigationStateAfterScroll({
      diffIdentity: "same",
      currentState: { diffIdentity: "same", ordinal: 3 },
      programmaticLock: { diffIdentity: "same", fromOrdinal: 2, targetOrdinal: 3 },
      scrollOrdinal: 3,
    });

    expect(resolved.state).toEqual({ diffIdentity: "same", ordinal: 3 });
    expect(resolved.programmaticLock).toBeNull();
  });

  it("allows manual scroll sync to replace a stale programmatic lock when it moves elsewhere", () => {
    const resolved = resolveDiffNavigationStateAfterScroll({
      diffIdentity: "same",
      currentState: { diffIdentity: "same", ordinal: 3 },
      programmaticLock: { diffIdentity: "same", fromOrdinal: 2, targetOrdinal: 3 },
      scrollOrdinal: 5,
    });

    expect(resolved.state).toEqual({ diffIdentity: "same", ordinal: 5 });
    expect(resolved.programmaticLock).toBeNull();
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
    expect(html).toContain("top-0");
  });

  it("uses an opaque mobile sticky navigation cover so scrolled diff text cannot show through", () => {
    const html = renderToStaticMarkup(
      <ChapterVersionDiffView
        baseContentMd={"第一段。\n\n旧段落。"}
        targetContentMd={"第一段。\n\n新段落。"}
        baseLabel="旧版本"
        targetLabel="新版本"
      />,
    );

    const navigationStart = html.indexOf("chapter_version_diff_navigation");
    const navigationSnippet = html.slice(Math.max(0, navigationStart - 500), navigationStart + 500);

    expect(navigationSnippet).toContain("bg-surface");
    expect(navigationSnippet).toContain("rounded-none");
    expect(navigationSnippet).not.toContain("bg-surface/95");
  });

  it("renders mobile side labels so compact diff columns keep context", () => {
    const html = renderToStaticMarkup(
      <ChapterVersionDiffView
        baseContentMd="旧段落。"
        targetContentMd="新段落。"
        baseLabel="旧版本"
        targetLabel="新版本"
      />,
    );

    expect(html).toContain("md:hidden");
    expect(html).toContain("基准版本");
    expect(html).toContain("目标版本");
  });

  it("keeps base and target side by side on mobile without horizontal diff scrolling", () => {
    const html = renderToStaticMarkup(
      <ChapterVersionDiffView
        baseContentMd="旧段落。"
        targetContentMd="新段落。"
        baseLabel="旧版本"
        targetLabel="新版本"
      />,
    );

    expect(html).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1fr)]");
    expect(html).toContain("min-w-0");
    expect(html).not.toContain("overflow-x-auto");
  });

  it("allows long highlighted diff tokens to wrap inside narrow mobile columns", () => {
    const html = renderToStaticMarkup(
      <ChapterVersionDiffView
        baseContentMd="曼谷的夜晚像一块浸透汗水的黑布，沉甸甸地压在帕蓬夜市上空。"
        targetContentMd=""
        baseLabel="旧版本"
        targetLabel="新版本"
      />,
    );

    expect(html).toContain("[overflow-wrap:anywhere]");
  });

  it("does not wrap sticky diff navigation in overflow-hidden containers", () => {
    const html = renderToStaticMarkup(
      <ChapterVersionDiffView
        baseContentMd="旧段落。"
        targetContentMd="新段落。"
        baseLabel="旧版本"
        targetLabel="新版本"
      />,
    );

    const beforeNavigation = html.slice(0, html.indexOf("chapter_version_diff_navigation"));

    expect(beforeNavigation).not.toContain("overflow-x-hidden");
    expect(beforeNavigation).not.toContain("overflow-hidden");
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
