import clsx from "clsx";
import { useCallback, useMemo, useRef, useState } from "react";

import type { ApiError } from "../../services/apiClient";
import type { StoryMemory } from "../../services/storyMemoryApi";
import {
  bulkSetStoryMemoryScope,
  createStoryMemory,
  deleteStoryMemory,
  markStoryMemoryDone,
  mergeStoryMemories,
  updateStoryMemory,
} from "../../services/storyMemoryApi";
import { UI_COPY } from "../../lib/uiCopy";
import { Drawer } from "../ui/Drawer";
import { useConfirm } from "../ui/confirm";
import { useToast } from "../ui/toast";
import type { MemoryAnnotation } from "./types";
import { labelForAnnotationType, sortKeyForAnnotationType } from "./types";

function normalizeTitle(annotation: MemoryAnnotation): string {
  const title = (annotation.title ?? "").trim();
  if (title) return title;
  const content = (annotation.content ?? "").trim();
  if (content) return content.slice(0, 60);
  return "（无标题）";
}

type StoryMemoryForm = {
  memory_type: string;
  title: string;
  content: string;
  tags_raw: string;
  importance_score: number;
  text_position: number;
  text_length: number;
};

type DrawerMode = "view" | "create" | "edit" | "merge";
type StoryMemoryScope = "outline" | "project" | "unassigned";
type ScopeFilter = "all" | "injectable" | StoryMemoryScope;

function parseTags(raw: string): string[] {
  const tokens = String(raw || "")
    .split(/[\n,，;；]/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 80) break;
  }
  return out;
}

function joinTags(tags: string[] | null | undefined): string {
  return (tags ?? []).filter(Boolean).join("\n");
}

function isDone(a: MemoryAnnotation): boolean {
  const meta = a.metadata;
  if (!meta || typeof meta !== "object") return false;
  const value = (meta as Record<string, unknown>).done;
  return Boolean(value);
}

function memoryScope(a: MemoryAnnotation | null): "outline" | "project" | "unassigned" {
  const value = a?.metadata?.scope;
  return value === "outline" || value === "project" || value === "unassigned" ? value : "unassigned";
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case "outline":
      return "大纲";
    case "project":
      return "项目全局";
    case "unassigned":
      return "未归属";
    default:
      return scope || "未归属";
  }
}

function isInjectableForCurrentOutline(a: MemoryAnnotation | null, activeOutlineId?: string | null): boolean {
  if (!a) return false;
  const scope = memoryScope(a);
  if (scope === "project") return true;
  if (scope !== "outline") return false;
  const oid = typeof a.metadata?.outline_id === "string" ? a.metadata.outline_id : null;
  return Boolean(activeOutlineId && oid === activeOutlineId);
}

function toForm(a: MemoryAnnotation | null): StoryMemoryForm {
  return {
    memory_type: String(a?.type ?? "plot_point") || "plot_point",
    title: String(a?.title ?? ""),
    content: String(a?.content ?? ""),
    tags_raw: joinTags(a?.tags ?? []),
    importance_score: Number.isFinite(a?.importance) ? Number(a?.importance) : 0.0,
    text_position: Number.isFinite(a?.position) ? Number(a?.position) : -1,
    text_length: Number.isFinite(a?.length) ? Number(a?.length) : 0,
  };
}

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "chapter_summary", label: labelForAnnotationType("chapter_summary") },
  { value: "hook", label: labelForAnnotationType("hook") },
  { value: "foreshadow", label: labelForAnnotationType("foreshadow") },
  { value: "plot_point", label: labelForAnnotationType("plot_point") },
  { value: "character_state", label: labelForAnnotationType("character_state") },
  { value: "other", label: "其他" },
];

export function MemorySidebar(props: {
  projectId?: string;
  chapterId?: string | null;
  activeOutlineId?: string | null;
  annotations: MemoryAnnotation[];
  validIds: Set<string>;
  activeAnnotationId?: string | null;
  variant?: "main" | "trace";
  onSelect: (annotation: MemoryAnnotation) => void;
  onRefresh?: () => Promise<void> | void;
  onSetActiveAnnotationId?: (id: string | null) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const allTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of props.annotations) {
      counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort(
        (a, b) => sortKeyForAnnotationType(a.type) - sortKeyForAnnotationType(b.type) || a.type.localeCompare(b.type),
      );
  }, [props.annotations]);

  const [selectedType, setSelectedType] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const effectiveSelectedType = useMemo(() => {
    if (selectedType === "all") return "all";
    return allTypes.some((t) => t.type === selectedType) ? selectedType : "all";
  }, [allTypes, selectedType]);

  const filtered = useMemo(() => {
    const out = props.annotations.filter((a) => {
      if (effectiveSelectedType !== "all" && a.type !== effectiveSelectedType) return false;
      if (scopeFilter === "all") return true;
      if (scopeFilter === "injectable") return isInjectableForCurrentOutline(a, props.activeOutlineId);
      return memoryScope(a) === scopeFilter;
    });
    out.sort(
      (a, b) => sortKeyForAnnotationType(a.type) - sortKeyForAnnotationType(b.type) || b.importance - a.importance,
    );
    return out;
  }, [effectiveSelectedType, props.activeOutlineId, props.annotations, scopeFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, MemoryAnnotation[]>();
    for (const a of filtered) {
      const list = map.get(a.type) ?? [];
      list.push(a);
      map.set(a.type, list);
    }
    return Array.from(map.entries()).sort(
      (a, b) => sortKeyForAnnotationType(a[0]) - sortKeyForAnnotationType(b[0]) || a[0].localeCompare(b[0]),
    );
  }, [filtered]);

  const invalidCount = props.annotations.length - props.validIds.size;

  const active = useMemo(() => {
    const id = props.activeAnnotationId;
    if (!id) return null;
    return props.annotations.find((a) => a.id === id) ?? null;
  }, [props.activeAnnotationId, props.annotations]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("view");
  const [editing, setEditing] = useState<MemoryAnnotation | null>(null);
  const [form, setForm] = useState<StoryMemoryForm>(() => toForm(null));
  const [scopeDraft, setScopeDraft] = useState<StoryMemoryScope>("unassigned");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [mergeSources, setMergeSources] = useState<Set<string>>(() => new Set());
  const [mergeSaving, setMergeSaving] = useState(false);
  const mergeSavingRef = useRef(false);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(toForm(null));
    setDrawerMode("create");
    setDrawerOpen(true);
  }, []);

  const openDetail = useCallback(
    (annotation: MemoryAnnotation) => {
      props.onSelect(annotation);
      setEditing(null);
      setScopeDraft(memoryScope(annotation));
      setDrawerMode("view");
      setDrawerOpen(true);
    },
    [props],
  );

  const openEdit = useCallback(() => {
    if (!active) return;
    setEditing(active);
    setForm(toForm(active));
    setDrawerMode("edit");
    setDrawerOpen(true);
  }, [active]);

  const closeDrawer = useCallback(() => {
    if (savingRef.current) return;
    if (mergeSavingRef.current) return;
    setDrawerOpen(false);
  }, []);

  const saveStoryMemory = useCallback(async () => {
    const projectId = props.projectId;
    if (!projectId) {
      toast.toastError("缺少 projectId：无法保存");
      return;
    }
    if (!String(form.content || "").trim()) {
      toast.toastWarning("内容不能为空");
      return;
    }
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const memoryType = String(form.memory_type || "").trim() || "plot_point";
      const body = {
        chapter_id: props.chapterId ?? null,
        memory_type: memoryType,
        title: form.title.trim() ? form.title.trim() : null,
        content: String(form.content || ""),
        importance_score: Number.isFinite(form.importance_score) ? Number(form.importance_score) : 0.0,
        tags: parseTags(form.tags_raw),
        text_position: Number.isFinite(form.text_position) ? Number(form.text_position) : -1,
        text_length: Number.isFinite(form.text_length) ? Math.max(0, Number(form.text_length)) : 0,
        is_foreshadow: memoryType === "foreshadow",
      };

      let saved: StoryMemory;
      if (editing) saved = await updateStoryMemory(projectId, editing.id, body);
      else saved = await createStoryMemory(projectId, body);

      toast.toastSuccess(editing ? "已保存剧情记忆" : "已新增剧情记忆");
      props.onSetActiveAnnotationId?.(saved.id);
      await props.onRefresh?.();
      setEditing(null);
      setScopeDraft(
        saved.scope === "outline" || saved.scope === "project" || saved.scope === "unassigned"
          ? saved.scope
          : "unassigned",
      );
      setDrawerMode("view");
      setDrawerOpen(true);
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`保存失败：${err.message} (${err.code})`, err.requestId);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [
    editing,
    form.content,
    form.importance_score,
    form.memory_type,
    form.tags_raw,
    form.text_length,
    form.text_position,
    form.title,
    props,
    toast,
  ]);

  const deleteSelected = useCallback(async () => {
    const projectId = props.projectId;
    if (!projectId) {
      toast.toastError("缺少 projectId：无法删除");
      return;
    }
    if (!active) return;
    const ok = await confirm.confirm({
      title: "删除该条剧情记忆？",
      description: `将删除「${normalizeTitle(active)}」。此操作不可撤销。`,
      confirmText: "删除",
      cancelText: "取消",
      danger: true,
    });
    if (!ok) return;

    setSaving(true);
    try {
      await deleteStoryMemory(projectId, active.id);
      toast.toastSuccess("已删除剧情记忆");
      props.onSetActiveAnnotationId?.(null);
      await props.onRefresh?.();
      setDrawerOpen(false);
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`删除失败：${err.message} (${err.code})`, err.requestId);
    } finally {
      setSaving(false);
    }
  }, [active, confirm, props, toast]);

  const toggleDone = useCallback(async () => {
    const projectId = props.projectId;
    if (!projectId) {
      toast.toastError("缺少 projectId：无法操作");
      return;
    }
    if (!active) return;
    const done = isDone(active);

    setSaving(true);
    try {
      await markStoryMemoryDone(projectId, active.id, !done);
      toast.toastSuccess(!done ? "已标记完成" : "已取消完成");
      await props.onRefresh?.();
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`操作失败：${err.message} (${err.code})`, err.requestId);
    } finally {
      setSaving(false);
    }
  }, [active, props, toast]);

  const openMerge = useCallback(() => {
    if (!active) return;
    setMergeSources(new Set());
    setDrawerMode("merge");
    setDrawerOpen(true);
  }, [active]);

  const closeMerge = useCallback(() => {
    if (mergeSavingRef.current) return;
    setDrawerMode("view");
  }, []);

  const mergeCandidates = useMemo(() => {
    if (!active) return [];
    const out = props.annotations.filter((a) => a.id !== active.id);
    out.sort(
      (a, b) => sortKeyForAnnotationType(a.type) - sortKeyForAnnotationType(b.type) || b.importance - a.importance,
    );
    return out;
  }, [active, props.annotations]);

  const applyMerge = useCallback(async () => {
    const projectId = props.projectId;
    if (!projectId) {
      toast.toastError("缺少 projectId：无法合并");
      return;
    }
    if (!active) return;
    const sourceIds = Array.from(mergeSources);
    if (sourceIds.length === 0) {
      toast.toastWarning("请先选择要合并的条目");
      return;
    }
    const ok = await confirm.confirm({
      title: "确认合并？",
      description: `将把 ${sourceIds.length} 条剧情记忆合并到「${normalizeTitle(active)}」，并删除被合并条目。`,
      confirmText: "合并",
      cancelText: "取消",
    });
    if (!ok) return;

    if (mergeSavingRef.current) return;
    mergeSavingRef.current = true;
    setMergeSaving(true);
    try {
      await mergeStoryMemories(projectId, { targetId: active.id, sourceIds });
      toast.toastSuccess("已合并剧情记忆");
      setMergeSources(new Set());
      props.onSetActiveAnnotationId?.(active.id);
      await props.onRefresh?.();
      setDrawerMode("view");
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`合并失败：${err.message} (${err.code})`, err.requestId);
    } finally {
      mergeSavingRef.current = false;
      setMergeSaving(false);
    }
  }, [active, confirm, mergeSources, props, toast]);

  const setSelectedScope = useCallback(
    async (scope: StoryMemoryScope) => {
      const projectId = props.projectId;
      if (!projectId) {
        toast.toastError("缺少 projectId：无法修改作用域");
        return;
      }
      if (!active) return;
      if (scope === "outline" && !props.activeOutlineId) {
        toast.toastWarning("当前项目没有可用的 active outline，无法设为当前大纲");
        return;
      }
      setSaving(true);
      try {
        await bulkSetStoryMemoryScope(
          projectId,
          [active.id],
          scope,
          scope === "outline" ? props.activeOutlineId : null,
        );
        toast.toastSuccess("已更新记忆作用域");
        await props.onRefresh?.();
        setScopeDraft(scope);
      } catch (e) {
        const err = e as ApiError;
        toast.toastError(`修改作用域失败：${err.message} (${err.code})`, err.requestId);
      } finally {
        setSaving(false);
      }
    },
    [active, props, toast],
  );

  const selectedInfo = useMemo(() => {
    if (!active) return null;
    const done = isDone(active);
    const valid = props.validIds.has(active.id);
    return {
      done,
      valid,
      scope: memoryScope(active),
      injectable: isInjectableForCurrentOutline(active, props.activeOutlineId),
    };
  }, [active, props.activeOutlineId, props.validIds]);

  const isMainVariant = props.variant === "main";
  const listGridClassName = isMainVariant ? "grid gap-3 xl:grid-cols-2" : "grid gap-2";

  return (
    <aside className="min-w-0 grid gap-3" aria-label="story_memory_sidebar">
      <div className="rounded-atelier border border-border bg-surface p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={clsx("text-ink", isMainVariant ? "font-content text-xl" : "text-sm")}>
              {UI_COPY.chapterAnalysis.storyMemoryTitle}
            </div>
            <div className="mt-1 text-xs text-subtext">
              共 {props.annotations.length} 条{invalidCount > 0 ? `（${invalidCount} 条未定位）` : ""}
            </div>
            <div className="mt-2 callout-info max-w-4xl">{UI_COPY.chapterAnalysis.storyMemorySubtitle}</div>
          </div>
          <button
            className="btn btn-primary shrink-0 px-3 py-1 text-xs"
            type="button"
            onClick={openCreate}
            disabled={saving}
            aria-label="story_memory_create"
          >
            新增剧情记忆
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className={clsx(
              "btn btn-ghost px-2 py-1 text-xs",
              effectiveSelectedType === "all" ? "bg-canvas text-ink" : "text-subtext",
            )}
            type="button"
            onClick={() => setSelectedType("all")}
            aria-pressed={effectiveSelectedType === "all"}
          >
            全部类型
            <span className="ml-1 text-subtext">· {props.annotations.length}</span>
          </button>
          {allTypes.map((t) => (
            <button
              key={t.type}
              className={clsx(
                "btn btn-ghost px-2 py-1 text-xs",
                effectiveSelectedType === t.type ? "bg-canvas text-ink" : "text-subtext",
              )}
              type="button"
              onClick={() => setSelectedType(t.type)}
              aria-pressed={effectiveSelectedType === t.type}
            >
              {labelForAnnotationType(t.type)}
              <span className="ml-1 text-subtext">· {t.count}</span>
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["all", "全部"],
              ["injectable", "会注入当前大纲"],
              ["outline", "大纲"],
              ["project", "项目全局"],
              ["unassigned", "未归属"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={clsx(
                "btn btn-ghost px-2 py-1 text-xs",
                scopeFilter === value ? "bg-canvas text-ink" : "text-subtext",
              )}
              type="button"
              onClick={() => setScopeFilter(value)}
              aria-pressed={scopeFilter === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-atelier border border-border bg-surface p-2">
        {groups.length === 0 ? (
          <div className="p-3 text-sm text-subtext">暂无记忆。请先在写作页分析并“保存到记忆库”。</div>
        ) : (
          <div className="grid gap-3">
            {groups.map(([type, list]) => (
              <section key={type} className="grid gap-2">
                <div className="px-1 text-xs text-subtext">
                  {labelForAnnotationType(type)} · {list.length}
                </div>
                <div className={listGridClassName}>
                  {list.map((a) => {
                    const selected = props.activeAnnotationId === a.id;
                    const valid = props.validIds.has(a.id);
                    const done = isDone(a);
                    const scope = memoryScope(a);
                    const injectable = isInjectableForCurrentOutline(a, props.activeOutlineId);
                    return (
                      <button
                        key={a.id}
                        className={clsx(
                          "ui-transition-fast w-full rounded-atelier border px-3 py-2 text-left",
                          selected ? "border-accent bg-canvas" : "border-border bg-canvas hover:bg-surface",
                          !valid && "opacity-70",
                        )}
                        type="button"
                        onClick={() => openDetail(a)}
                        aria-label={`story_memory_item:${normalizeTitle(a)}`}
                        title={valid ? "点击查看详情并定位正文" : "点击查看详情；该条无法在正文中高亮"}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm text-ink">{normalizeTitle(a)}</div>
                              {done ? (
                                <span className="rounded bg-success/20 px-1.5 py-0.5 text-[11px] text-ink">已完成</span>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-subtext">
                              <span className="rounded bg-surface px-1.5 py-0.5">{scopeLabel(scope)}</span>
                              <span
                                className={clsx(
                                  "rounded px-1.5 py-0.5",
                                  injectable ? "bg-success/20 text-ink" : "bg-warning/20 text-ink",
                                )}
                              >
                                {injectable ? "会注入" : "不注入"}
                              </span>
                            </div>
                            <div className="mt-1 line-clamp-2 break-words text-xs text-subtext">
                              {(a.content ?? "").trim().slice(0, 140)}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs text-subtext">{(a.importance * 10).toFixed(1)}</div>
                            {!valid ? <div className="mt-1 text-xs text-accent">未定位</div> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        panelClassName="h-full w-full max-w-xl border-l border-border bg-canvas p-6 shadow-sm"
        ariaLabel="剧情记忆详情"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-content text-2xl text-ink">
              {drawerMode === "create"
                ? "新增剧情记忆"
                : drawerMode === "edit"
                  ? "编辑剧情记忆"
                  : drawerMode === "merge"
                    ? "合并剧情记忆"
                    : "剧情记忆详情"}
            </div>
            <div className="mt-1 text-xs text-subtext">
              {drawerMode === "merge"
                ? `合并到：${active ? normalizeTitle(active) : "（未选择）"} · 已选 ${mergeSources.size} 条`
                : drawerMode === "view"
                  ? "查看完整内容，并在这里完成条目级操作。"
                  : saving
                    ? "保存中..."
                    : "可直接编辑后保存（失败不影响正文）"}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {drawerMode === "edit" && active ? (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setDrawerMode("view")}
                disabled={saving}
              >
                取消
              </button>
            ) : drawerMode === "merge" ? (
              <button className="btn btn-secondary" type="button" onClick={closeMerge} disabled={mergeSaving}>
                取消
              </button>
            ) : null}
            <button
              className="btn btn-secondary"
              type="button"
              onClick={closeDrawer}
              disabled={saving || mergeSaving}
              aria-label="story_memory_close"
            >
              关闭
            </button>
            {drawerMode === "create" || drawerMode === "edit" ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void saveStoryMemory()}
                disabled={saving || !form.content.trim()}
                aria-label="story_memory_save"
              >
                保存
              </button>
            ) : null}
            {drawerMode === "merge" ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void applyMerge()}
                disabled={mergeSaving || mergeSources.size === 0 || !active}
                aria-label="story_memory_merge_apply"
              >
                确认合并
              </button>
            ) : null}
          </div>
        </div>

        {drawerMode === "view" ? (
          <div className="mt-5 grid gap-4">
            {!active ? (
              <div className="rounded-atelier border border-border bg-surface p-3 text-sm text-subtext">
                请先选择一条剧情记忆。
              </div>
            ) : (
              <>
                <div className="rounded-atelier border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-words text-lg text-ink">{normalizeTitle(active)}</div>
                      <div className="mt-2 flex flex-wrap gap-1 text-xs text-subtext">
                        <span className="rounded bg-canvas px-2 py-1">{labelForAnnotationType(active.type)}</span>
                        <span className="rounded bg-canvas px-2 py-1">
                          重要度 {(active.importance * 10).toFixed(1)}
                        </span>
                        <span className="rounded bg-canvas px-2 py-1">{selectedInfo?.valid ? "可定位" : "未定位"}</span>
                        {selectedInfo?.done ? (
                          <span className="rounded bg-success/20 px-2 py-1 text-ink">已完成</span>
                        ) : null}
                        {selectedInfo ? (
                          <span className="rounded bg-canvas px-2 py-1">{scopeLabel(selectedInfo.scope)}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                    {(active.content ?? "").trim() || "（无内容）"}
                  </div>
                </div>

                <div className="rounded-atelier border border-border bg-surface p-4">
                  <div className="text-sm text-ink">归属范围</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      className="select max-w-48"
                      value={scopeDraft}
                      onChange={(e) => setScopeDraft(e.target.value as StoryMemoryScope)}
                      aria-label="story_memory_scope_select"
                      disabled={saving}
                    >
                      <option value="outline" disabled={!props.activeOutlineId}>
                        当前大纲
                      </option>
                      <option value="project">项目全局</option>
                      <option value="unassigned">未归属</option>
                    </select>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => void setSelectedScope(scopeDraft)}
                      disabled={!active || saving || (scopeDraft === "outline" && !props.activeOutlineId)}
                      aria-label="story_memory_apply_scope"
                    >
                      应用
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-subtext">
                    {selectedInfo?.injectable ? "当前条目会注入当前大纲。" : "当前条目不会注入当前大纲。"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={openEdit}
                    disabled={saving}
                    aria-label="story_memory_edit"
                  >
                    编辑
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => void toggleDone()}
                    disabled={saving}
                    aria-label="story_memory_toggle_done"
                  >
                    {selectedInfo?.done ? "取消完成" : "标记完成"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={openMerge}
                    disabled={saving || props.annotations.length < 2}
                    aria-label="story_memory_merge"
                  >
                    合并到此条
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => void deleteSelected()}
                    disabled={saving}
                    aria-label="story_memory_delete"
                  >
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {drawerMode === "create" || drawerMode === "edit" ? (
          <div className="mt-5 grid gap-4">
            <label className="grid gap-1">
              <span className="text-xs text-subtext">类型</span>
              <select
                className="select"
                value={form.memory_type}
                onChange={(e) => setForm((v) => ({ ...v, memory_type: e.target.value }))}
                aria-label="story_memory_type"
                disabled={saving}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-subtext">标题（可选）</span>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
                placeholder="例如：主角发现异常线索"
                disabled={saving}
                aria-label="story_memory_title"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-subtext">内容</span>
              <textarea
                className="textarea atelier-content"
                rows={10}
                value={form.content}
                onChange={(e) => setForm((v) => ({ ...v, content: e.target.value }))}
                placeholder="写下可复用、可检索的剧情记忆条目…"
                disabled={saving}
                aria-label="story_memory_content"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-subtext">标签（可选，每行一个）</span>
              <textarea
                className="textarea"
                rows={4}
                value={form.tags_raw}
                onChange={(e) => setForm((v) => ({ ...v, tags_raw: e.target.value }))}
                placeholder="例如：伏笔\n人物状态\n时间线"
                disabled={saving}
                aria-label="story_memory_tags"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs text-subtext">重要度（0~1，列表显示为 *10）</span>
                <input
                  className="input"
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={Number.isFinite(form.importance_score) ? form.importance_score : 0}
                  onChange={(e) => setForm((v) => ({ ...v, importance_score: Number(e.target.value) }))}
                  disabled={saving}
                  aria-label="story_memory_importance"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">定位 position</span>
                  <input
                    className="input"
                    type="number"
                    value={Number.isFinite(form.text_position) ? form.text_position : -1}
                    onChange={(e) => setForm((v) => ({ ...v, text_position: Number(e.target.value) }))}
                    disabled={saving}
                    aria-label="story_memory_position"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">定位 length</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={Number.isFinite(form.text_length) ? form.text_length : 0}
                    onChange={(e) => setForm((v) => ({ ...v, text_length: Number(e.target.value) }))}
                    disabled={saving}
                    aria-label="story_memory_length"
                  />
                </label>
              </div>
            </div>

            <div className="text-[11px] text-subtext">
              说明：position/length 用于“回溯定位”。若不确定可留空（-1/0），系统会尝试用内容片段做 fallback 定位。
            </div>
          </div>
        ) : null}

        {drawerMode === "merge" ? (
          <div className="mt-5 grid gap-2">
            {mergeCandidates.length === 0 ? (
              <div className="rounded-atelier border border-border bg-surface p-3 text-sm text-subtext">
                当前没有可合并的其他条目。
              </div>
            ) : (
              mergeCandidates.map((a) => {
                const checked = mergeSources.has(a.id);
                return (
                  <label
                    key={a.id}
                    className={clsx(
                      "flex cursor-pointer items-start gap-3 rounded-atelier border bg-surface px-3 py-2",
                      checked ? "border-accent" : "border-border",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setMergeSources((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(a.id);
                          else next.delete(a.id);
                          return next;
                        });
                      }}
                      aria-label={`story_memory_merge_source:${normalizeTitle(a)}`}
                      disabled={mergeSaving}
                      className="checkbox mt-1"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm text-ink">{normalizeTitle(a)}</div>
                        <div className="text-xs text-subtext">{labelForAnnotationType(a.type)}</div>
                      </div>
                      <div className="mt-1 line-clamp-2 break-words text-xs text-subtext">
                        {(a.content ?? "").trim().slice(0, 160)}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        ) : null}
      </Drawer>
    </aside>
  );
}
