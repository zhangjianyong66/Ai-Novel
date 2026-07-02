import type { ChapterStatus } from "../../types";

export type ChapterAutoUpdatesTriggerResult = {
  tasks: Record<string, string | null>;
  chapter_token: string | null;
};

export type ChapterStatusAction = {
  status: ChapterStatus;
  label: string;
  confirm?: boolean;
};

export const CHAPTER_LIST_SIDEBAR_WIDTH_CLASS = "w-[260px]" as const;

export function getChapterStatusActions(status: ChapterStatus): ChapterStatusAction[] {
  if (status === "planned") return [{ status: "drafting", label: "开始起草" }];
  if (status === "drafting") {
    return [
      { status: "planned", label: "标记为已规划" },
      { status: "done", label: "标记为定稿" },
    ];
  }
  return [{ status: "drafting", label: "回退为起草中", confirm: true }];
}

export function isChapterStatusActionDisabled(params: {
  dirty: boolean;
  loadingChapter: boolean;
  saving: boolean;
  statusUpdating: boolean;
  activeChapterId?: string | null;
}): boolean {
  return Boolean(
    params.dirty || params.loadingChapter || params.saving || params.statusUpdating || !params.activeChapterId,
  );
}

export function isSaveAndTriggerDisabled(params: {
  loadingChapter: boolean;
  generating: boolean;
  saving: boolean;
  autoUpdatesTriggering: boolean;
}): boolean {
  return Boolean(params.loadingChapter || params.generating || params.saving || params.autoUpdatesTriggering);
}

export function pickFirstProjectTaskId(tasks: Record<string, string | null> | null | undefined): string | null {
  if (!tasks) return null;
  for (const value of Object.values(tasks)) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function buildWritingTaskCenterHref(projectId: string, chapterId?: string | null): string {
  const params = new URLSearchParams();
  if (chapterId) params.set("chapterId", chapterId);
  return `/projects/${projectId}/tasks${params.toString() ? `?${params.toString()}` : ""}`;
}

export function buildProjectTaskCenterHref(projectId?: string, projectTaskId?: string | null): string | null {
  if (!projectId || !projectTaskId) return null;
  return `/projects/${projectId}/tasks?project_task_id=${encodeURIComponent(projectTaskId)}`;
}

export function buildBatchTaskCenterHref(projectId?: string, projectTaskId?: string | null): string | null {
  return buildProjectTaskCenterHref(projectId, projectTaskId);
}
