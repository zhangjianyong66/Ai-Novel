import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { WizardNextBar } from "../../components/atelier/WizardNextBar";
import { useConfirm } from "../../components/ui/confirm";
import { useToast } from "../../components/ui/toast";
import { usePersistentOutletIsActive } from "../../hooks/usePersistentOutlet";
import { useProjectData } from "../../hooks/useProjectData";
import { useProjectTaskEvents } from "../../hooks/useProjectTaskEvents";
import { useWizardProgress } from "../../hooks/useWizardProgress";
import { createRequestSeqGuard } from "../../lib/requestSeqGuard";
import { ApiError, apiJson } from "../../services/apiClient";
import { chapterStore } from "../../services/chapterStore";
import {
  activateChapterVersion,
  fetchChapterMemoryUpdateStatus,
  fetchChapterVersionDetail,
  fetchChapterVersions,
} from "../../services/chaptersApi";
import { getWizardProjectChangedAt, markWizardProjectChanged } from "../../services/wizard";
import type {
  ChapterMemoryUpdateStatusValue,
  ChapterStatus,
  ChapterVersionDetail,
  ChapterVersionSummary,
  Character,
  LLMPreset,
  Outline,
  OutlineListItem,
} from "../../types";

import type {
  WritingChapterListDrawerProps,
  WritingEditorSectionProps,
  WritingPageOverlaysProps,
  WritingStreamFloatingCardProps,
  WritingWorkspaceProps,
} from "./WritingPageSections";
import { useApplyGenerationRun } from "./useApplyGenerationRun";
import { useBatchGeneration } from "./useBatchGeneration";
import { useChapterAnalysis } from "./useChapterAnalysis";
import { useChapterCrud } from "./useChapterCrud";
import { useChapterEditor } from "./useChapterEditor";
import { useChapterGeneration } from "./useChapterGeneration";
import { useGenerationHistory } from "./useGenerationHistory";
import { useOutlineSwitcher } from "./useOutlineSwitcher";
import {
  buildBatchTaskCenterHref,
  getChapterFinalizationRisk,
  buildProjectTaskCenterHref,
  buildWritingTaskCenterHref,
  hasNonEmptyChapterContent,
  pickFirstProjectTaskId,
  type ChapterAutoUpdatesTriggerResult,
  type ChapterWorkflowActionId,
} from "./writingPageModels";
import {
  getWritingAnalysisHref,
  getWritingDoneOnlyWarning,
  getWritingGenerateIndicatorLabel,
  getWritingNextChapterReplaceTitle,
  WRITING_PAGE_COPY,
} from "./writingPageCopy";

type WritingLoaded = {
  outlines: OutlineListItem[];
  outline: Outline;
  preset: LLMPreset;
  characters: Character[];
};

export type WritingPageState = {
  loading: boolean;
  dirty: boolean;
  showUnsavedGuard: boolean;
  workspaceProps: WritingWorkspaceProps;
  chapterListDrawerProps: WritingChapterListDrawerProps;
  overlaysProps: WritingPageOverlaysProps;
  streamFloatingProps: WritingStreamFloatingCardProps;
  wizardBarProps: ComponentProps<typeof WizardNextBar>;
};

export function useWritingPageState(): WritingPageState {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedChapterId = searchParams.get("chapterId");
  const applyRunId = searchParams.get("applyRunId");
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const outletActive = usePersistentOutletIsActive();
  const wizard = useWizardProgress(projectId);
  const refreshWizard = wizard.refresh;
  const bumpWizardLocal = wizard.bumpLocal;
  const lastProjectChangedAtRef = useRef<string | null>(null);

  const [chapterListOpen, setChapterListOpen] = useState(false);
  const [contentEditorTab, setContentEditorTab] = useState<"edit" | "preview">("edit");
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autoGenerateNextRef = useRef<{ chapterId: string; mode: "replace" | "append" } | null>(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [promptInspectorOpen, setPromptInspectorOpen] = useState(false);
  const [postEditCompareOpen, setPostEditCompareOpen] = useState(false);
  const [contentOptimizeCompareOpen, setContentOptimizeCompareOpen] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(false);
  const [contextPreviewOpen, setContextPreviewOpen] = useState(false);
  const [memoryUpdateOpen, setMemoryUpdateOpen] = useState(false);
  const [foreshadowOpen, setForeshadowOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionDetailLoading, setVersionDetailLoading] = useState(false);
  const [versionActivating, setVersionActivating] = useState(false);
  const [chapterVersions, setChapterVersions] = useState<ChapterVersionSummary[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ChapterVersionDetail | null>(null);
  const [versionCompareMode, setVersionCompareMode] = useState(false);
  const [versionCompareLoading, setVersionCompareLoading] = useState(false);
  const [versionCompareBaseId, setVersionCompareBaseId] = useState("");
  const [versionCompareBase, setVersionCompareBase] = useState<ChapterVersionDetail | null>(null);
  const versionListGuardRef = useRef(createRequestSeqGuard());
  const versionDetailGuardRef = useRef(createRequestSeqGuard());
  const versionCompareGuardRef = useRef(createRequestSeqGuard());
  const memoryStatusGuardRef = useRef(createRequestSeqGuard());
  const memoryStatusSyncTimerRef = useRef<number | null>(null);
  const [autoUpdatesTriggering, setAutoUpdatesTriggering] = useState(false);
  const [memoryUpdateFailedChapterId, setMemoryUpdateFailedChapterId] = useState<string | null>(null);
  const [memoryUpdateStatus, setMemoryUpdateStatus] = useState<ChapterMemoryUpdateStatusValue | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const writingQuery = useProjectData<WritingLoaded>(projectId, async (id) => {
    const [outlineRes, presetRes, charactersRes] = await Promise.all([
      apiJson<{ outline: Outline }>(`/api/projects/${id}/outline`),
      apiJson<{ llm_preset: LLMPreset }>(`/api/projects/${id}/llm_preset`),
      apiJson<{ characters: Character[] }>(`/api/projects/${id}/characters`),
    ]);
    const outlinesRes = await apiJson<{ outlines: OutlineListItem[] }>(`/api/projects/${id}/outlines`);
    return {
      outlines: outlinesRes.data.outlines,
      outline: outlineRes.data.outline,
      preset: presetRes.data.llm_preset,
      characters: charactersRes.data.characters,
    };
  });
  const outlines = writingQuery.data?.outlines ?? [];
  const outline = writingQuery.data?.outline ?? null;
  const characters = writingQuery.data?.characters ?? [];
  const preset = writingQuery.data?.preset ?? null;
  const refreshWriting = writingQuery.refresh;

  const chapterEditor = useChapterEditor({
    projectId,
    requestedChapterId,
    searchParams,
    setSearchParams,
    toast,
    confirm,
    refreshWizard,
    bumpWizardLocal,
  });
  const {
    loading,
    chapters,
    refreshChapters,
    activeId,
    setActiveId,
    activeChapter,
    form,
    setForm,
    dirty,
    saveChapter,
    applyChapterDetail,
    requestSelectChapter: requestSelectChapterBase,
    loadingChapter,
    saving,
  } = chapterEditor;

  useEffect(() => {
    if (!projectId) {
      lastProjectChangedAtRef.current = null;
      return;
    }
    lastProjectChangedAtRef.current = getWizardProjectChangedAt(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !outletActive || dirty) return;
    const changedAt = getWizardProjectChangedAt(projectId);
    if ((changedAt ?? null) === (lastProjectChangedAtRef.current ?? null)) return;
    lastProjectChangedAtRef.current = changedAt;
    void refreshWriting();
    void refreshChapters();
    void refreshWizard();
  }, [dirty, outletActive, projectId, refreshChapters, refreshWriting, refreshWizard]);

  useEffect(() => {
    if (!activeChapter) autoGenerateNextRef.current = null;
  }, [activeChapter]);

  const isDoneReadonly = activeChapter?.status === "done";
  const memoryUpdateFailed = Boolean(activeChapter?.id && memoryUpdateFailedChapterId === activeChapter.id);
  const activeVersionId = activeChapter?.active_version_id ?? activeChapter?.active_version?.id ?? null;

  const refreshMemoryUpdateStatus = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!activeChapter) {
        memoryStatusGuardRef.current.invalidate();
        setMemoryUpdateStatus(null);
        return;
      }
      if (activeChapter.status !== "done") {
        memoryStatusGuardRef.current.invalidate();
        setMemoryUpdateStatus("unavailable");
        return;
      }
      const seq = memoryStatusGuardRef.current.next();
      try {
        const status = await fetchChapterMemoryUpdateStatus(activeChapter.id);
        if (!memoryStatusGuardRef.current.isLatest(seq)) return;
        setMemoryUpdateStatus(status.status);
        if (status.status !== "failed") {
          setMemoryUpdateFailedChapterId((current) => (current === activeChapter.id ? null : current));
        } else {
          setMemoryUpdateFailedChapterId(activeChapter.id);
        }
      } catch (error) {
        if (!memoryStatusGuardRef.current.isLatest(seq)) return;
        if (!opts?.silent) {
          const err =
            error instanceof ApiError
              ? error
              : new ApiError({ code: "UNKNOWN", message: String(error), requestId: "unknown", status: 0 });
          toast.toastError(`${err.message} (${err.code})`, err.requestId);
        }
      }
    },
    [activeChapter, toast],
  );

  useEffect(() => {
    void refreshMemoryUpdateStatus({ silent: true });
  }, [refreshMemoryUpdateStatus]);

  const scheduleMemoryStatusSync = useCallback(() => {
    if (typeof window === "undefined") return;
    if (memoryStatusSyncTimerRef.current !== null) {
      window.clearTimeout(memoryStatusSyncTimerRef.current);
    }
    memoryStatusSyncTimerRef.current = window.setTimeout(() => {
      memoryStatusSyncTimerRef.current = null;
      void refreshMemoryUpdateStatus({ silent: true });
    }, 150);
  }, [refreshMemoryUpdateStatus]);

  const projectTaskEvents = useProjectTaskEvents({
    projectId,
    enabled: Boolean(projectId && activeChapter?.status === "done"),
    onSnapshot: (snapshot) => {
      if ((snapshot.active_tasks || []).some((task) => task.kind === "plot_auto_update")) {
        scheduleMemoryStatusSync();
      }
    },
    onEvent: (event) => {
      if (event.kind !== "plot_auto_update") return;
      const eventChapterId =
        typeof event.payload?.chapter_id === "string" ? String(event.payload.chapter_id).trim() : "";
      if (eventChapterId && eventChapterId !== activeChapter?.id) return;
      scheduleMemoryStatusSync();
    },
  });

  useEffect(() => {
    return () => {
      if (memoryStatusSyncTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(memoryStatusSyncTimerRef.current);
        memoryStatusSyncTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (projectTaskEvents.status === "open") return;
    if (memoryUpdateStatus !== "updating") return;
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      void refreshMemoryUpdateStatus({ silent: true });
    }, 2000);
    return () => window.clearInterval(id);
  }, [memoryUpdateStatus, projectTaskEvents.status, refreshMemoryUpdateStatus]);

  useApplyGenerationRun({
    applyRunId,
    activeChapter,
    form,
    dirty,
    confirm,
    toast,
    saveChapter,
    searchParams,
    setSearchParams,
    setForm,
  });

  const requestSelectChapter = useCallback(
    async (chapterId: string) => {
      autoGenerateNextRef.current = null;
      await requestSelectChapterBase(chapterId);
    },
    [requestSelectChapterBase],
  );

  const chapterCrud = useChapterCrud({
    projectId,
    chapters,
    activeChapter,
    setActiveId,
    requestSelectChapter,
    toast,
    confirm,
    bumpWizardLocal,
    refreshWizard,
  });

  const generation = useChapterGeneration({
    projectId,
    activeChapter,
    chapters,
    form,
    setForm,
    preset,
    dirty,
    saveChapter,
    requestSelectChapter,
    onChapterPersisted: applyChapterDetail,
    toast,
    confirm,
  });
  const {
    generating,
    genRequestId,
    genStreamProgress,
    genForm,
    setGenForm,
    postEditCompare,
    applyPostEditVariant,
    contentOptimizeCompare,
    applyContentOptimizeVariant,
    generate,
    abortGenerate,
  } = generation;

  const batch = useBatchGeneration({
    projectId,
    preset,
    activeChapter,
    chapters,
    genForm,
    searchParams,
    setSearchParams,
    requestSelectChapter,
    toast,
  });
  const analysis = useChapterAnalysis({
    activeChapter,
    preset,
    genForm,
    form,
    setForm,
    onChapterPersisted: applyChapterDetail,
    dirty,
    saveChapter,
    toast,
  });
  const history = useGenerationHistory({ projectId, toast });

  const loadChapterVersionList = useCallback(
    async (options?: { reportError?: boolean }): Promise<ChapterVersionSummary[]> => {
      if (!activeChapter) return [];
      const seq = versionListGuardRef.current.next();
      const reportError = options?.reportError ?? true;
      setVersionsLoading(true);
      try {
        const data = await fetchChapterVersions(activeChapter.id);
        const versions = data.versions ?? [];
        if (versionListGuardRef.current.isLatest(seq)) {
          setChapterVersions(versions);
        }
        return versions;
      } catch (error) {
        if (reportError && versionListGuardRef.current.isLatest(seq)) {
          const err =
            error instanceof ApiError
              ? error
              : new ApiError({ code: "UNKNOWN", message: String(error), requestId: "unknown", status: 0 });
          toast.toastError(`${err.message} (${err.code})`, err.requestId);
        }
        return [];
      } finally {
        if (versionListGuardRef.current.isLatest(seq)) {
          setVersionsLoading(false);
        }
      }
    },
    [activeChapter, toast],
  );

  const loadChapterVersions = useCallback(async () => {
    if (!activeChapter) return;
    const versions = await loadChapterVersionList();
    const first = versions[0] ?? null;
    setVersionCompareMode(false);
    setVersionCompareBaseId("");
    setVersionCompareBase(null);
    if (!first) {
      setSelectedVersion(null);
      return;
    }
    setVersionsLoading(true);
    try {
      const seq = versionDetailGuardRef.current.next();
      setVersionDetailLoading(true);
      try {
        const detail = await fetchChapterVersionDetail(activeChapter.id, first.id);
        if (versionDetailGuardRef.current.isLatest(seq)) {
          setSelectedVersion(detail);
        }
      } finally {
        if (versionDetailGuardRef.current.isLatest(seq)) {
          setVersionDetailLoading(false);
        }
      }
    } catch (error) {
      const err =
        error instanceof ApiError
          ? error
          : new ApiError({ code: "UNKNOWN", message: String(error), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setVersionsLoading(false);
    }
  }, [activeChapter, loadChapterVersionList, toast]);

  useEffect(() => {
    versionListGuardRef.current.invalidate();
    versionDetailGuardRef.current.invalidate();
    versionCompareGuardRef.current.invalidate();
    setChapterVersions([]);
    setSelectedVersion(null);
    setVersionCompareMode(false);
    setVersionCompareBaseId("");
    setVersionCompareBase(null);
    if (!activeChapter) return;
    void loadChapterVersionList({ reportError: false });
  }, [activeChapter, loadChapterVersionList]);

  const openVersions = useCallback(() => {
    setVersionsOpen(true);
    void loadChapterVersions();
  }, [loadChapterVersions]);

  const selectVersion = useCallback(
    async (versionId: string) => {
      if (!activeChapter) return;
      const seq = versionDetailGuardRef.current.next();
      setVersionDetailLoading(true);
      try {
        const detail = await fetchChapterVersionDetail(activeChapter.id, versionId);
        if (!versionDetailGuardRef.current.isLatest(seq)) return;
        setSelectedVersion(detail);
        setVersionCompareMode(false);
        setVersionCompareBaseId("");
        setVersionCompareBase(null);
      } catch (error) {
        if (!versionDetailGuardRef.current.isLatest(seq)) return;
        const err =
          error instanceof ApiError
            ? error
            : new ApiError({ code: "UNKNOWN", message: String(error), requestId: "unknown", status: 0 });
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        if (versionDetailGuardRef.current.isLatest(seq)) {
          setVersionDetailLoading(false);
        }
      }
    },
    [activeChapter, toast],
  );

  const loadVersionCompareBase = useCallback(
    async (versionId: string) => {
      if (!activeChapter || !versionId) return;
      const seq = versionCompareGuardRef.current.next();
      setVersionCompareBaseId(versionId);
      setVersionCompareLoading(true);
      try {
        const detail = await fetchChapterVersionDetail(activeChapter.id, versionId);
        if (versionCompareGuardRef.current.isLatest(seq)) {
          setVersionCompareBase(detail);
          setVersionCompareMode(true);
        }
      } catch (error) {
        if (!versionCompareGuardRef.current.isLatest(seq)) return;
        const err =
          error instanceof ApiError
            ? error
            : new ApiError({ code: "UNKNOWN", message: String(error), requestId: "unknown", status: 0 });
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        if (versionCompareGuardRef.current.isLatest(seq)) {
          setVersionCompareLoading(false);
        }
      }
    },
    [activeChapter, toast],
  );

  const compareSelectedWithPreviousVersion = useCallback(() => {
    if (!selectedVersion) return;
    const selectedIndex = chapterVersions.findIndex((version) => version.id === selectedVersion.id);
    const previousVersion = selectedIndex >= 0 ? chapterVersions[selectedIndex + 1] : null;
    if (!previousVersion) {
      toast.toastWarning("没有可对比的上一个版本。");
      return;
    }
    void loadVersionCompareBase(previousVersion.id);
  }, [chapterVersions, loadVersionCompareBase, selectedVersion, toast]);

  const compareActiveWithPreviousVersion = useCallback(async () => {
    if (!activeChapter) return;
    if (dirty) {
      toast.toastWarning(WRITING_PAGE_COPY.versionCompareNeedsSaveFirst);
      return;
    }
    if (!activeVersionId) {
      toast.toastWarning(WRITING_PAGE_COPY.versionCompareUnavailable);
      return;
    }
    const versions = chapterVersions.length > 0 ? chapterVersions : await loadChapterVersionList();
    const activeIndex = versions.findIndex((version) => version.id === activeVersionId);
    const previousVersion = activeIndex >= 0 ? versions[activeIndex + 1] : null;
    const targetVersion = activeIndex >= 0 ? versions[activeIndex] : null;
    if (!targetVersion || !previousVersion) {
      toast.toastWarning(WRITING_PAGE_COPY.versionCompareUnavailable);
      return;
    }

    setVersionsOpen(true);
    setVersionCompareMode(true);
    setVersionCompareBaseId(previousVersion.id);
    setVersionDetailLoading(true);
    setVersionCompareLoading(true);
    const detailSeq = versionDetailGuardRef.current.next();
    const compareSeq = versionCompareGuardRef.current.next();
    try {
      const [targetDetail, baseDetail] = await Promise.all([
        fetchChapterVersionDetail(activeChapter.id, targetVersion.id),
        fetchChapterVersionDetail(activeChapter.id, previousVersion.id),
      ]);
      if (versionDetailGuardRef.current.isLatest(detailSeq)) {
        setSelectedVersion(targetDetail);
      }
      if (versionCompareGuardRef.current.isLatest(compareSeq)) {
        setVersionCompareBase(baseDetail);
      }
    } catch (error) {
      const err =
        error instanceof ApiError
          ? error
          : new ApiError({ code: "UNKNOWN", message: String(error), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      if (versionDetailGuardRef.current.isLatest(detailSeq)) {
        setVersionDetailLoading(false);
      }
      if (versionCompareGuardRef.current.isLatest(compareSeq)) {
        setVersionCompareLoading(false);
      }
    }
  }, [activeChapter, activeVersionId, chapterVersions, dirty, loadChapterVersionList, toast]);

  const activateSelectedVersion = useCallback(async () => {
    if (!activeChapter || !selectedVersion || versionActivating) return;
    if (dirty) {
      toast.toastWarning(WRITING_PAGE_COPY.versionActivateNeedsSaveFirst);
      return;
    }
    if (activeChapter.status === "done") {
      toast.toastWarning(WRITING_PAGE_COPY.versionActivateDoneReadonly);
      return;
    }
    setVersionActivating(true);
    try {
      const result = await activateChapterVersion(activeChapter.id, selectedVersion.id);
      applyChapterDetail(result.chapter);
      setChapterVersions((prev) => prev.map((v) => ({ ...v, is_active: v.id === result.active_version.id })));
      setSelectedVersion((prev) => (prev ? { ...prev, is_active: prev.id === result.active_version.id } : prev));
      markWizardProjectChanged(result.chapter.project_id);
      bumpWizardLocal();
      await refreshWizard();
      toast.toastSuccess(WRITING_PAGE_COPY.versionActivated);
    } catch (error) {
      const err =
        error instanceof ApiError
          ? error
          : new ApiError({ code: "UNKNOWN", message: String(error), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setVersionActivating(false);
    }
  }, [
    activeChapter,
    applyChapterDetail,
    bumpWizardLocal,
    dirty,
    refreshWizard,
    selectedVersion,
    toast,
    versionActivating,
  ]);

  const activeOutlineId = outline?.id ?? "";
  const switchOutline = useOutlineSwitcher({
    projectId,
    activeOutlineId,
    dirty,
    confirm,
    toast,
    saveChapter,
    bumpWizardLocal,
    refreshWizard,
    refreshChapters,
    refreshWriting,
  });

  const locateInEditor = useCallback(
    (excerpt: string) => {
      if (!excerpt || !form) return;
      const needleRaw = excerpt.trim();
      if (!needleRaw) return;

      const haystack = form.content_md ?? "";
      let needle = needleRaw;
      let index = haystack.indexOf(needle);
      if (index < 0 && needle.length > 20) {
        needle = needle.slice(0, 20);
        index = haystack.indexOf(needle);
      }
      if (index < 0) {
        toast.toastError(WRITING_PAGE_COPY.locateExcerptFailed);
        return;
      }

      setContentEditorTab("edit");
      window.requestAnimationFrame(() => {
        const element = contentTextareaRef.current;
        if (!element) return;
        element.focus();
        element.setSelectionRange(index, Math.min(haystack.length, index + needle.length));
      });
    },
    [form, toast],
  );

  const saveAndTriggerAutoUpdates = useCallback(
    async (options?: { force?: boolean }) => {
      if (!projectId || !activeChapter || autoUpdatesTriggering) return;

      setAutoUpdatesTriggering(true);
      try {
        const ok = await saveChapter({ silent: true });
        if (!ok) return;

        const response = await apiJson<ChapterAutoUpdatesTriggerResult>(
          `/api/chapters/${activeChapter.id}/trigger_auto_updates`,
          {
            method: "POST",
            body: JSON.stringify(options?.force ? { force: true } : {}),
          },
        );
        setMemoryUpdateStatus(activeChapter.status === "done" ? "updating" : "unavailable");
        const taskId = pickFirstProjectTaskId(response.data.tasks);
        toast.toastSuccess(
          WRITING_PAGE_COPY.autoUpdatesCreated,
          response.request_id,
          taskId
            ? {
                label: WRITING_PAGE_COPY.openTaskCenter,
                onClick: () => {
                  const href = buildProjectTaskCenterHref(projectId, taskId);
                  if (href) navigate(href);
                },
              }
            : undefined,
        );
        setMemoryUpdateFailedChapterId((current) => (current === activeChapter.id ? null : current));
        scheduleMemoryStatusSync();
      } catch (error) {
        const err =
          error instanceof ApiError
            ? error
            : new ApiError({ code: "UNKNOWN", message: String(error), requestId: "unknown", status: 0 });
        setMemoryUpdateFailedChapterId(activeChapter.id);
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setAutoUpdatesTriggering(false);
      }
    },
    [activeChapter, autoUpdatesTriggering, navigate, projectId, saveChapter, scheduleMemoryStatusSync, toast],
  );

  const updateChapterStatusForChapter = useCallback(
    async (chapter: typeof activeChapter, status: ChapterStatus) => {
      if (!chapter || statusUpdating) return false;
      const expectedStatus = chapter.status;
      if (expectedStatus === "done" && status === "drafting") {
        const ok = await confirm.confirm(WRITING_PAGE_COPY.confirms.reopenChapter);
        if (!ok) return false;
      }

      setStatusUpdating(true);
      try {
        const nextChapter = await chapterStore.updateChapterStatus(chapter.id, {
          status,
          expected_status: expectedStatus,
        });
        applyChapterDetail(nextChapter);
        setMemoryUpdateFailedChapterId((current) => (current === nextChapter.id ? null : current));
        markWizardProjectChanged(nextChapter.project_id);
        bumpWizardLocal();
        await refreshWizard();
        toast.toastSuccess(WRITING_PAGE_COPY.statusUpdateSuccess);
        return true;
      } catch (error) {
        const err =
          error instanceof ApiError
            ? error
            : new ApiError({ code: "UNKNOWN", message: String(error), requestId: "unknown", status: 0 });
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
        if ((err.details as { reason?: unknown } | undefined)?.reason === "chapter_status_conflict") {
          void chapterStore
            .loadChapterDetail(chapter.id, { force: true })
            .then(applyChapterDetail)
            .catch(() => undefined);
        }
        return false;
      } finally {
        setStatusUpdating(false);
      }
    },
    [applyChapterDetail, bumpWizardLocal, confirm, refreshWizard, statusUpdating, toast],
  );

  const confirmFinalizeRisk = useCallback(async (): Promise<boolean> => {
    const risk = getChapterFinalizationRisk(analysis.analysisResult);
    if (!risk.confirmRequired) return true;
    return confirm.confirm({
      title: risk.title,
      description: `${risk.description} 你仍然可以强制定稿；定稿表示当前章进入稳定版本，可继续推进后续章节。`,
      confirmText: "仍然定稿",
      cancelText: "取消",
      danger: risk.level === "blocked",
    });
  }, [analysis.analysisResult, confirm]);

  const finalizeAfterSave = useCallback(async () => {
    if (!activeChapter) return;
    const confirmed = await confirmFinalizeRisk();
    if (!confirmed) return;
    const ok = await saveChapter();
    if (!ok) return;

    try {
      const latest = await chapterStore.loadChapterDetail(activeChapter.id, { force: true });
      applyChapterDetail(latest);
      if (latest.status !== "drafting") {
        toast.toastWarning(WRITING_PAGE_COPY.finalizeNeedsDraft);
        return;
      }
      await updateChapterStatusForChapter(latest, "done");
    } catch (error) {
      const err =
        error instanceof ApiError
          ? error
          : new ApiError({ code: "UNKNOWN", message: String(error), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    }
  }, [activeChapter, applyChapterDetail, confirmFinalizeRisk, saveChapter, toast, updateChapterStatusForChapter]);

  const runChapterWorkflowAction = useCallback(
    async (actionId: ChapterWorkflowActionId) => {
      if (!activeChapter) return;
      if (actionId === "save_plan" || actionId === "save_draft") {
        await saveChapter();
        return;
      }
      if (actionId === "save_and_finalize") {
        await finalizeAfterSave();
        return;
      }
      if (actionId === "finalize") {
        const confirmed = await confirmFinalizeRisk();
        if (!confirmed) return;
        await updateChapterStatusForChapter(activeChapter, "done");
        return;
      }
      if (actionId === "reopen_draft") {
        await updateChapterStatusForChapter(activeChapter, "drafting");
        return;
      }
      if (actionId === "mark_planned") {
        await updateChapterStatusForChapter(activeChapter, "planned");
        return;
      }
      if (actionId === "update_memory") {
        await saveAndTriggerAutoUpdates();
        return;
      }
      if (actionId === "retry_memory_update" || actionId === "rerun_memory_update") {
        await saveAndTriggerAutoUpdates({ force: true });
        return;
      }
      if (actionId === "delete") {
        if (dirty) {
          const choice = await confirm.choose(WRITING_PAGE_COPY.confirms.deleteDirtyChapter);
          if (choice === "cancel") return;
          if (choice === "confirm") {
            const ok = await saveChapter();
            if (!ok) return;
          }
        }
        await chapterCrud.deleteChapter();
      }
    },
    [
      activeChapter,
      chapterCrud,
      confirm,
      confirmFinalizeRisk,
      dirty,
      finalizeAfterSave,
      saveAndTriggerAutoUpdates,
      saveChapter,
      updateChapterStatusForChapter,
    ],
  );

  const saveAndGenerateNext = useCallback(async () => {
    if (!activeChapter) return;

    const ok = await saveChapter();
    if (!ok) return;

    const sorted = [...chapters].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    const currentIndex = sorted.findIndex((chapter) => chapter.id === activeChapter.id);
    const nextChapter =
      currentIndex >= 0
        ? (sorted[currentIndex + 1] ?? null)
        : (sorted.find((chapter) => (chapter.number ?? 0) > (activeChapter.number ?? 0)) ?? null);

    if (!nextChapter) {
      toast.toastSuccess(WRITING_PAGE_COPY.saveAndGenerateLastChapter);
      return;
    }

    const nextHasContent = Boolean(nextChapter.has_content || nextChapter.has_summary);
    if (nextHasContent) {
      const replaceOk = await confirm.confirm({
        title: getWritingNextChapterReplaceTitle(nextChapter.number),
        description: WRITING_PAGE_COPY.confirms.nextChapterReplace.description,
        confirmText: WRITING_PAGE_COPY.confirms.nextChapterReplace.confirmText,
        cancelText: WRITING_PAGE_COPY.confirms.nextChapterReplace.cancelText,
        danger: true,
      });
      if (!replaceOk) return;
    }

    autoGenerateNextRef.current = { chapterId: nextChapter.id, mode: "replace" };
    setActiveId(nextChapter.id);
    setAiOpen(true);
  }, [activeChapter, chapters, confirm, saveChapter, setActiveId, toast]);

  useEffect(() => {
    const pending = autoGenerateNextRef.current;
    if (!pending || !activeChapter || !form || generating) return;
    if (activeChapter.id !== pending.chapterId) return;
    autoGenerateNextRef.current = null;
    void generate(pending.mode);
  }, [activeChapter, form, generate, generating]);

  const activeVersionIndex = activeVersionId
    ? chapterVersions.findIndex((version) => version.id === activeVersionId)
    : -1;
  const activePreviousVersion = activeVersionIndex >= 0 ? chapterVersions[activeVersionIndex + 1] : null;
  const versionCompareDisabled = Boolean(
    loadingChapter || generating || dirty || !activeVersionId || (chapterVersions.length > 0 && !activePreviousVersion),
  );
  const versionCompareDisabledReason = dirty
    ? WRITING_PAGE_COPY.versionCompareNeedsSaveFirst
    : !activeVersionId || (chapterVersions.length > 0 && !activePreviousVersion)
      ? WRITING_PAGE_COPY.versionCompareUnavailable
      : null;

  const workspaceProps: WritingWorkspaceProps = {
    toolbarProps: {
      outlines,
      activeOutlineId,
      chaptersCount: chapters.length,
      batchProgressText:
        batch.batchTask && (batch.batchTask.status === "queued" || batch.batchTask.status === "running")
          ? `（${batch.batchTask.completed_count}/${batch.batchTask.total_count}）`
          : "",
      aiGenerateDisabled: !activeChapter || loadingChapter,
      onSwitchOutline: (outlineId) => void switchOutline(outlineId),
      onOpenBatch: batch.openModal,
      onOpenHistory: history.openDrawer,
      onOpenAiGenerate: () => setAiOpen(true),
      onOpenMemoryUpdate: () => {
        if (!activeChapter) return;
        if (dirty) {
          toast.toastWarning(WRITING_PAGE_COPY.memoryUpdateNeedsSaveFirst);
          return;
        }
        if (activeChapter.status !== "done") {
          toast.toastWarning(getWritingDoneOnlyWarning());
          return;
        }
        setMemoryUpdateOpen(true);
      },
      onOpenTaskCenter: () => {
        if (!projectId) return;
        navigate(buildWritingTaskCenterHref(projectId, activeId));
      },
      onOpenForeshadow: () => setForeshadowOpen(true),
      onOpenTables: () => setTablesOpen(true),
      onOpenContextPreview: () => setContextPreviewOpen(true),
      onCreateChapter: chapterCrud.openCreate,
    },
    chapterListProps: {
      chapters,
      activeId,
      onSelectChapter: (chapterId) => void requestSelectChapter(chapterId),
      onOpenDrawer: () => setChapterListOpen(true),
    },
    editorProps: {
      activeChapter,
      form,
      dirty,
      isDoneReadonly,
      loadingChapter,
      generating,
      saving,
      statusUpdating,
      autoUpdatesTriggering,
      memoryUpdateStatus,
      memoryUpdateFailed,
      hasNonEmptyContent: hasNonEmptyChapterContent(form?.content_md),
      contentEditorTab,
      onContentEditorTabChange: setContentEditorTab,
      onTitleChange: (value) => setForm((prev) => (prev ? { ...prev, title: value } : prev)),
      onWorkflowAction: (actionId) => void runChapterWorkflowAction(actionId),
      onPlanChange: (value) => setForm((prev) => (prev ? { ...prev, plan: value } : prev)),
      onContentChange: (value) => setForm((prev) => (prev ? { ...prev, content_md: value } : prev)),
      onSummaryChange: (value) => setForm((prev) => (prev ? { ...prev, summary: value } : prev)),
      onContentTextareaRef: (element) => {
        contentTextareaRef.current = element;
      },
      onOpenAnalysis: analysis.openModal,
      onOpenVersions: openVersions,
      onComparePreviousVersion: () => void compareActiveWithPreviousVersion(),
      versionCompareDisabled,
      versionCompareDisabledReason,
      onOpenChapterTrace: () => {
        if (!projectId || !activeChapter) return;
        navigate(getWritingAnalysisHref(projectId, activeChapter.id));
      },
      generationIndicatorLabel:
        genForm.stream && genStreamProgress
          ? getWritingGenerateIndicatorLabel(genStreamProgress.message, genStreamProgress.progress)
          : undefined,
    } satisfies WritingEditorSectionProps,
  };

  const chapterListDrawerProps: WritingChapterListDrawerProps = {
    open: chapterListOpen,
    chapters,
    activeId,
    onClose: () => setChapterListOpen(false),
    onSelectChapter: (chapterId) => void requestSelectChapter(chapterId),
  };

  const overlaysProps: WritingPageOverlaysProps = {
    createChapterDialogProps: {
      open: chapterCrud.createOpen,
      saving: chapterCrud.createSaving,
      form: chapterCrud.createForm,
      setForm: chapterCrud.setCreateForm,
      onClose: () => chapterCrud.setCreateOpen(false),
      onSubmit: () => void chapterCrud.createChapter(),
    },
    batchGenerationModalProps: {
      open: batch.open,
      batchLoading: batch.batchLoading,
      activeChapterNumber: activeChapter?.number ?? null,
      batchCount: batch.batchCount,
      setBatchCount: batch.setBatchCount,
      batchIncludeExisting: batch.batchIncludeExisting,
      setBatchIncludeExisting: batch.setBatchIncludeExisting,
      batchTask: batch.batchTask,
      batchItems: batch.batchItems,
      batchRuntime: batch.batchRuntime,
      projectTaskStreamStatus: batch.projectTaskStreamStatus,
      taskCenterHref: buildBatchTaskCenterHref(projectId, batch.batchTask?.project_task_id),
      onClose: batch.closeModal,
      onCancelTask: () => void batch.cancelBatchGeneration(),
      onPauseTask: () => void batch.pauseBatchGeneration(),
      onResumeTask: () => void batch.resumeBatchGeneration(),
      onRetryFailedTask: () => void batch.retryFailedBatchGeneration(),
      onSkipFailedTask: () => void batch.skipFailedBatchGeneration(),
      onStartTask: () => void batch.startBatchGeneration(),
      onApplyItemToEditor: (item) => void batch.applyBatchItemToEditor(item),
    },
    chapterAnalysisModalProps: {
      open: analysis.open,
      analysisLoading: analysis.analysisLoading,
      rewriteLoading: analysis.rewriteLoading,
      applyLoading: analysis.applyLoading,
      canAnalyze: analysis.canAnalyze,
      analysisFocus: analysis.analysisFocus,
      setAnalysisFocus: analysis.setAnalysisFocus,
      analysisResult: analysis.analysisResult,
      rewriteInstruction: analysis.rewriteInstruction,
      setRewriteInstruction: analysis.setRewriteInstruction,
      onClose: analysis.closeModal,
      onAnalyze: () => void analysis.analyzeChapter(),
      onApplyAnalysisToMemory: () => void analysis.applyAnalysisToMemory(),
      onLocateInEditor: locateInEditor,
      onRewriteFromAnalysis: () => void analysis.rewriteFromAnalysis(),
    },
    aiGenerateDrawerProps: {
      open: aiOpen,
      generating,
      preset,
      projectId,
      activeChapter: Boolean(activeChapter),
      dirty,
      saving: saving || loadingChapter,
      genForm,
      setGenForm,
      instructionOptions: generation.instructionOptions,
      characters,
      streamProgress: genStreamProgress,
      onClose: () => setAiOpen(false),
      onSave: () => void saveChapter(),
      onSaveAndGenerateNext: () => void saveAndGenerateNext(),
      onGenerateAppend: () => void generate("append"),
      onGenerateReplace: () => void generate("replace"),
      onCancelGenerate: abortGenerate,
      onOpenPromptInspector: () => setPromptInspectorOpen(true),
      postEditCompareAvailable: Boolean(postEditCompare),
      onOpenPostEditCompare: () => setPostEditCompareOpen(true),
      contentOptimizeCompareAvailable: Boolean(contentOptimizeCompare),
      onOpenContentOptimizeCompare: () => setContentOptimizeCompareOpen(true),
    },
    postEditCompareDrawerProps: {
      open: postEditCompareOpen && Boolean(postEditCompare),
      onClose: () => setPostEditCompareOpen(false),
      rawContentMd: postEditCompare?.rawContentMd ?? "",
      editedContentMd: postEditCompare?.editedContentMd ?? "",
      requestId: postEditCompare?.requestId ?? null,
      appliedChoice: postEditCompare?.appliedChoice ?? "post_edit",
      onApplyRaw: () => void applyPostEditVariant("raw"),
      onApplyPostEdit: () => void applyPostEditVariant("post_edit"),
    },
    contentOptimizeCompareDrawerProps: {
      open: contentOptimizeCompareOpen && Boolean(contentOptimizeCompare),
      onClose: () => setContentOptimizeCompareOpen(false),
      rawContentMd: contentOptimizeCompare?.rawContentMd ?? "",
      optimizedContentMd: contentOptimizeCompare?.optimizedContentMd ?? "",
      requestId: contentOptimizeCompare?.requestId ?? null,
      appliedChoice: contentOptimizeCompare?.appliedChoice ?? "content_optimize",
      onApplyRaw: () => void applyContentOptimizeVariant("raw"),
      onApplyOptimized: () => void applyContentOptimizeVariant("content_optimize"),
    },
    chapterVersionsDrawerProps: {
      open: versionsOpen,
      loading: versionsLoading,
      detailLoading: versionDetailLoading,
      activating: versionActivating,
      compareMode: versionCompareMode,
      compareLoading: versionCompareLoading,
      versions: chapterVersions,
      selectedVersion,
      compareBaseVersion: versionCompareBase,
      compareBaseVersionId: versionCompareBaseId,
      activeVersionId,
      canActivate: Boolean(activeChapter && !dirty && activeChapter.status !== "done"),
      blockReason: dirty
        ? WRITING_PAGE_COPY.versionActivateNeedsSaveFirst
        : activeChapter?.status === "done"
          ? WRITING_PAGE_COPY.versionActivateDoneReadonly
          : null,
      onClose: () => setVersionsOpen(false),
      onSelectVersion: (versionId) => void selectVersion(versionId),
      onComparePreviousVersion: () => compareSelectedWithPreviousVersion(),
      onCompareBaseVersionChange: (versionId) => void loadVersionCompareBase(versionId),
      onCloseCompare: () => setVersionCompareMode(false),
      onActivateVersion: () => void activateSelectedVersion(),
    },
    promptInspectorDrawerProps: {
      open: promptInspectorOpen,
      onClose: () => setPromptInspectorOpen(false),
      preset,
      chapterId: activeChapter?.id ?? undefined,
      draftContentMd: form?.content_md ?? "",
      generating,
      genForm,
      setGenForm,
      onGenerate: generate,
    },
    contextPreviewDrawerProps: {
      open: contextPreviewOpen,
      onClose: () => setContextPreviewOpen(false),
      projectId,
      outlineId: activeChapter?.outline_id ?? undefined,
      chapterNumber: activeChapter?.number ?? null,
      memoryInjectionEnabled: genForm.memory_injection_enabled,
      genInstruction: genForm.instruction,
      genChapterPlan: activeChapter?.plan ?? "",
      genMemoryQueryText: genForm.memory_query_text,
      genMemoryModules: genForm.memory_modules,
      onChangeMemoryInjectionEnabled: (enabled) =>
        setGenForm((prev) => ({ ...prev, memory_injection_enabled: Boolean(enabled) })),
    },
    tablesPanelProps: {
      open: tablesOpen,
      onClose: () => setTablesOpen(false),
      projectId,
    },
    memoryUpdateDrawerProps: {
      open: memoryUpdateOpen,
      onClose: () => setMemoryUpdateOpen(false),
      projectId,
      chapterId: activeId ?? undefined,
      llmTimeoutSeconds: preset?.timeout_seconds ?? null,
    },
    foreshadowDrawerProps: {
      open: foreshadowOpen,
      onClose: () => setForeshadowOpen(false),
      projectId,
      activeChapterId: activeId ?? undefined,
    },
    generationHistoryDrawerProps: {
      open: history.open,
      onClose: history.closeDrawer,
      loading: history.runsLoading,
      runs: history.runs,
      selectedRun: history.selectedRun,
      onSelectRun: (run) => void history.selectRun(run),
    },
  };

  const streamFloatingProps: WritingStreamFloatingCardProps = {
    open: generating && genForm.stream && !aiOpen,
    requestId: genRequestId,
    message: genStreamProgress?.message,
    progress: genStreamProgress?.progress ?? 0,
    onExpand: () => setAiOpen(true),
    onCancel: abortGenerate,
  };

  return {
    loading,
    dirty,
    showUnsavedGuard: dirty && outletActive,
    workspaceProps,
    chapterListDrawerProps,
    overlaysProps,
    streamFloatingProps,
    wizardBarProps: {
      projectId,
      currentStep: "writing",
      progress: wizard.progress,
      loading: wizard.loading,
      dirty,
      saving: saving || loadingChapter || generating,
      onSave: saveChapter,
    },
  };
}
