import type { Chapter, UpdateChapterInput } from "../../types";

export type ChapterForm = {
  title: string;
  plan: string;
  content_md: string;
  summary: string;
};

export function normalizeText(v: string | null | undefined): string {
  return v ?? "";
}

export function appendMarkdown(base: string, fragment: string): string {
  const a = (base ?? "").trimEnd();
  const b = (fragment ?? "").trimStart();
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}

export function nextChapterNumber(chapters: Array<Pick<Chapter, "number">>): number {
  const max = chapters.reduce((acc, c) => Math.max(acc, c.number ?? 0), 0);
  return max + 1;
}

export function chapterToForm(chapter: Chapter): ChapterForm {
  return {
    title: normalizeText(chapter.title),
    plan: normalizeText(chapter.plan),
    content_md: normalizeText(chapter.content_md),
    summary: normalizeText(chapter.summary),
  };
}

export function buildChapterSavePayload(_baseline: ChapterForm, next: ChapterForm): UpdateChapterInput {
  return {
    title: next.title.trim(),
    plan: next.plan,
    content_md: next.content_md,
    summary: next.summary,
  };
}
