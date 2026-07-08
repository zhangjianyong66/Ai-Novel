import { motion, useReducedMotion } from "framer-motion";
import { FileUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Modal } from "../components/ui/Modal";
import { ProgressBar } from "../components/ui/ProgressBar";
import { useConfirm } from "../components/ui/confirm";
import { useToast } from "../components/ui/toast";
import { useProjects } from "../contexts/projects";
import { duration, transition } from "../lib/motion";
import { UI_COPY } from "../lib/uiCopy";
import { ApiError, apiJson } from "../services/apiClient";
import { computeWizardProgressFromSummary } from "../services/wizard";
import type { Project, ProjectSummaryItem } from "../types";
import {
  DEFAULT_PROJECT_BUNDLE_IMPORT_MAX_BYTES,
  PROJECT_BUNDLE_SCHEMA_VERSION,
  buildProjectBundleSummary,
  formatBytes,
  isProjectBundleV1,
  type ProjectBundleSummary,
} from "./projectBundle";

type CreateProjectForm = {
  name: string;
  genre: string;
  logline: string;
};

type ProjectBundleImportConfig = {
  max_bytes: number;
  schema_version: string;
};

type ProjectBundleImportResult = {
  ok: boolean;
  project_id: string;
  report?: {
    created?: Record<string, number>;
    warnings?: string[];
  };
  vector_rebuild?: unknown;
};

export function DashboardPage() {
  const { projects, loading, error, refresh } = useProjects();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateProjectForm>({ name: "", genre: "", logline: "" });
  const [bundleImportOpen, setBundleImportOpen] = useState(false);
  const [bundleConfig, setBundleConfig] = useState<ProjectBundleImportConfig>({
    max_bytes: DEFAULT_PROJECT_BUNDLE_IMPORT_MAX_BYTES,
    schema_version: PROJECT_BUNDLE_SCHEMA_VERSION,
  });
  const [bundleFileName, setBundleFileName] = useState("");
  const [bundlePayload, setBundlePayload] = useState<Record<string, unknown> | null>(null);
  const [bundleSummary, setBundleSummary] = useState<ProjectBundleSummary | null>(null);
  const [bundleError, setBundleError] = useState("");
  const [bundleRebuildVectors, setBundleRebuildVectors] = useState(false);
  const [bundleImporting, setBundleImporting] = useState(false);
  const [bundleImportResult, setBundleImportResult] = useState<ProjectBundleImportResult | null>(null);

  const sorted = useMemo(() => [...projects].sort((a, b) => b.created_at.localeCompare(a.created_at)), [projects]);
  const recommendedProject = sorted[0] ?? null;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return "夜深了";
    if (hour < 12) return "早上好";
    if (hour < 18) return "下午好";
    return "晚上好";
  }, []);

  type WizardSummary = { percent: number; nextTitle: string | null; nextHref: string | null };
  const [wizardByProjectId, setWizardByProjectId] = useState<Record<string, WizardSummary>>({});
  const [wizardLoadingByProjectId, setWizardLoadingByProjectId] = useState<Record<string, boolean>>({});
  const recommendedWizard = recommendedProject ? wizardByProjectId[recommendedProject.id] : null;
  const recommendedWizardLoading = recommendedProject
    ? Boolean(wizardLoadingByProjectId[recommendedProject.id])
    : false;

  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    if (qs.get("importBundle") === "1") setBundleImportOpen(true);
  }, [location.search]);

  useEffect(() => {
    if (!bundleImportOpen) return;
    let cancelled = false;
    void apiJson<ProjectBundleImportConfig>("/api/projects/import_bundle/config", { timeoutMs: 15_000 })
      .then((res) => {
        if (cancelled) return;
        const maxBytes = Number(res.data.max_bytes);
        setBundleConfig({
          max_bytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_PROJECT_BUNDLE_IMPORT_MAX_BYTES,
          schema_version: res.data.schema_version || PROJECT_BUNDLE_SCHEMA_VERSION,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setBundleConfig({
          max_bytes: DEFAULT_PROJECT_BUNDLE_IMPORT_MAX_BYTES,
          schema_version: PROJECT_BUNDLE_SCHEMA_VERSION,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [bundleImportOpen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (sorted.length === 0) {
        setWizardByProjectId({});
        setWizardLoadingByProjectId({});
        return;
      }

      setWizardLoadingByProjectId(Object.fromEntries(sorted.map((p) => [p.id, true])));
      try {
        const res = await apiJson<{ items: ProjectSummaryItem[] }>(`/api/projects/summary`);
        if (cancelled) return;

        const summaryByProjectId = Object.fromEntries(res.data.items.map((it) => [it.project.id, it]));
        const nextWizardByProjectId: Record<string, WizardSummary> = {};
        for (const p of sorted) {
          const summary = summaryByProjectId[p.id];
          if (!summary) continue;
          const progress = computeWizardProgressFromSummary({
            project: summary.project,
            settings: summary.settings,
            characters_count: summary.characters_count,
            outline_content_md: summary.outline_content_md,
            chapters_total: summary.chapters_total,
            chapters_done: summary.chapters_done,
            llm_preset: summary.llm_preset,
            llm_profile_has_api_key: summary.llm_profile_has_api_key,
          });

          nextWizardByProjectId[p.id] = {
            percent: progress.percent,
            nextTitle: progress.nextStep?.title ?? null,
            nextHref: progress.nextStep?.href ?? null,
          };
        }
        setWizardByProjectId(nextWizardByProjectId);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setWizardLoadingByProjectId(Object.fromEntries(sorted.map((p) => [p.id, false])));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sorted]);

  const enterProject = useCallback(
    (p: Project) => {
      const w = wizardByProjectId[p.id];
      if (!w) {
        navigate(`/projects/${p.id}/wizard`);
        return;
      }
      navigate(w.percent >= 100 ? `/projects/${p.id}/writing` : `/projects/${p.id}/wizard`);
    },
    [navigate, wizardByProjectId],
  );

  const resetBundleSelection = useCallback(() => {
    setBundleFileName("");
    setBundlePayload(null);
    setBundleSummary(null);
    setBundleError("");
    setBundleRebuildVectors(false);
  }, []);

  const loadBundleFile = useCallback(
    async (file: File | null) => {
      setBundleImportResult(null);
      resetBundleSelection();
      if (!file) return;
      setBundleFileName(file.name || "project.bundle.json");
      const maxBytes = Number(bundleConfig.max_bytes) || DEFAULT_PROJECT_BUNDLE_IMPORT_MAX_BYTES;
      if (file.size > maxBytes) {
        setBundleError(`项目包超过大小限制：${formatBytes(file.size)} / ${formatBytes(maxBytes)}`);
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        setBundleError("项目包 JSON 解析失败");
        return;
      }
      if (!isProjectBundleV1(parsed)) {
        setBundleError(`不支持的项目包版本，仅支持 ${PROJECT_BUNDLE_SCHEMA_VERSION}`);
        return;
      }
      setBundlePayload(parsed);
      setBundleSummary(buildProjectBundleSummary(parsed));
    },
    [bundleConfig.max_bytes, resetBundleSelection],
  );

  const submitBundleImport = useCallback(async () => {
    if (!bundlePayload || bundleImporting) return;
    setBundleImporting(true);
    setBundleError("");
    try {
      const res = await apiJson<{ result: ProjectBundleImportResult }>("/api/projects/import_bundle", {
        method: "POST",
        body: JSON.stringify({ bundle: bundlePayload, rebuild_vectors: bundleRebuildVectors }),
        timeoutMs: 120_000,
      });
      setBundleImportResult(res.data.result);
      await refresh();
      toast.toastSuccess("项目包导入完成", res.request_id);
    } catch (e) {
      const err = e as ApiError;
      setBundleError(`${err.message} (${err.code})`);
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBundleImporting(false);
    }
  }, [bundleImporting, bundlePayload, bundleRebuildVectors, refresh, toast]);

  type PrimaryCta = { label: string; onClick: () => void; disabled?: boolean; ariaLabel: string };
  const primaryCta: PrimaryCta = useMemo(() => {
    if (!recommendedProject) {
      return {
        label: "创建第一个项目",
        onClick: () => setCreateOpen(true),
        ariaLabel: "创建第一个项目 (dashboard_primary_create)",
      };
    }

    if (recommendedWizardLoading) {
      return { label: "读取中...", onClick: () => {}, disabled: true, ariaLabel: "读取中 (dashboard_primary_loading)" };
    }

    const wizard = recommendedWizard;
    if (wizard && wizard.percent >= 100) {
      return {
        label: "继续写作",
        onClick: () => navigate(`/projects/${recommendedProject.id}/writing`),
        ariaLabel: "继续写作 (dashboard_primary_write)",
      };
    }

    const nextHref = wizard?.nextHref;
    if (wizard && nextHref) {
      return {
        label: wizard.nextTitle ? `继续：${wizard.nextTitle}` : "继续开工",
        onClick: () => navigate(nextHref),
        ariaLabel: "继续下一步 (dashboard_primary_next)",
      };
    }

    return {
      label: "打开最近项目",
      onClick: () => enterProject(recommendedProject),
      ariaLabel: "打开最近项目 (dashboard_primary_open_latest)",
    };
  }, [enterProject, navigate, recommendedProject, recommendedWizard, recommendedWizardLoading]);

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words font-content text-2xl text-ink sm:text-3xl">{greeting}，欢迎回来</div>
          <div className="mt-1 break-words text-sm text-subtext">
            {recommendedProject
              ? `继续「${recommendedProject.name}」的创作，或从下方选择其他项目。`
              : "从创建第一个项目开始。"}
          </div>
        </div>
        <button
          className="btn btn-primary w-full sm:w-auto"
          onClick={primaryCta.onClick}
          disabled={primaryCta.disabled}
          aria-label={primaryCta.ariaLabel}
          type="button"
        >
          {primaryCta.label}
        </button>
      </div>
      <motion.div
        className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: { staggerChildren: reduceMotion ? 0 : duration.stagger },
          },
        }}
      >
        <button
          className="panel-interactive ui-focus-ring group relative flex min-h-[180px] flex-col items-center justify-center gap-2 border-dashed p-5 text-center"
          onClick={() => setCreateOpen(true)}
          type="button"
        >
          <div className="font-content text-2xl text-ink">+</div>
          <div className="text-sm text-subtext">新建项目</div>
        </button>

        <button
          className="panel-interactive ui-focus-ring group relative flex min-h-[180px] flex-col items-center justify-center gap-2 border-dashed p-5 text-center"
          onClick={() => {
            setBundleImportOpen(true);
            setBundleImportResult(null);
          }}
          type="button"
        >
          <FileUp className="h-7 w-7 text-ink" aria-hidden="true" />
          <div className="text-sm text-subtext">导入项目包</div>
          <div className="max-w-xs text-xs text-subtext">上传 `.bundle.json`，导入为一个新项目。</div>
        </button>

        <div className="panel p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-content text-xl text-ink">推荐流程</div>
              <div className="mt-1 text-xs text-subtext">
                {recommendedProject ? `基于最近项目「${recommendedProject.name}」：` : "创建项目后，可从这里快速开始："}
              </div>
            </div>
            {recommendedProject ? (
              <button
                className="btn btn-ghost px-3 py-2 text-xs"
                onClick={() => enterProject(recommendedProject)}
                aria-label="继续最近项目 (dashboard_continue_latest)"
                type="button"
              >
                继续
              </button>
            ) : null}
          </div>
          {recommendedProject ? (
            <>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  className="btn btn-secondary justify-start"
                  onClick={() => navigate(`/projects/${recommendedProject.id}/settings`)}
                  aria-label="项目设置 (dashboard_recommend_settings)"
                  type="button"
                >
                  项目设置
                </button>
                <button
                  className="btn btn-secondary justify-start"
                  onClick={() => navigate(`/projects/${recommendedProject.id}/wizard`)}
                  aria-label="开工向导 (dashboard_recommend_wizard)"
                  type="button"
                >
                  开工向导
                </button>
                <button
                  className="btn btn-secondary justify-start"
                  onClick={() => navigate(`/projects/${recommendedProject.id}/writing`)}
                  aria-label="写作 (dashboard_recommend_writing)"
                  type="button"
                >
                  写作
                </button>
              </div>

              {recommendedWizardLoading ? (
                <div className="mt-3 text-xs text-subtext">计算完成度...</div>
              ) : recommendedWizard ? (
                <div className="mt-3 rounded-atelier border border-border bg-canvas p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-subtext">
                    <div>完成度：{recommendedWizard.percent}%</div>
                    <div className="min-w-0 truncate">
                      {recommendedWizard.nextTitle ? `下一步：${recommendedWizard.nextTitle}` : "已完成"}
                    </div>
                  </div>
                  <ProgressBar ariaLabel="推荐流程完成度" className="mt-2" value={recommendedWizard.percent} />
                  {recommendedWizard.nextHref ? (
                    <button
                      className="btn btn-primary mt-3 w-full"
                      onClick={() => navigate(recommendedWizard.nextHref ?? "")}
                      type="button"
                    >
                      {recommendedWizard.nextTitle ? `继续：${recommendedWizard.nextTitle}` : "继续"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-4 grid gap-2">
              <div className="text-xs text-subtext">建议流程：</div>
              <ol className="list-decimal pl-5 text-xs text-subtext">
                <li>新建项目</li>
                <li>项目设置：补齐世界观/风格/约束</li>
                <li>模型配置：保存并测试连接</li>
                <li>大纲 → 写作 → 预览/导出</li>
              </ol>
              <div className="mt-1 text-xs text-subtext">提示：也可以先新建项目，再从“推荐流程”一键进入下一步。</div>
              <button className="btn btn-secondary mt-2 w-full" onClick={() => setCreateOpen(true)} type="button">
                打开创建项目
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="panel p-6">
            <div className="skeleton h-5 w-40" />
            <div className="mt-3 grid gap-2">
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-3 w-52" />
            </div>
            <div className="mt-4 h-2 w-full rounded-full bg-border/60">
              <div className="skeleton h-2 w-1/3 rounded-full" />
            </div>
          </div>
        ) : null}

        {!loading && projects.length === 0 && error ? (
          <div className="panel p-6">
            <div className="font-content text-xl text-ink">项目加载失败</div>
            <div className="mt-2 text-sm text-subtext">{error.message}</div>
            {error.requestId ? (
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-subtext">
                <span className="truncate">
                  {UI_COPY.common.requestIdLabel}: <span className="font-mono">{error.requestId}</span>
                </span>
                <button
                  className="btn btn-ghost px-2 py-1 text-xs"
                  onClick={async () => {
                    await navigator.clipboard.writeText(error.requestId ?? "");
                  }}
                  type="button"
                >
                  {UI_COPY.common.copy}
                </button>
              </div>
            ) : null}
            <button className="btn btn-secondary mt-4" onClick={() => void refresh()} type="button">
              重试
            </button>
          </div>
        ) : null}

        {sorted.map((p) => {
          const wizard = wizardByProjectId[p.id];
          const wizardLoading = wizardLoadingByProjectId[p.id];
          return (
            <motion.div
              key={p.id}
              className="panel-interactive group relative flex min-h-[180px] flex-col overflow-hidden p-5 text-left"
              initial="hidden"
              animate="show"
              variants={{
                hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
                show: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 },
              }}
              transition={reduceMotion ? { duration: 0.01 } : transition.base}
              whileHover={reduceMotion ? undefined : { y: -2, transition: transition.fast }}
              whileTap={reduceMotion ? undefined : { y: 0, scale: 0.98, transition: transition.fast }}
              onClick={() => enterProject(p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  enterProject(p);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-border/55" />
              <div className="pointer-events-none absolute inset-y-0 left-3 w-8 bg-gradient-to-r from-border/25 to-transparent" />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="break-words font-content text-xl text-ink">{p.name}</div>
                  <div className="mt-1 text-xs text-subtext">{p.genre ? `类型：${p.genre}` : "未填写类型"}</div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    className="btn btn-secondary px-3 py-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/projects/${p.id}/wizard`);
                    }}
                    type="button"
                  >
                    向导
                  </button>
                  <button
                    className="btn btn-ghost px-3 py-2 text-xs text-accent hover:bg-accent/10"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await confirm.confirm({
                        title: "删除项目？",
                        description: "该操作会删除项目及其设定/角色/章节/生成记录，且不可恢复。",
                        confirmText: "删除",
                        danger: true,
                      });
                      if (!ok) return;
                      try {
                        const res = await apiJson<Record<string, never>>(`/api/projects/${p.id}`, { method: "DELETE" });
                        await refresh();
                        toast.toastSuccess("已删除");
                        return res;
                      } catch (e) {
                        const err = e as ApiError;
                        toast.toastError(`${err.message} (${err.code})`, err.requestId);
                      }
                    }}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="mt-3 flex-1">
                {p.logline ? <div className="line-clamp-5 text-sm text-subtext">{p.logline}</div> : null}
              </div>

              <div className="mt-4">
                {wizardLoading ? (
                  <div className="text-xs text-subtext">计算完成度...</div>
                ) : wizard ? (
                  <>
                    <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-subtext">
                      <div>完成度：{wizard.percent}%</div>
                      <div className="min-w-0 truncate">
                        {wizard.nextTitle ? `下一步：${wizard.nextTitle}` : "已完成"}
                      </div>
                    </div>
                    <ProgressBar ariaLabel={`${p.name} 完成度`} className="mt-2" value={wizard.percent} />
                  </>
                ) : null}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      <Modal
        open={bundleImportOpen}
        onClose={() => {
          setBundleImportOpen(false);
          resetBundleSelection();
        }}
        panelClassName="surface max-w-2xl p-4 sm:p-6"
        ariaLabel="导入项目包"
      >
        <div className="font-content text-2xl text-ink">导入项目包</div>
        <div className="mt-1 text-sm text-subtext">
          项目包会导入为一个新项目，不会覆盖现有项目。当前上限：{formatBytes(bundleConfig.max_bytes)}。
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2">
            <span className="text-xs text-subtext">选择 `.bundle.json` 文件</span>
            <input
              className="input"
              accept=".json,.bundle.json,application/json"
              disabled={bundleImporting}
              onChange={(event) => void loadBundleFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>

          {bundleFileName ? <div className="break-all text-xs text-subtext">已选择：{bundleFileName}</div> : null}
          {bundleError ? <div className="callout-danger text-sm">{bundleError}</div> : null}

          {bundleSummary ? (
            <div className="grid gap-3 rounded-atelier border border-border bg-canvas p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words font-content text-lg text-ink">{bundleSummary.projectName}</div>
                  <div className="text-xs text-subtext">schema：{bundleSummary.schemaVersion}</div>
                </div>
                <div className="text-xs text-subtext">将创建新项目</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-subtext sm:grid-cols-3">
                <div>大纲：{bundleSummary.counts.outlines}</div>
                <div>章节：{bundleSummary.counts.chapters}</div>
                <div>角色：{bundleSummary.counts.characters}</div>
                <div>世界书：{bundleSummary.counts.worldbookEntries}</div>
                <div>Prompt：{bundleSummary.counts.promptPresets}</div>
                <div>记忆：{bundleSummary.counts.structuredMemoryItems + bundleSummary.counts.storyMemories}</div>
                <div>知识库：{bundleSummary.counts.knowledgeBases}</div>
                <div>导入资料：{bundleSummary.counts.sourceDocuments}</div>
                <div>数值表格：{bundleSummary.counts.projectTables}</div>
                <div>表格行：{bundleSummary.counts.projectTableRows}</div>
                <div>术语：{bundleSummary.counts.glossaryTerms}</div>
              </div>
              {bundleSummary.apiKeyWarnings.length > 0 ? (
                <div className="callout-warning text-sm">
                  {bundleSummary.apiKeyWarnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              ) : null}
              <div className="text-xs text-subtext">默认不会重建向量/搜索索引；导入后可在 RAG 或搜索页面手动重建。</div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  checked={bundleRebuildVectors}
                  className="h-4 w-4"
                  disabled={bundleImporting}
                  onChange={(event) => setBundleRebuildVectors(event.target.checked)}
                  type="checkbox"
                />
                <span>导入后尝试重建向量索引</span>
              </label>
            </div>
          ) : null}

          {bundleImportResult ? (
            <div className="grid gap-3 rounded-atelier border border-success/30 bg-success/10 p-4 text-sm">
              <div className="font-semibold text-ink">已导入作品数据，可稍后在 RAG/搜索相关页面手动重建。</div>
              {bundleImportResult.report?.warnings?.length ? (
                <div className="text-subtext">提示：{bundleImportResult.report.warnings.join("、")}</div>
              ) : null}
              <div className="flex justify-end">
                <button
                  className="btn btn-primary"
                  onClick={() => navigate(`/projects/${bundleImportResult.project_id}/wizard`)}
                  type="button"
                >
                  进入新项目
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            className="btn btn-secondary"
            disabled={bundleImporting}
            onClick={() => {
              setBundleImportOpen(false);
              resetBundleSelection();
            }}
            type="button"
          >
            关闭
          </button>
          <button
            className="btn btn-primary"
            disabled={!bundlePayload || bundleImporting}
            onClick={() => void submitBundleImport()}
            type="button"
          >
            {bundleImporting ? "导入中..." : "导入为新项目"}
          </button>
        </div>
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        panelClassName="surface max-w-lg p-4 sm:p-6"
        ariaLabel="创建项目"
      >
        <div className="font-content text-2xl text-ink">创建项目</div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-subtext">项目名</span>
            <input
              className="input"
              name="name"
              value={form.name}
              onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">类型（可选）</span>
            <input
              className="input"
              name="genre"
              value={form.genre}
              onChange={(e) => setForm((v) => ({ ...v, genre: e.target.value }))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">一句话梗概（可选）</span>
            <textarea
              className="textarea"
              name="logline"
              rows={3}
              value={form.logline}
              onChange={(e) => setForm((v) => ({ ...v, logline: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button className="btn btn-secondary" onClick={() => setCreateOpen(false)} type="button">
            取消
          </button>
          <button
            className="btn btn-primary"
            disabled={creating || !form.name.trim()}
            onClick={async () => {
              setCreating(true);
              try {
                const res = await apiJson<{ project: Project }>("/api/projects", {
                  method: "POST",
                  body: JSON.stringify({
                    name: form.name.trim(),
                    genre: form.genre.trim() || undefined,
                    logline: form.logline.trim() || undefined,
                  }),
                });
                await refresh();
                toast.toastSuccess("创建成功");
                setCreateOpen(false);
                setForm({ name: "", genre: "", logline: "" });
                navigate(`/projects/${res.data.project.id}/settings`);
              } catch (e) {
                const err = e as ApiError;
                toast.toastError(`${err.message} (${err.code})`, err.requestId);
              } finally {
                setCreating(false);
              }
            }}
            type="button"
          >
            创建
          </button>
        </div>
      </Modal>
    </div>
  );
}
