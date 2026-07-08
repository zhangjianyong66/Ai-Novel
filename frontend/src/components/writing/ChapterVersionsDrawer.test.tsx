import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ChapterVersionDetail, ChapterVersionSummary } from "../../types";
import { ChapterVersionsDrawer } from "./ChapterVersionsDrawer";

function version(overrides: Partial<ChapterVersionDetail> = {}): ChapterVersionDetail {
  return {
    id: "v1",
    chapter_id: "c1",
    project_id: "p1",
    source: "ai_optimize",
    word_count: 1200,
    generation_run_id: null,
    provider: null,
    model: "deepseek-v4-pro",
    meta: null,
    created_at: "2026-07-07T10:40:58Z",
    is_active: false,
    content_md: "正文。",
    ...overrides,
  };
}

describe("ChapterVersionsDrawer", () => {
  it("prioritizes compare content on mobile by compacting the list and toolbar", () => {
    const selectedVersion = version({ id: "v2", is_active: true, content_md: "目标正文。" });
    const compareBaseVersion = version({ id: "v1", content_md: "基准正文。" });
    const versions: ChapterVersionSummary[] = [selectedVersion, compareBaseVersion];

    const html = renderToStaticMarkup(
      <ChapterVersionsDrawer
        open
        loading={false}
        detailLoading={false}
        activating={false}
        compareMode
        compareLoading={false}
        versions={versions}
        selectedVersion={selectedVersion}
        compareBaseVersion={compareBaseVersion}
        compareBaseVersionId={compareBaseVersion.id}
        activeVersionId={selectedVersion.id}
        canActivate
        onClose={() => undefined}
        onSelectVersion={() => undefined}
        onComparePreviousVersion={() => undefined}
        onCompareBaseVersionChange={() => undefined}
        onCloseCompare={() => undefined}
        onActivateVersion={() => undefined}
      />,
    );

    expect(html).toContain("grid-rows-[auto_minmax(0,1fr)]");
    expect(html).toContain("overflow-x-hidden");
    expect(html).toContain("md:overflow-y-auto");
    expect(html).toContain("grid-cols-3");
    expect(html).toContain("返回预览");
  });

  it("does not create horizontal scrolling containers in compare mode", () => {
    const selectedVersion = version({ id: "v2", is_active: true, content_md: "目标正文。" });
    const compareBaseVersion = version({ id: "v1", content_md: "基准正文。" });
    const versions: ChapterVersionSummary[] = [selectedVersion, compareBaseVersion];

    const html = renderToStaticMarkup(
      <ChapterVersionsDrawer
        open
        loading={false}
        detailLoading={false}
        activating={false}
        compareMode
        compareLoading={false}
        versions={versions}
        selectedVersion={selectedVersion}
        compareBaseVersion={compareBaseVersion}
        compareBaseVersionId={compareBaseVersion.id}
        activeVersionId={selectedVersion.id}
        canActivate
        onClose={() => undefined}
        onSelectVersion={() => undefined}
        onComparePreviousVersion={() => undefined}
        onCompareBaseVersionChange={() => undefined}
        onCloseCompare={() => undefined}
        onActivateVersion={() => undefined}
      />,
    );

    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("w-max");
  });

  it("does not wrap diff navigation in an extra overflow-hidden compare container", () => {
    const selectedVersion = version({ id: "v2", is_active: true, content_md: "目标正文。" });
    const compareBaseVersion = version({ id: "v1", content_md: "基准正文。" });
    const versions: ChapterVersionSummary[] = [selectedVersion, compareBaseVersion];

    const html = renderToStaticMarkup(
      <ChapterVersionsDrawer
        open
        loading={false}
        detailLoading={false}
        activating={false}
        compareMode
        compareLoading={false}
        versions={versions}
        selectedVersion={selectedVersion}
        compareBaseVersion={compareBaseVersion}
        compareBaseVersionId={compareBaseVersion.id}
        activeVersionId={selectedVersion.id}
        canActivate
        onClose={() => undefined}
        onSelectVersion={() => undefined}
        onComparePreviousVersion={() => undefined}
        onCompareBaseVersionChange={() => undefined}
        onCloseCompare={() => undefined}
        onActivateVersion={() => undefined}
      />,
    );

    expect(html).not.toContain("grid min-w-0 gap-4 overflow-x-hidden");
  });

  it("keeps compare base selection in the compact toolbar instead of between actions and diff navigation", () => {
    const selectedVersion = version({ id: "v2", is_active: true, content_md: "目标正文。" });
    const compareBaseVersion = version({ id: "v1", content_md: "基准正文。" });
    const versions: ChapterVersionSummary[] = [selectedVersion, compareBaseVersion];

    const html = renderToStaticMarkup(
      <ChapterVersionsDrawer
        open
        loading={false}
        detailLoading={false}
        activating={false}
        compareMode
        compareLoading={false}
        versions={versions}
        selectedVersion={selectedVersion}
        compareBaseVersion={compareBaseVersion}
        compareBaseVersionId={compareBaseVersion.id}
        activeVersionId={selectedVersion.id}
        canActivate
        onClose={() => undefined}
        onSelectVersion={() => undefined}
        onComparePreviousVersion={() => undefined}
        onCompareBaseVersionChange={() => undefined}
        onCloseCompare={() => undefined}
        onActivateVersion={() => undefined}
      />,
    );

    expect(html.indexOf("对比基准")).toBeLessThan(html.indexOf("返回预览"));
    expect(html.indexOf("chapter_version_diff_navigation") - html.indexOf("返回预览")).toBeLessThan(2200);
  });

  it("removes top padding from the compare scroller so sticky diff navigation starts flush under the toolbar", () => {
    const selectedVersion = version({ id: "v2", is_active: true, content_md: "目标正文。" });
    const compareBaseVersion = version({ id: "v1", content_md: "基准正文。" });
    const versions: ChapterVersionSummary[] = [selectedVersion, compareBaseVersion];

    const html = renderToStaticMarkup(
      <ChapterVersionsDrawer
        open
        loading={false}
        detailLoading={false}
        activating={false}
        compareMode
        compareLoading={false}
        versions={versions}
        selectedVersion={selectedVersion}
        compareBaseVersion={compareBaseVersion}
        compareBaseVersionId={compareBaseVersion.id}
        activeVersionId={selectedVersion.id}
        canActivate
        onClose={() => undefined}
        onSelectVersion={() => undefined}
        onComparePreviousVersion={() => undefined}
        onCompareBaseVersionChange={() => undefined}
        onCloseCompare={() => undefined}
        onActivateVersion={() => undefined}
      />,
    );

    expect(html).toContain("px-2 pb-2 pt-0");
    expect(html).not.toContain("p-2 sm:p-4");
  });

  it("keeps the drawer panel itself from scrolling so diff sticky navigation tracks the content scroller", () => {
    const selectedVersion = version({ id: "v2", is_active: true, content_md: "目标正文。" });
    const compareBaseVersion = version({ id: "v1", content_md: "基准正文。" });
    const versions: ChapterVersionSummary[] = [selectedVersion, compareBaseVersion];

    const html = renderToStaticMarkup(
      <ChapterVersionsDrawer
        open
        loading={false}
        detailLoading={false}
        activating={false}
        compareMode
        compareLoading={false}
        versions={versions}
        selectedVersion={selectedVersion}
        compareBaseVersion={compareBaseVersion}
        compareBaseVersionId={compareBaseVersion.id}
        activeVersionId={selectedVersion.id}
        canActivate
        onClose={() => undefined}
        onSelectVersion={() => undefined}
        onComparePreviousVersion={() => undefined}
        onCompareBaseVersionChange={() => undefined}
        onCloseCompare={() => undefined}
        onActivateVersion={() => undefined}
      />,
    );

    expect(html).toContain("!overflow-hidden");
  });

  it("uses the full mobile viewport instead of leaving a top gap above the drawer", () => {
    const selectedVersion = version({ id: "v2", is_active: true, content_md: "目标正文。" });
    const compareBaseVersion = version({ id: "v1", content_md: "基准正文。" });
    const versions: ChapterVersionSummary[] = [selectedVersion, compareBaseVersion];

    const html = renderToStaticMarkup(
      <ChapterVersionsDrawer
        open
        loading={false}
        detailLoading={false}
        activating={false}
        compareMode
        compareLoading={false}
        versions={versions}
        selectedVersion={selectedVersion}
        compareBaseVersion={compareBaseVersion}
        compareBaseVersionId={compareBaseVersion.id}
        activeVersionId={selectedVersion.id}
        canActivate
        onClose={() => undefined}
        onSelectVersion={() => undefined}
        onComparePreviousVersion={() => undefined}
        onCompareBaseVersionChange={() => undefined}
        onCloseCompare={() => undefined}
        onActivateVersion={() => undefined}
      />,
    );

    expect(html).toContain("h-dvh");
    expect(html).not.toContain("h-[86dvh]");
    expect(html).not.toContain("rounded-t-atelier");
  });

  it("collapses mobile compare controls by default to prioritize diff content", () => {
    const selectedVersion = version({ id: "v2", is_active: true, content_md: "目标正文。" });
    const compareBaseVersion = version({ id: "v1", content_md: "基准正文。" });
    const versions: ChapterVersionSummary[] = [selectedVersion, compareBaseVersion];

    const html = renderToStaticMarkup(
      <ChapterVersionsDrawer
        open
        loading={false}
        detailLoading={false}
        activating={false}
        compareMode
        compareLoading={false}
        versions={versions}
        selectedVersion={selectedVersion}
        compareBaseVersion={compareBaseVersion}
        compareBaseVersionId={compareBaseVersion.id}
        activeVersionId={selectedVersion.id}
        canActivate
        onClose={() => undefined}
        onSelectVersion={() => undefined}
        onComparePreviousVersion={() => undefined}
        onCompareBaseVersionChange={() => undefined}
        onCloseCompare={() => undefined}
        onActivateVersion={() => undefined}
      />,
    );

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("展开");
    expect(html).toContain("md:block md:border-b-0 md:border-r hidden");
    expect(html).toContain("md:grid md:max-w-md");
    expect(html).toContain("md:items-center hidden");
    expect(html).toContain("hidden grid-cols-3");
  });
});
