import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { AnnotatedText } from "../components/chapterAnalysis/AnnotatedText";
import { MemorySidebar } from "../components/chapterAnalysis/MemorySidebar";
import type { MemoryAnnotation } from "../components/chapterAnalysis/types";
import { UI_COPY } from "../lib/uiCopy";
import { createRequestSeqGuard } from "../lib/requestSeqGuard";
import type { ApiError } from "../services/apiClient";
import { apiJson } from "../services/apiClient";
import { listStoryMemories, type StoryMemory } from "../services/storyMemoryApi";
import type { Chapter } from "../types";
import type { Project } from "../types";
import { useToast } from "../components/ui/toast";
import { RequestIdBadge } from "../components/ui/RequestIdBadge";

function storyMemoryToAnnotation(memory: StoryMemory): MemoryAnnotation {
  return {
    id: memory.id,
    type: memory.memory_type || "plot_point",
    title: memory.title ?? null,
    content: memory.content ?? "",
    importance: Number.isFinite(memory.importance_score) ? memory.importance_score : 0,
    position: Number.isFinite(memory.text_position) ? memory.text_position : -1,
    length: Number.isFinite(memory.text_length) ? memory.text_length : 0,
    tags: Array.isArray(memory.tags) ? memory.tags : [],
    metadata: {
      done: Boolean(memory.done),
      scope: memory.scope ?? "unassigned",
      outline_id: memory.outline_id ?? null,
      chapter_id: memory.chapter_id ?? null,
      injectable_for_current_outline: Boolean(memory.injectable_for_current_outline),
    },
  };
}

export function ChapterAnalysisPage() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const chapterId = searchParams.get("chapterId");
  const toast = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [annotations, setAnnotations] = useState<MemoryAnnotation[]>([]);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [scrollToAnnotationId, setScrollToAnnotationId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const loadGuardRef = useRef(createRequestSeqGuard());

  useEffect(() => {
    const guard = loadGuardRef.current;
    return () => guard.invalidate();
  }, []);

  useEffect(() => {
    loadGuardRef.current.invalidate();
    setLoading(false);
    setChapter(null);
    setAnnotations([]);
    setActiveOutlineId(null);
    setActiveAnnotationId(null);
    setScrollToAnnotationId(null);
    setRequestId(null);
  }, [chapterId]);

  const refresh = useCallback(async () => {
    if (!projectId && !chapterId) return;

    const seq = loadGuardRef.current.next();
    setLoading(true);
    try {
      if (chapterId) {
        const [chapterRes, annotationsRes] = await Promise.all([
          apiJson<{ chapter: Chapter }>(`/api/chapters/${chapterId}`),
          apiJson<{ annotations: MemoryAnnotation[] }>(`/api/chapters/${chapterId}/annotations`),
        ]);
        if (!loadGuardRef.current.isLatest(seq)) return;

        setChapter(chapterRes.data.chapter);
        setActiveOutlineId(chapterRes.data.chapter.outline_id ?? null);
        setAnnotations(annotationsRes.data.annotations ?? []);
        setRequestId(annotationsRes.request_id ?? chapterRes.request_id ?? null);
        return;
      }

      if (!projectId) return;
      const projectRes = await apiJson<{ project: Project }>(`/api/projects/${projectId}`);
      const outlineId = projectRes.data.project.active_outline_id ?? null;
      const memories = await listStoryMemories(projectId, {
        injectable_for_outline_id: outlineId,
        limit: 200,
      });
      if (!loadGuardRef.current.isLatest(seq)) return;

      setChapter(null);
      setActiveOutlineId(outlineId);
      setAnnotations(memories.items.map(storyMemoryToAnnotation));
      setRequestId(projectRes.request_id ?? null);
    } catch (e) {
      if (!loadGuardRef.current.isLatest(seq)) return;
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
      setRequestId(err.requestId || null);
      setChapter(null);
      setAnnotations([]);
    } finally {
      if (loadGuardRef.current.isLatest(seq)) {
        setLoading(false);
      }
    }
  }, [chapterId, projectId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const content = chapter?.content_md ?? "";
  const hasTraceContext = Boolean(chapterId);
  const { validAnnotations, validIds, invalidCount } = useMemo(() => {
    const valid: MemoryAnnotation[] = [];
    const validIds = new Set<string>();
    let invalid = 0;
    if (!chapterId) {
      for (const ann of annotations) validIds.add(ann.id);
      return { validAnnotations: valid, validIds, invalidCount: 0 };
    }
    const textLen = content.length;
    for (const ann of annotations) {
      const position = ann.position;
      const length = ann.length;
      const ok = position >= 0 && length > 0 && position + length <= textLen;
      if (ok) {
        valid.push(ann);
        validIds.add(ann.id);
      } else {
        invalid += 1;
      }
    }
    return { validAnnotations: valid, validIds, invalidCount: invalid };
  }, [annotations, chapterId, content]);

  const selectAnnotation = useCallback(
    (ann: MemoryAnnotation, opts?: { scroll?: boolean }) => {
      setActiveAnnotationId(ann.id);
      if (!opts?.scroll) return;
      if (!validIds.has(ann.id)) return;
      setScrollToAnnotationId(null);
      window.requestAnimationFrame(() => setScrollToAnnotationId(ann.id));
    },
    [validIds],
  );

  return (
    <div className="grid min-w-0 gap-4 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-content text-2xl text-ink">剧情记忆</div>
          <div className="mt-1 text-xs text-subtext">
            {chapter ? (
              <>
                标注回溯 · 第 {chapter.number} 章 · {(chapter.title ?? "").trim() || "（无标题）"}
              </>
            ) : chapterId ? (
              <>
                标注回溯 · <span className="font-mono break-all">{chapterId}</span>
              </>
            ) : (
              "浏览、筛选和维护当前项目的剧情记忆。"
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasTraceContext ? <RequestIdBadge requestId={requestId} /> : null}
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              if (!projectId) return;
              const next = new URLSearchParams();
              if (chapterId) next.set("chapterId", chapterId);
              const qs = next.toString();
              navigate(qs ? `/projects/${projectId}/writing?${qs}` : `/projects/${projectId}/writing`);
            }}
          >
            返回写作页
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={loading || (!projectId && !chapterId)}
          >
            {loading ? UI_COPY.common.loading : "刷新"}
          </button>
          {chapterId ? (
            <button
              className="btn btn-ghost px-2 py-1 text-xs"
              type="button"
              title="仅清除 URL 中的 chapterId，不会删除章节。"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("chapterId");
                setSearchParams(next, { replace: true });
              }}
            >
              清除选择
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-atelier border border-border bg-surface p-3 text-sm text-subtext">
        {hasTraceContext ? (
          <>
            <span className="text-ink">{UI_COPY.chapterAnalysis.introTitle}：</span>
            {UI_COPY.chapterAnalysis.introLine1}
          </>
        ) : (
          <>
            <span className="text-ink">当前为全局浏览模式：</span>
            未选择章节时展示全部剧情记忆；从写作页进入可查看标注回溯。
          </>
        )}
      </div>

      {invalidCount > 0 ? (
        <div className="rounded-atelier border border-accent/60 bg-surface p-3 text-sm text-ink">
          有 {invalidCount} 条记忆未定位到正文，已从高亮中过滤（侧栏仍可查看）。
        </div>
      ) : null}

      {hasTraceContext ? (
        <section className="min-h-0 min-w-0 rounded-atelier border border-border bg-surface p-3">
          {loading ? (
            <div className="rounded-atelier border border-border bg-canvas p-4" aria-busy="true" aria-live="polite">
              <span className="sr-only">{UI_COPY.common.loading}</span>
              <div className="grid gap-2">
                <div className="skeleton h-4 w-28" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-4 w-11/12" />
                <div className="skeleton h-4 w-3/4" />
              </div>
            </div>
          ) : !chapter ? (
            <div className="p-3 text-sm text-subtext">未加载到章节。</div>
          ) : !(chapter.content_md ?? "").trim() ? (
            <div className="p-3 text-sm text-subtext">章节正文为空。</div>
          ) : (
            <div className="rounded-atelier border border-border bg-canvas p-4">
              <AnnotatedText
                content={content}
                annotations={validAnnotations}
                activeAnnotationId={activeAnnotationId}
                scrollToAnnotationId={scrollToAnnotationId}
                onAnnotationClick={(a) => selectAnnotation(a)}
              />
            </div>
          )}
        </section>
      ) : null}

      <div className="min-w-0">
        {loading ? (
          <aside className="min-w-0 grid gap-3" aria-busy="true" aria-live="polite">
            <span className="sr-only">{UI_COPY.common.loading}</span>
            <div className="rounded-atelier border border-border bg-surface p-3">
              <div className="skeleton h-4 w-24" />
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="skeleton h-7 w-20" />
                <div className="skeleton h-7 w-24" />
                <div className="skeleton h-7 w-16" />
              </div>
            </div>
            <div className="rounded-atelier border border-border bg-surface p-2">
              <div className="grid gap-2 p-3">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-12 w-full" />
                <div className="skeleton h-12 w-full" />
                <div className="skeleton h-12 w-full" />
              </div>
            </div>
          </aside>
        ) : (
          <MemorySidebar
            projectId={projectId}
            chapterId={chapterId}
            activeOutlineId={activeOutlineId}
            annotations={annotations}
            validIds={validIds}
            activeAnnotationId={activeAnnotationId}
            variant={hasTraceContext ? "trace" : "main"}
            onSelect={(a) => selectAnnotation(a, { scroll: true })}
            onRefresh={refresh}
            onSetActiveAnnotationId={setActiveAnnotationId}
          />
        )}
      </div>
    </div>
  );
}
