import type { ComponentProps } from "react";
import type { ChapterMemoryUpdateStatusValue } from "../../types";
import clsx from "clsx";
import { Diff } from "lucide-react";

import { GhostwriterIndicator } from "../../components/atelier/GhostwriterIndicator";
import { MarkdownEditor } from "../../components/atelier/MarkdownEditor";
import { Badge } from "../../components/ui/Badge";
import { Drawer } from "../../components/ui/Drawer";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { AiGenerateDrawer } from "../../components/writing/AiGenerateDrawer";
import { BatchGenerationModal } from "../../components/writing/BatchGenerationModal";
import { ChapterAnalysisModal } from "../../components/writing/ChapterAnalysisModal";
import { ChapterListPanel } from "../../components/writing/ChapterListPanel";
import { ChapterVersionsDrawer } from "../../components/writing/ChapterVersionsDrawer";
import { ContentOptimizeCompareDrawer } from "../../components/writing/ContentOptimizeCompareDrawer";
import { ContextPreviewDrawer } from "../../components/writing/ContextPreviewDrawer";
import { CreateChapterDialog } from "../../components/writing/CreateChapterDialog";
import { ForeshadowDrawer } from "../../components/writing/ForeshadowDrawer";
import { GenerationHistoryDrawer } from "../../components/writing/GenerationHistoryDrawer";
import { MemoryUpdateDrawer } from "../../components/writing/MemoryUpdateDrawer";
import { PostEditCompareDrawer } from "../../components/writing/PostEditCompareDrawer";
import { PromptInspectorDrawer } from "../../components/writing/PromptInspectorDrawer";
import { TablesPanel } from "../../components/writing/TablesPanel";
import { WritingToolbar } from "../../components/writing/WritingToolbar";
import { formatDateTime } from "../../lib/dateTime";
import type { Chapter, ChapterListItem } from "../../types";

import type { ChapterForm } from "./writingUtils";
import {
  CHAPTER_LIST_SIDEBAR_WIDTH_CLASS,
  getChapterWorkflowState,
  type ChapterWorkflowAction,
  type ChapterWorkflowActionId,
} from "./writingPageModels";
import {
  getWritingChapterHeading,
  getWritingGenerateIndicatorLabel,
  getWritingReadonlyCallout,
  WRITING_PAGE_COPY,
} from "./writingPageCopy";

export type WritingEditorSectionProps = {
  activeChapter: Chapter | null;
  form: ChapterForm | null;
  dirty: boolean;
  isDoneReadonly: boolean;
  loadingChapter: boolean;
  generating: boolean;
  saving: boolean;
  statusUpdating: boolean;
  autoUpdatesTriggering: boolean;
  memoryUpdateFailed: boolean;
  memoryUpdateStatus?: ChapterMemoryUpdateStatusValue | null;
  hasNonEmptyContent: boolean;
  contentEditorTab: "edit" | "preview";
  onContentEditorTabChange: (tab: "edit" | "preview") => void;
  onTitleChange: (value: string) => void;
  onWorkflowAction: (actionId: ChapterWorkflowActionId) => void;
  onPlanChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  onContentTextareaRef: (element: HTMLTextAreaElement | null) => void;
  onOpenAnalysis: () => void;
  onOpenChapterTrace: () => void;
  onOpenVersions: () => void;
  onComparePreviousVersion: () => void;
  versionCompareDisabled: boolean;
  versionCompareDisabledReason?: string | null;
  generationIndicatorLabel?: string;
};

function WorkflowActionButton(props: {
  action: ChapterWorkflowAction | null;
  onWorkflowAction: (actionId: ChapterWorkflowActionId) => void;
  variant?: "primary" | "secondary";
}) {
  const action = props.action;
  if (!action) return null;

  return (
    <button
      className={clsx(
        "btn min-h-10 w-full px-4 shadow-sm sm:w-auto",
        action.danger ? "btn-danger" : props.variant === "primary" ? "btn-primary" : "btn-secondary",
      )}
      disabled={action.disabled}
      onClick={() => props.onWorkflowAction(action.id)}
      type="button"
    >
      {action.disabled && action.pendingLabel ? action.pendingLabel : action.label}
    </button>
  );
}

type WorkflowStatusTone = "neutral" | "success" | "warning" | "danger" | "info";

function getStatusToneClasses(tone: WorkflowStatusTone): string {
  if (tone === "success") return "bg-success/10 text-success";
  if (tone === "warning") return "bg-warning/10 text-warning";
  if (tone === "danger") return "bg-danger/10 text-danger";
  if (tone === "info") return "bg-info/10 text-info";
  return "bg-surface text-subtext";
}

function getMemoryStatusTone(label: string): WorkflowStatusTone {
  if (label.includes("失败")) return "danger";
  if (label.includes("更新中")) return "info";
  if (label.includes("不可")) return "neutral";
  return "warning";
}

function WorkflowStatusBadge(props: { label: string; value: string; tone?: WorkflowStatusTone }) {
  const tone = props.tone ?? "neutral";

  return (
    <span className="inline-flex min-h-7 min-w-0 flex-wrap items-center gap-2 rounded-md bg-surface/70 px-2.5 py-1 text-xs text-subtext">
      <span className="shrink-0">{props.label}</span>
      <span
        className={clsx(
          "inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 font-semibold break-words",
          getStatusToneClasses(tone),
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        {props.value}
      </span>
    </span>
  );
}

export function WritingEditorSection(props: WritingEditorSectionProps) {
  if (!props.activeChapter || !props.form) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-4xl rounded-atelier border border-border bg-surface p-4 text-sm text-subtext shadow-sm sm:p-8">
        {WRITING_PAGE_COPY.emptyState}
      </div>
    );
  }

  const workflow = getChapterWorkflowState({
    status: props.activeChapter.status,
    dirty: props.dirty,
    hasNonEmptyContent: props.hasNonEmptyContent,
    loadingChapter: props.loadingChapter,
    generating: props.generating,
    saving: props.saving,
    statusUpdating: props.statusUpdating,
    autoUpdatesTriggering: props.autoUpdatesTriggering,
    activeChapterId: props.activeChapter.id,
    memoryUpdateStatus: props.memoryUpdateStatus,
    memoryUpdateFailed: props.memoryUpdateFailed,
  });

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl rounded-atelier border border-border bg-surface p-3 shadow-sm sm:p-5">
      {props.isDoneReadonly ? (
        <div className="callout-warning mb-4">
          <div className="text-xs">{getWritingReadonlyCallout()}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="grid min-w-0 flex-1 gap-4 xl:max-w-[420px]">
          <div className="font-content text-2xl text-ink">
            {getWritingChapterHeading(props.activeChapter.number)}{" "}
            <span className="text-subtext">{props.dirty ? WRITING_PAGE_COPY.dirtyBadge : ""}</span>
          </div>
          <div className="mt-1 text-xs text-subtext">
            {WRITING_PAGE_COPY.updatedAtPrefix} {formatDateTime(props.activeChapter.updated_at)}
          </div>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">{WRITING_PAGE_COPY.titleLabel}</span>
            <input
              className="input-underline font-content text-xl"
              name="title"
              value={props.form.title}
              readOnly={props.isDoneReadonly}
              onChange={(event) => props.onTitleChange(event.target.value)}
            />
          </label>
        </div>
        <div className="grid min-w-0 gap-3 xl:min-w-[560px] xl:max-w-[720px]">
          <div className="flex flex-wrap items-center justify-start gap-3 xl:justify-end">
            <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
              <button
                className="btn btn-secondary min-h-10 w-full px-4 shadow-sm sm:w-auto"
                disabled={props.loadingChapter || props.generating}
                onClick={props.onOpenVersions}
                type="button"
              >
                {WRITING_PAGE_COPY.versions}
              </button>
              <button
                className="btn btn-secondary min-h-10 w-full px-4 shadow-sm sm:w-auto"
                disabled={props.versionCompareDisabled}
                onClick={props.onComparePreviousVersion}
                title={props.versionCompareDisabledReason ?? "对比当前激活版本和上一个更早版本"}
                type="button"
              >
                <Diff className="h-4 w-4" aria-hidden="true" />
                {WRITING_PAGE_COPY.versionCompare}
              </button>
              <button
                className="btn btn-secondary min-h-10 w-full px-4 shadow-sm sm:w-auto"
                disabled={props.loadingChapter || props.generating}
                onClick={props.onOpenAnalysis}
                type="button"
              >
                {WRITING_PAGE_COPY.analysis}
              </button>
              <button
                className="btn btn-secondary min-h-10 w-full px-4 shadow-sm sm:w-auto"
                disabled={props.loadingChapter || props.generating}
                onClick={props.onOpenChapterTrace}
                type="button"
              >
                {WRITING_PAGE_COPY.trace}
              </button>
            </div>
            <div className="hidden h-8 w-px bg-border/80 sm:block" aria-hidden="true" />
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-start sm:gap-2.5 xl:justify-end">
              <WorkflowActionButton
                action={workflow.secondaryAction}
                onWorkflowAction={props.onWorkflowAction}
                variant="secondary"
              />
              <WorkflowActionButton
                action={workflow.primaryAction}
                onWorkflowAction={props.onWorkflowAction}
                variant="primary"
              />
              {workflow.moreActions.length ? (
                <details className="relative col-span-2 sm:col-auto">
                  <summary className="btn btn-secondary min-h-10 w-full cursor-pointer list-none px-4 shadow-sm sm:w-auto">
                    {WRITING_PAGE_COPY.moreActions}
                  </summary>
                  <div className="absolute bottom-full right-0 z-30 mb-2 grid min-w-28 max-w-[calc(100vw-2rem)] gap-1 rounded-atelier border border-border bg-surface p-1 shadow-panel">
                    {workflow.moreActions.map((action) => (
                      <button
                        className={clsx(
                          "ui-focus-ring ui-transition-fast flex min-h-8 w-full items-center justify-start rounded-md px-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60",
                          action.danger ? "text-danger hover:bg-danger/10" : "text-ink hover:bg-canvas",
                        )}
                        disabled={action.disabled}
                        key={action.id}
                        onClick={() => props.onWorkflowAction(action.id)}
                        type="button"
                      >
                        {action.disabled && action.pendingLabel ? action.pendingLabel : action.label}
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </div>

          <div className="grid justify-items-start gap-3 xl:justify-items-end">
            <div
              className="flex min-w-0 flex-wrap items-center justify-start gap-1.5 rounded-atelier border border-border/70 bg-canvas/50 p-1 shadow-inner xl:justify-end"
              aria-live="polite"
            >
              <WorkflowStatusBadge
                label={WRITING_PAGE_COPY.writingStatusLabel}
                value={workflow.writingStatusLabel}
                tone={props.activeChapter.status === "done" ? "success" : "neutral"}
              />
              <WorkflowStatusBadge
                label={WRITING_PAGE_COPY.memoryStatusLabel}
                value={workflow.memoryStatusLabel}
                tone={getMemoryStatusTone(workflow.memoryStatusLabel)}
              />
              {workflow.dirtyLabel ? (
                <Badge
                  className="min-w-0 rounded-md px-2.5 py-1 text-xs font-semibold break-words ring-1 ring-warning/30"
                  tone="warning"
                >
                  {workflow.dirtyLabel}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {props.generating ? (
        <GhostwriterIndicator
          className="mt-4"
          label={props.generationIndicatorLabel ?? getWritingGenerateIndicatorLabel()}
        />
      ) : null}

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1">
          <span className="text-xs text-subtext">{WRITING_PAGE_COPY.planLabel}</span>
          <textarea
            className="textarea atelier-content"
            name="plan"
            rows={4}
            value={props.form.plan}
            readOnly={props.isDoneReadonly}
            onChange={(event) => props.onPlanChange(event.target.value)}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-subtext">{WRITING_PAGE_COPY.contentLabel}</span>
          <MarkdownEditor
            value={props.form.content_md}
            onChange={props.onContentChange}
            placeholder={WRITING_PAGE_COPY.contentPlaceholder}
            minRows={16}
            name="content_md"
            readOnly={props.isDoneReadonly}
            tab={props.contentEditorTab}
            onTabChange={props.onContentEditorTabChange}
            textareaRef={props.onContentTextareaRef}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-subtext">{WRITING_PAGE_COPY.summaryLabel}</span>
          <textarea
            className="textarea atelier-content"
            name="summary"
            rows={3}
            value={props.form.summary}
            readOnly={props.isDoneReadonly}
            onChange={(event) => props.onSummaryChange(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 text-xs text-subtext">{WRITING_PAGE_COPY.hotkeyHint}</div>
    </div>
  );
}

export type WritingWorkspaceProps = {
  toolbarProps: Omit<ComponentProps<typeof WritingToolbar>, "onOpenChapterList">;
  chapterListProps: {
    chapters: ChapterListItem[];
    activeId: string | null;
    onSelectChapter: (chapterId: string) => void;
    onOpenDrawer: () => void;
  };
  editorProps: WritingEditorSectionProps;
};

export function WritingWorkspace(props: WritingWorkspaceProps) {
  return (
    <>
      <WritingToolbar {...props.toolbarProps} onOpenChapterList={props.chapterListProps.onOpenDrawer} />
      <div className="flex min-w-0 gap-4">
        <aside className={`hidden ${CHAPTER_LIST_SIDEBAR_WIDTH_CLASS} shrink-0 lg:block`}>
          <ChapterListPanel
            chapters={props.chapterListProps.chapters}
            activeId={props.chapterListProps.activeId}
            onSelectChapter={props.chapterListProps.onSelectChapter}
          />
        </aside>

        <section className="min-w-0 flex-1 overflow-x-hidden">
          <WritingEditorSection {...props.editorProps} />
        </section>
      </div>
    </>
  );
}

export type WritingChapterListDrawerProps = {
  open: boolean;
  chapters: ChapterListItem[];
  activeId: string | null;
  onClose: () => void;
  onSelectChapter: (chapterId: string) => void;
};

export function WritingChapterListDrawer(props: WritingChapterListDrawerProps) {
  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      side="left"
      overlayClassName="lg:hidden"
      ariaLabel="章节列表"
      panelClassName="flex h-full w-[min(320px,calc(100vw-1rem))] flex-col overflow-hidden border-r border-border bg-surface shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-sm text-ink">章节列表</div>
        <button className="btn btn-secondary" onClick={props.onClose} type="button">
          关闭
        </button>
      </div>

      <div className="min-h-0 flex-1 p-2">
        <ChapterListPanel
          chapters={props.chapters}
          activeId={props.activeId}
          containerClassName="h-full"
          onSelectChapter={(chapterId) => {
            props.onClose();
            props.onSelectChapter(chapterId);
          }}
        />
      </div>
    </Drawer>
  );
}

export type WritingStreamFloatingCardProps = {
  open: boolean;
  requestId: string | null;
  message?: string;
  progress: number;
  onExpand: () => void;
  onCancel: () => void;
};

export function WritingStreamFloatingCard(props: WritingStreamFloatingCardProps) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex justify-center sm:inset-auto sm:bottom-8 sm:right-8 sm:justify-end">
      <div className="w-full max-w-sm rounded-atelier border border-border bg-surface/90 p-3 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-ink">{WRITING_PAGE_COPY.streamFloatingTitle}</div>
            <div className="mt-1 truncate text-xs text-subtext">
              {props.message ?? WRITING_PAGE_COPY.streamFloatingPending}
            </div>
            {props.requestId ? (
              <div className="mt-1 truncate text-[11px] text-subtext">request_id: {props.requestId}</div>
            ) : null}
          </div>
          <div className="shrink-0 text-xs text-subtext">{Math.max(0, Math.min(100, props.progress))}%</div>
        </div>
        <ProgressBar ariaLabel="写作页流式生成进度" className="mt-2" value={props.progress} />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button className="btn btn-secondary" onClick={props.onExpand} type="button">
            {WRITING_PAGE_COPY.streamFloatingExpand}
          </button>
          <button className="btn btn-secondary" onClick={props.onCancel} type="button">
            {WRITING_PAGE_COPY.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

export type WritingPageOverlaysProps = {
  createChapterDialogProps: ComponentProps<typeof CreateChapterDialog>;
  batchGenerationModalProps: ComponentProps<typeof BatchGenerationModal>;
  chapterAnalysisModalProps: ComponentProps<typeof ChapterAnalysisModal>;
  aiGenerateDrawerProps: ComponentProps<typeof AiGenerateDrawer>;
  postEditCompareDrawerProps: ComponentProps<typeof PostEditCompareDrawer>;
  contentOptimizeCompareDrawerProps: ComponentProps<typeof ContentOptimizeCompareDrawer>;
  chapterVersionsDrawerProps: ComponentProps<typeof ChapterVersionsDrawer>;
  promptInspectorDrawerProps: ComponentProps<typeof PromptInspectorDrawer>;
  contextPreviewDrawerProps: ComponentProps<typeof ContextPreviewDrawer>;
  tablesPanelProps: ComponentProps<typeof TablesPanel>;
  memoryUpdateDrawerProps: ComponentProps<typeof MemoryUpdateDrawer>;
  foreshadowDrawerProps: ComponentProps<typeof ForeshadowDrawer>;
  generationHistoryDrawerProps: ComponentProps<typeof GenerationHistoryDrawer>;
};

export function WritingPageOverlays(props: WritingPageOverlaysProps) {
  return (
    <>
      <CreateChapterDialog {...props.createChapterDialogProps} />
      <BatchGenerationModal {...props.batchGenerationModalProps} />
      <ChapterAnalysisModal {...props.chapterAnalysisModalProps} />
      <AiGenerateDrawer {...props.aiGenerateDrawerProps} />
      <PostEditCompareDrawer {...props.postEditCompareDrawerProps} />
      <ContentOptimizeCompareDrawer {...props.contentOptimizeCompareDrawerProps} />
      <ChapterVersionsDrawer {...props.chapterVersionsDrawerProps} />
      <PromptInspectorDrawer {...props.promptInspectorDrawerProps} />
      <ContextPreviewDrawer {...props.contextPreviewDrawerProps} />
      <TablesPanel {...props.tablesPanelProps} />
      <MemoryUpdateDrawer {...props.memoryUpdateDrawerProps} />
      <ForeshadowDrawer {...props.foreshadowDrawerProps} />
      <GenerationHistoryDrawer {...props.generationHistoryDrawerProps} />
    </>
  );
}
