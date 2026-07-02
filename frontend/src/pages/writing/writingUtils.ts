import type { Chapter, ChapterStatus, UpdateChapterInput } from "../../types";

export type ChapterForm = {
  title: string;
  plan: string;
  content_md: string;
  summary: string;
  status: ChapterStatus;
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
    status: chapter.status,
  };
}

export function buildChapterSavePayload(baseline: ChapterForm, next: ChapterForm): UpdateChapterInput {
  const onlyReopeningDoneChapter =
    baseline.status === "done" &&
    next.status === "drafting" &&
    next.title === baseline.title &&
    next.plan === baseline.plan &&
    next.content_md === baseline.content_md &&
    next.summary === baseline.summary;

  if (onlyReopeningDoneChapter) {
    return { status: "drafting" };
  }

  return {
    title: next.title.trim(),
    plan: next.plan,
    content_md: next.content_md,
    summary: next.summary,
    status: next.status,
  };
}
