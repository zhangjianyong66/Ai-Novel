import { describe, expect, it } from "vitest";

import type { ChapterListItem } from "../types";
import {
  buildContentExportUrl,
  canExportContent,
  selectedChapterIdsForAction,
  type ExportForm,
} from "./exportPageModel";

function chapter(overrides: Partial<ChapterListItem>): ChapterListItem {
  return {
    id: overrides.id ?? "chapter-1",
    project_id: "project-1",
    outline_id: "outline-1",
    number: overrides.number ?? 1,
    title: overrides.title ?? "章节",
    status: overrides.status ?? "drafting",
    updated_at: "2026-07-11T00:00:00Z",
    has_plan: false,
    has_summary: false,
    has_content: overrides.has_content ?? true,
  };
}

describe("exportPageModel", () => {
  it("builds selected chapter export urls with repeated chapter_ids", () => {
    const form: ExportForm = {
      include_settings: true,
      include_characters: false,
      include_outline: true,
      chapters: "selected",
    };

    expect(buildContentExportUrl("p1", "markdown", form, ["c3", "c1"])).toBe(
      "/api/projects/p1/export/markdown?include_settings=1&include_characters=0&include_outline=1&chapters=selected&chapter_ids=c3&chapter_ids=c1",
    );
    expect(buildContentExportUrl("p1", "txt", form, ["c3", "c1"])).toBe(
      "/api/projects/p1/export/txt?chapters=selected&chapter_ids=c3&chapter_ids=c1",
    );
  });

  it("disables content export only when selected mode has no selected chapters", () => {
    const form: ExportForm = {
      include_settings: true,
      include_characters: true,
      include_outline: true,
      chapters: "selected",
    };

    expect(canExportContent(form, [])).toBe(false);
    expect(canExportContent(form, ["c1"])).toBe(true);
    expect(canExportContent({ ...form, chapters: "all" }, [])).toBe(true);
    expect(canExportContent({ ...form, chapters: "done" }, [])).toBe(true);
  });

  it("derives bulk selected chapter ids from current chapter metadata", () => {
    const chapters = [
      chapter({ id: "c1", number: 1, status: "done" }),
      chapter({ id: "c2", number: 2, status: "drafting" }),
      chapter({ id: "c3", number: 3, status: "done" }),
    ];

    expect(selectedChapterIdsForAction("all", chapters)).toEqual(["c1", "c2", "c3"]);
    expect(selectedChapterIdsForAction("done", chapters)).toEqual(["c1", "c3"]);
    expect(selectedChapterIdsForAction("clear", chapters)).toEqual([]);
  });
});
