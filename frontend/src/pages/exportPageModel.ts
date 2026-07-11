import type { ChapterListItem } from "../types";

export type ExportChapterRange = "all" | "done" | "selected";

export type ExportForm = {
  include_settings: boolean;
  include_characters: boolean;
  include_outline: boolean;
  chapters: ExportChapterRange;
};

export type ContentExportFormat = "markdown" | "txt";

export type SelectedChapterAction = "all" | "done" | "clear";

export function buildContentExportUrl(
  projectId: string | undefined,
  format: ContentExportFormat,
  form: ExportForm,
  selectedChapterIds: readonly string[],
): string {
  if (!projectId) return "";
  const qs = new URLSearchParams();
  if (format === "markdown") {
    qs.set("include_settings", form.include_settings ? "1" : "0");
    qs.set("include_characters", form.include_characters ? "1" : "0");
    qs.set("include_outline", form.include_outline ? "1" : "0");
  }
  qs.set("chapters", form.chapters);
  if (form.chapters === "selected") {
    selectedChapterIds.forEach((chapterId) => qs.append("chapter_ids", chapterId));
  }
  return `/api/projects/${projectId}/export/${format}?${qs.toString()}`;
}

export function canExportContent(form: ExportForm, selectedChapterIds: readonly string[]): boolean {
  return form.chapters !== "selected" || selectedChapterIds.length > 0;
}

export function selectedChapterIdsForAction(
  action: SelectedChapterAction,
  chapters: readonly ChapterListItem[],
): string[] {
  if (action === "clear") return [];
  return chapters.filter((chapter) => action === "all" || chapter.status === "done").map((chapter) => chapter.id);
}
