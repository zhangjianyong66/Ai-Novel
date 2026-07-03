import type { ChapterStatus } from "../../types";

export type ChapterAutoUpdatesTriggerResult = {
  tasks: Record<string, string | null>;
  chapter_token: string | null;
};

export const CHAPTER_LIST_SIDEBAR_WIDTH_CLASS = "w-[260px]" as const;

export type ChapterWorkflowActionId =
  | "save_plan"
  | "save_draft"
  | "save_and_finalize"
  | "finalize"
  | "reopen_draft"
  | "update_memory"
  | "retry_memory_update"
  | "delete"
  | "mark_planned";

export type ChapterWorkflowAction = {
  id: ChapterWorkflowActionId;
  label: string;
  disabled: boolean;
  pendingLabel?: string;
  danger?: boolean;
  confirm?: boolean;
};

export type ChapterWorkflowState = {
  writingStatusLabel: string;
  memoryStatusLabel: string;
  dirtyLabel: string | null;
  primaryAction: ChapterWorkflowAction | null;
  secondaryAction: ChapterWorkflowAction | null;
  moreActions: ChapterWorkflowAction[];
};

export function hasNonEmptyChapterContent(contentMd: string | null | undefined): boolean {
  return Boolean(String(contentMd ?? "").trim());
}

function getWritingStatusLabel(status: ChapterStatus): string {
  if (status === "planned") return "计划中";
  if (status === "drafting") return "草稿";
  return "定稿";
}

function getActionDisabled(params: {
  loadingChapter: boolean;
  generating: boolean;
  saving: boolean;
  statusUpdating: boolean;
  autoUpdatesTriggering: boolean;
  activeChapterId?: string | null;
}): boolean {
  return Boolean(
    params.loadingChapter ||
    params.generating ||
    params.saving ||
    params.statusUpdating ||
    params.autoUpdatesTriggering ||
    !params.activeChapterId,
  );
}

function getPendingLabel(params: {
  saving: boolean;
  statusUpdating: boolean;
  autoUpdatesTriggering: boolean;
}): string | undefined {
  if (params.saving) return "保存中...";
  if (params.statusUpdating) return "更新状态中...";
  if (params.autoUpdatesTriggering) return "更新中...";
  return undefined;
}

function buildWorkflowAction(
  id: ChapterWorkflowActionId,
  label: string,
  params: {
    loadingChapter: boolean;
    generating: boolean;
    saving: boolean;
    statusUpdating: boolean;
    autoUpdatesTriggering: boolean;
    activeChapterId?: string | null;
    danger?: boolean;
    confirm?: boolean;
  },
): ChapterWorkflowAction {
  return {
    id,
    label,
    disabled: getActionDisabled(params),
    pendingLabel: getPendingLabel(params),
    danger: params.danger,
    confirm: params.confirm,
  };
}

export function getChapterWorkflowState(params: {
  status: ChapterStatus;
  dirty: boolean;
  hasNonEmptyContent: boolean;
  loadingChapter: boolean;
  generating: boolean;
  saving: boolean;
  statusUpdating: boolean;
  autoUpdatesTriggering: boolean;
  activeChapterId?: string | null;
  memoryUpdateFailed?: boolean;
}): ChapterWorkflowState {
  const actionParams = {
    loadingChapter: params.loadingChapter,
    generating: params.generating,
    saving: params.saving,
    statusUpdating: params.statusUpdating,
    autoUpdatesTriggering: params.autoUpdatesTriggering,
    activeChapterId: params.activeChapterId,
  };
  const dirtyLabel = params.dirty ? "未保存" : null;

  if (params.status === "planned") {
    return {
      writingStatusLabel: getWritingStatusLabel(params.status),
      memoryStatusLabel: "不可更新",
      dirtyLabel,
      primaryAction: params.hasNonEmptyContent
        ? buildWorkflowAction("save_draft", "保存为草稿", actionParams)
        : buildWorkflowAction("save_plan", "保存计划", actionParams),
      secondaryAction: null,
      moreActions: [buildWorkflowAction("delete", "删除", { ...actionParams, danger: true, confirm: true })],
    };
  }

  if (params.status === "drafting") {
    return {
      writingStatusLabel: getWritingStatusLabel(params.status),
      memoryStatusLabel: "不可更新",
      dirtyLabel,
      primaryAction: params.dirty
        ? buildWorkflowAction("save_and_finalize", "保存并定稿", actionParams)
        : buildWorkflowAction("finalize", "标记为定稿", actionParams),
      secondaryAction: params.dirty ? buildWorkflowAction("save_draft", "仅保存草稿", actionParams) : null,
      moreActions: [
        buildWorkflowAction("mark_planned", "退回计划中", { ...actionParams, confirm: true }),
        buildWorkflowAction("delete", "删除", { ...actionParams, danger: true, confirm: true }),
      ],
    };
  }

  return {
    writingStatusLabel: getWritingStatusLabel(params.status),
    memoryStatusLabel: params.autoUpdatesTriggering ? "更新中" : params.memoryUpdateFailed ? "更新失败" : "待更新",
    dirtyLabel,
    primaryAction: params.memoryUpdateFailed
      ? buildWorkflowAction("retry_memory_update", "重试更新记忆", actionParams)
      : buildWorkflowAction("update_memory", "更新记忆", actionParams),
    secondaryAction: buildWorkflowAction("reopen_draft", "退回草稿", { ...actionParams, confirm: true }),
    moreActions: [buildWorkflowAction("delete", "删除", { ...actionParams, danger: true, confirm: true })],
  };
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
