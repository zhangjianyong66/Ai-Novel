import type { ComponentProps } from "react";
import clsx from "clsx";

import { GhostwriterIndicator } from "../../components/atelier/GhostwriterIndicator";
import { MarkdownEditor } from "../../components/atelier/MarkdownEditor";
import { Drawer } from "../../components/ui/Drawer";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { AiGenerateDrawer } from "../../components/writing/AiGenerateDrawer";
import { BatchGenerationModal } from "../../components/writing/BatchGenerationModal";
import { ChapterAnalysisModal } from "../../components/writing/ChapterAnalysisModal";
import { ChapterListPanel } from "../../components/writing/ChapterListPanel";
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
import { humanizeChapterStatus } from "../../lib/humanize";
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
  getWritingStatusHint,
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
        "btn btn-sm",
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

export function WritingEditorSection(props: WritingEditorSectionProps) {
  if (!props.activeChapter || !props.form) {
    return (
      <div className="mx-auto w-full max-w-4xl rounded-atelier border border-border bg-surface p-8 text-sm text-subtext shadow-sm">
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
    memoryUpdateFailed: props.memoryUpdateFailed,
  });

  return (
    <div className="mx-auto w-full max-w-4xl rounded-atelier border border-border bg-surface p-5 shadow-sm">
      {props.isDoneReadonly ? (
        <div className="callout-warning mb-4">
          <div className="text-xs">{getWritingReadonlyCallout()}</div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="font-content text-2xl text-ink">
            {getWritingChapterHeading(props.activeChapter.number)}{" "}
            <span className="text-subtext">{props.dirty ? WRITING_PAGE_COPY.dirtyBadge : ""}</span>
          </div>
          <div className="mt-1 text-xs text-subtext">
            {WRITING_PAGE_COPY.updatedAtPrefix} {props.activeChapter.updated_at}
          </div>
        </div>
        <div className="grid gap-3 xl:min-w-[320px] xl:max-w-[420px]">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              className="btn btn-secondary btn-sm"
              disabled={props.loadingChapter || props.generating}
              onClick={props.onOpenAnalysis}
              type="button"
            >
              {WRITING_PAGE_COPY.analysis}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={props.loadingChapter || props.generating}
              onClick={props.onOpenChapterTrace}
              type="button"
            >
              {WRITING_PAGE_COPY.trace}
            </button>
          </div>

          <div className="grid gap-2 text-xs">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-atelier border border-border bg-canvas px-2 py-1 font-medium text-ink">
                {WRITING_PAGE_COPY.writingStatusLabel}: {workflow.writingStatusLabel}
              </span>
              <span className="rounded-atelier border border-border bg-canvas px-2 py-1 font-medium text-subtext">
                {WRITING_PAGE_COPY.memoryStatusLabel}: {workflow.memoryStatusLabel}
              </span>
              {workflow.dirtyLabel ? (
                <span className="rounded-atelier border border-warning/40 bg-warning/10 px-2 py-1 font-medium text-warning">
                  {workflow.dirtyLabel}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
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
                <details className="relative">
                  <summary className="btn btn-secondary btn-sm list-none cursor-pointer">
                    {WRITING_PAGE_COPY.moreActions}
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 grid min-w-36 gap-1 rounded-atelier border border-border bg-surface p-2 shadow-sm">
                    {workflow.moreActions.map((action) => (
                      <button
                        className={clsx("btn btn-sm justify-start", action.danger ? "btn-danger" : "btn-secondary")}
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
        </div>
      </div>

      {props.generating ? (
        <GhostwriterIndicator
          className="mt-4"
          label={props.generationIndicatorLabel ?? getWritingGenerateIndicatorLabel()}
        />
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 sm:col-span-2">
          <span className="text-xs text-subtext">{WRITING_PAGE_COPY.titleLabel}</span>
          <input
            className="input-underline font-content text-xl"
            name="title"
            value={props.form.title}
            readOnly={props.isDoneReadonly}
            onChange={(event) => props.onTitleChange(event.target.value)}
          />
        </label>
        <div className="grid gap-1 sm:col-span-1">
          <span className="text-xs text-subtext">{WRITING_PAGE_COPY.statusLabel}</span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded-atelier border border-border bg-canvas px-2 py-1 text-xs font-medium text-ink">
              {humanizeChapterStatus(props.activeChapter.status)}
            </span>
          </div>
          <div className="text-[11px] text-subtext">{getWritingStatusHint()}</div>
        </div>
      </div>

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
      <div className="flex gap-4">
        <aside className={`hidden ${CHAPTER_LIST_SIDEBAR_WIDTH_CLASS} shrink-0 lg:block`}>
          <ChapterListPanel
            chapters={props.chapterListProps.chapters}
            activeId={props.chapterListProps.activeId}
            onSelectChapter={props.chapterListProps.onSelectChapter}
          />
        </aside>

        <section className="min-w-0 flex-1">
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
      panelClassName={`h-full ${CHAPTER_LIST_SIDEBAR_WIDTH_CLASS} overflow-hidden border-r border-border bg-surface shadow-sm`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-sm text-ink">章节列表</div>
        <button className="btn btn-secondary" onClick={props.onClose} type="button">
          关闭
        </button>
      </div>

      <div className="h-full p-2">
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
    <div className="fixed inset-x-4 bottom-24 z-40 flex justify-center sm:inset-auto sm:bottom-8 sm:right-8 sm:justify-end">
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
        <div className="mt-3 flex justify-end gap-2">
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
      <PromptInspectorDrawer {...props.promptInspectorDrawerProps} />
      <ContextPreviewDrawer {...props.contextPreviewDrawerProps} />
      <TablesPanel {...props.tablesPanelProps} />
      <MemoryUpdateDrawer {...props.memoryUpdateDrawerProps} />
      <ForeshadowDrawer {...props.foreshadowDrawerProps} />
      <GenerationHistoryDrawer {...props.generationHistoryDrawerProps} />
    </>
  );
}
