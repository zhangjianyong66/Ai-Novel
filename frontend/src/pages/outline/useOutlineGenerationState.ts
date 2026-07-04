import { useCallback, useEffect, useRef, useState } from "react";

import type { ConfirmApi } from "../../components/ui/confirm";
import type { ToastApi } from "../../components/ui/toast";
import { ApiError, apiJson } from "../../services/apiClient";
import { SSEError, SSEPostClient } from "../../services/sseClient";
import type { LLMPreset } from "../../types";
import { normalizeOutlineGenResult, parseOutlineGenResultFromText, type OutlineGenResult } from "../outlineParsing";

import { getOutlineStreamRetryMessage, OUTLINE_COPY } from "./outlineCopy";
import {
  DEFAULT_OUTLINE_PACING_OPTIONS,
  DEFAULT_OUTLINE_TONE_OPTIONS,
  appendCappedRawText,
  buildUniqueGeneratedOutlineTitle,
  DEFAULT_OUTLINE_GEN_FORM,
  mergeOutlineGenerationOptions,
  STREAM_RAW_MAX_CHARS,
  toFinalPreviewJson,
  waitMs,
  type OutlineGenForm,
  type OutlineGenerationPreferences,
  type OutlineStreamProgress,
} from "./outlineModels";

const STREAM_CONNECT_MAX_RETRIES = 2;
const STREAM_CONNECT_RETRY_BASE_DELAY_MS = 1200;

type SaveOutline = (
  nextContent?: string,
  nextStructure?: unknown,
  opts?: { silent?: boolean; snapshotContent?: string },
) => Promise<boolean>;

type CreateOutline = (
  title: string,
  contentMd: string,
  structure: unknown,
  opts?: { silent?: boolean },
) => Promise<boolean>;

type RefreshSavedOutline = () => Promise<boolean>;

export function useOutlineGenerationState(args: {
  projectId?: string;
  preset: LLMPreset | null;
  dirty: boolean;
  existingOutlineTitles: string[];
  save: SaveOutline;
  createOutline: CreateOutline;
  refreshSavedOutline: RefreshSavedOutline;
  confirm: ConfirmApi;
  toast: ToastApi;
}) {
  const { projectId, preset, dirty, existingOutlineTitles, save, createOutline, refreshSavedOutline, confirm, toast } = args;
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genPreview, setGenPreview] = useState<OutlineGenResult | null>(null);
  const [autoSaveFailed, setAutoSaveFailed] = useState(false);
  const [genForm, setGenForm] = useState<OutlineGenForm>(DEFAULT_OUTLINE_GEN_FORM);
  const [streamEnabled, setStreamEnabled] = useState(false);
  const [streamProgress, setStreamProgress] = useState<OutlineStreamProgress | null>(null);
  const [streamRawText, setStreamRawText] = useState("");
  const [streamPreviewJson, setStreamPreviewJson] = useState("");
  const [generationPreferences, setGenerationPreferences] = useState<OutlineGenerationPreferences>({
    tone: [],
    pacing: [],
  });
  const streamClientRef = useRef<SSEPostClient | null>(null);
  const streamHasChunkRef = useRef(false);

  useEffect(() => {
    return () => {
      streamClientRef.current?.abort();
    };
  }, []);

  const closeModal = useCallback(() => {
    streamClientRef.current?.abort();
    setOpen(false);
  }, []);

  const cancelGenerate = useCallback(() => {
    streamClientRef.current?.abort();
  }, []);

  const clearPreview = useCallback(() => {
    setGenPreview(null);
    setAutoSaveFailed(false);
  }, []);

  const refreshGenerationPreferences = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await apiJson<{ preferences: OutlineGenerationPreferences }>(
        `/api/projects/${projectId}/outline/generation-preferences`,
      );
      setGenerationPreferences({
        tone: response.data.preferences?.tone ?? [],
        pacing: response.data.preferences?.pacing ?? [],
      });
    } catch {
      setGenerationPreferences({ tone: [], pacing: [] });
    }
  }, [projectId]);

  useEffect(() => {
    void refreshGenerationPreferences();
  }, [refreshGenerationPreferences]);

  const saveGenerationPreferences = useCallback(async () => {
    if (!projectId) return;
    const tone = genForm.tone.trim();
    const pacing = genForm.pacing.trim();
    if (!tone && !pacing) return;
    try {
      const response = await apiJson<{ preferences: OutlineGenerationPreferences }>(
        `/api/projects/${projectId}/outline/generation-preferences`,
        {
          method: "POST",
          body: JSON.stringify({ tone: tone || undefined, pacing: pacing || undefined }),
        },
      );
      setGenerationPreferences({
        tone: response.data.preferences?.tone ?? [],
        pacing: response.data.preferences?.pacing ?? [],
      });
    } catch {
      // Preference persistence must not block outline generation.
    }
  }, [genForm.pacing, genForm.tone, projectId]);

  const persistGeneratedOutline = useCallback(
    async (result: OutlineGenResult): Promise<boolean> => {
      setGenPreview(result);
      if (result.parse_error || result.chapters.length === 0) {
        setAutoSaveFailed(true);
        toast.toastError(OUTLINE_COPY.generateAutoSaveSkipped);
        return false;
      }

      if (result.saved_outline) {
        const refreshed = await refreshSavedOutline();
        if (!refreshed) {
          setAutoSaveFailed(true);
          toast.toastError(OUTLINE_COPY.generateAutoSaveFailed);
          return false;
        }
        setGenPreview(null);
        setAutoSaveFailed(false);
        setOpen(false);
        toast.toastSuccess(
          result.warnings?.length ? OUTLINE_COPY.generateSavedWithWarnings : OUTLINE_COPY.generateSavedAsNew,
        );
        return true;
      }

      const title = buildUniqueGeneratedOutlineTitle(existingOutlineTitles);
      const ok = await createOutline(title, result.outline_md, { chapters: result.chapters }, { silent: true });
      if (!ok) {
        setAutoSaveFailed(true);
        toast.toastError(OUTLINE_COPY.generateAutoSaveFailed);
        return false;
      }

      setGenPreview(null);
      setAutoSaveFailed(false);
      setOpen(false);
      toast.toastSuccess(
        result.warnings?.length ? OUTLINE_COPY.generateSavedWithWarnings : OUTLINE_COPY.generateSavedAsNew,
      );
      return true;
    },
    [createOutline, existingOutlineTitles, refreshSavedOutline, toast],
  );

  const retrySaveGeneratedOutline = useCallback(async () => {
    if (!projectId || !genPreview) return;
    if (genPreview.parse_error || genPreview.chapters.length === 0) {
      toast.toastError(OUTLINE_COPY.generateAutoSaveSkipped);
      return;
    }

    await persistGeneratedOutline(genPreview);
  }, [genPreview, persistGeneratedOutline, projectId, toast]);

  const copyGeneratedOutlineResult = useCallback(async () => {
    if (!genPreview) return;
    const text = JSON.stringify(
      {
        outline_md: genPreview.outline_md,
        chapters: genPreview.chapters,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(text);
      toast.toastSuccess(OUTLINE_COPY.generateCopied);
    } catch {
      toast.toastError(OUTLINE_COPY.generateCopyFailed);
    }
  }, [genPreview, toast]);

  const generate = useCallback(async () => {
    if (!projectId || !preset) return;

    if (dirty) {
      const choice = await confirm.choose(OUTLINE_COPY.confirms.generateWithDirtyOutline);
      if (choice === "cancel") return;
      if (choice === "confirm") {
        const ok = await save();
        if (!ok) return;
      }
    }

    setGenerating(true);
    streamClientRef.current = null;
    streamHasChunkRef.current = false;
    setGenPreview(null);
    setAutoSaveFailed(false);
    setStreamRawText("");
    setStreamPreviewJson("");
    setStreamProgress(null);

    try {
      const headers: Record<string, string> = { "X-LLM-Provider": preset.provider };
      const payload = {
        requirements: {
          chapter_count: genForm.chapter_count,
          tone: genForm.tone,
          pacing: genForm.pacing,
        },
        context: {
          include_world_setting: genForm.include_world_setting,
          include_characters: genForm.include_characters,
        },
      };

      void saveGenerationPreferences();

      if (!streamEnabled) {
        const response = await apiJson<OutlineGenResult>(`/api/projects/${projectId}/outline/generate`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        const normalized = normalizeOutlineGenResult(response.data, "") ?? response.data;
        await persistGeneratedOutline(normalized);
        return;
      }

      setStreamProgress({ message: "开始生成...", progress: 0, status: "processing" });
      let streamRaw = "";
      let streamResult: OutlineGenResult | null = null;
      let retryCount = 0;

      const applyStreamResult = (candidate: unknown, fallbackRaw = ""): boolean => {
        const normalized = normalizeOutlineGenResult(candidate, fallbackRaw);
        if (!normalized) return false;
        streamResult = normalized;
        setGenPreview(normalized);
        setStreamPreviewJson(toFinalPreviewJson(normalized));
        return true;
      };

      const isTransientStreamError = (error: unknown): error is SSEError =>
        error instanceof SSEError && error.code !== "SSE_SERVER_ERROR" && error.code !== "ABORTED";

      try {
        let done: { requestId?: string; result?: unknown; accumulatedContent: string } | null = null;
        while (retryCount <= STREAM_CONNECT_MAX_RETRIES) {
          const client = new SSEPostClient(`/api/projects/${projectId}/outline/generate-stream`, payload, {
            headers,
            onProgress: ({ message, progress, status }) => {
              setStreamProgress({ message, progress, status });
            },
            onChunk: (content) => {
              streamHasChunkRef.current = true;
              streamRaw += content;
              setStreamRawText((prev) => appendCappedRawText(prev, content, STREAM_RAW_MAX_CHARS));
            },
            onResult: (data) => {
              void applyStreamResult(data, streamRaw);
            },
          });
          streamClientRef.current = client;
          try {
            done = await client.connect();
            break;
          } catch (error) {
            if (
              isTransientStreamError(error) &&
              !streamHasChunkRef.current &&
              retryCount < STREAM_CONNECT_MAX_RETRIES
            ) {
              retryCount += 1;
              const delayMs = STREAM_CONNECT_RETRY_BASE_DELAY_MS * retryCount;
              setStreamProgress((prev) => ({
                message: getOutlineStreamRetryMessage(delayMs, retryCount, STREAM_CONNECT_MAX_RETRIES),
                progress: prev?.progress ?? 0,
                status: "processing",
              }));
              await waitMs(delayMs);
              continue;
            }
            throw error;
          }
        }

        if (!done) {
          throw new SSEError({ code: "SSE_STREAM_ERROR", message: "流式重连后仍失败" });
        }
        if (!streamResult) {
          const doneApplied = applyStreamResult(done.result, done.accumulatedContent || streamRaw);
          if (!doneApplied) {
            const parsedFromRaw = parseOutlineGenResultFromText(done.accumulatedContent || streamRaw);
            if (parsedFromRaw) {
              streamResult = parsedFromRaw;
              setGenPreview(parsedFromRaw);
              setStreamPreviewJson(toFinalPreviewJson(parsedFromRaw));
            }
          }
        }
        if (!streamResult) {
          setStreamProgress((prev) => ({
            message: "生成已结束，但结果解析失败，请重试",
            progress: prev?.progress ?? 100,
            status: "error",
          }));
          toast.toastError(OUTLINE_COPY.generateParseFailed);
          return;
        }
        setStreamProgress((prev) => (prev ? { ...prev, message: "完成", progress: 100, status: "success" } : prev));
        await persistGeneratedOutline(streamResult);
      } catch (error) {
        if (error instanceof SSEError && error.code !== "SSE_SERVER_ERROR" && error.code !== "ABORTED") {
          if (!streamHasChunkRef.current) {
            setStreamProgress({ message: "流式失败，回退非流式...", progress: 0, status: "processing" });
            toast.toastError(OUTLINE_COPY.generateFallback);
            const response = await apiJson<OutlineGenResult>(`/api/projects/${projectId}/outline/generate`, {
              method: "POST",
              headers,
              body: JSON.stringify(payload),
            });
            const normalized = normalizeOutlineGenResult(response.data, "") ?? response.data;
            setStreamPreviewJson(toFinalPreviewJson(normalized));
            setStreamProgress(null);
            await persistGeneratedOutline(normalized);
          } else {
            setStreamProgress((prev) => ({
              message: "流式连接中断，可重试生成",
              progress: prev?.progress ?? 0,
              status: "error",
            }));
            toast.toastError(`${error.message} (${error.code})`, error.requestId);
          }
          return;
        }

        if (error instanceof SSEError && error.code === "SSE_SERVER_ERROR") {
          setStreamProgress((prev) => ({
            message: "生成失败，可重试生成",
            progress: prev?.progress ?? 0,
            status: "error",
          }));
          toast.toastError(`${error.message} (${error.code})`, error.requestId);
          return;
        }

        if (error instanceof SSEError && error.code === "ABORTED") {
          setStreamProgress(null);
          toast.toastSuccess(OUTLINE_COPY.generateCanceled);
          return;
        }

        if (error instanceof ApiError) {
          setStreamProgress((prev) => ({
            message: "生成失败，可重试生成",
            progress: prev?.progress ?? 0,
            status: "error",
          }));
          toast.toastError(`${error.message} (${error.code})`, error.requestId);
          return;
        }

        setStreamProgress((prev) => ({
          message: "生成失败，可重试生成",
          progress: prev?.progress ?? 0,
          status: "error",
        }));
        toast.toastError("流式生成失败");
      }
    } catch (error) {
      const err = error as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      streamClientRef.current = null;
      setGenerating(false);
    }
  }, [
    confirm,
    dirty,
    genForm,
    persistGeneratedOutline,
    preset,
    projectId,
    save,
    saveGenerationPreferences,
    streamEnabled,
    toast,
  ]);

  return {
    open,
    setOpen,
    closeModal,
    generating,
    genPreview,
    setGenPreview,
    autoSaveFailed,
    genForm,
    setGenForm,
    streamEnabled,
    setStreamEnabled,
    streamProgress,
    streamRawText,
    streamPreviewJson,
    toneOptions: mergeOutlineGenerationOptions(generationPreferences.tone, DEFAULT_OUTLINE_TONE_OPTIONS),
    pacingOptions: mergeOutlineGenerationOptions(generationPreferences.pacing, DEFAULT_OUTLINE_PACING_OPTIONS),
    generate,
    cancelGenerate,
    clearPreview,
    retrySaveGeneratedOutline,
    copyGeneratedOutlineResult,
  };
}
