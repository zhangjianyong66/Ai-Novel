import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check } from "lucide-react";

import { GhostwriterIndicator } from "../components/atelier/GhostwriterIndicator";
import { WizardNextBar } from "../components/atelier/WizardNextBar";
import { useChapterMetaList } from "../hooks/useChapterMetaList";
import { useToast } from "../components/ui/toast";
import { useWizardProgress } from "../hooks/useWizardProgress";
import { ApiError, apiDownloadAttachment, apiDownloadMarkdown } from "../services/apiClient";
import { markWizardExported } from "../services/wizard";
import {
  buildContentExportUrl,
  canExportContent,
  selectedChapterIdsForAction,
  type ExportForm,
  type SelectedChapterAction,
} from "./exportPageModel";

type AtelierOptionControlProps = {
  type: "checkbox" | "radio";
  checked: boolean;
  disabled?: boolean;
  name?: string;
  onCheckedChange: (next: boolean) => void;
  children: ReactNode;
};

function AtelierOptionControl({ type, checked, disabled, name, onCheckedChange, children }: AtelierOptionControlProps) {
  const isRadio = type === "radio";
  return (
    <label className="group flex items-center gap-2 text-sm text-ink">
      <input
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        name={name}
        onChange={(e) => onCheckedChange(e.target.checked)}
        type={type}
      />
      <span
        className={[
          "inline-flex h-4 w-4 items-center justify-center border border-border bg-canvas ui-transition-fast",
          isRadio ? "rounded-full" : "rounded",
          "group-hover:border-accent/35",
          "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas",
          "peer-checked:border-accent/50 peer-checked:bg-accent/10",
          "peer-disabled:opacity-60 peer-disabled:cursor-not-allowed",
        ].join(" ")}
      >
        {isRadio ? (
          <span className="h-2 w-2 rounded-full bg-accent opacity-0 peer-checked:opacity-100" aria-hidden="true" />
        ) : (
          <Check className="h-3 w-3 text-accent opacity-0 peer-checked:opacity-100" aria-hidden="true" />
        )}
      </span>
      <span className="select-none">{children}</span>
    </label>
  );
}

export function ExportPage() {
  const { projectId } = useParams();
  const toast = useToast();
  const wizard = useWizardProgress(projectId);
  const chapterListQuery = useChapterMetaList(projectId);
  const bumpWizardLocal = wizard.bumpLocal;

  const [exporting, setExporting] = useState(false);
  const [exportingTxt, setExportingTxt] = useState(false);
  const [exportingBundle, setExportingBundle] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [form, setForm] = useState<ExportForm>({
    include_settings: true,
    include_characters: true,
    include_outline: true,
    chapters: "all",
  });

  const exportBusy = exporting || exportingTxt;
  const selectableChapters = chapterListQuery.chapters;
  const selectableChapterIds = useMemo(
    () => new Set(selectableChapters.map((chapter) => chapter.id)),
    [selectableChapters],
  );
  const selectedExportChapterIds = useMemo(
    () => selectedChapterIds.filter((chapterId) => selectableChapterIds.has(chapterId)),
    [selectableChapterIds, selectedChapterIds],
  );
  const selectedChapterIdSet = useMemo(() => new Set(selectedChapterIds), [selectedChapterIds]);
  const contentCanExport = canExportContent(form, selectedExportChapterIds);
  const selectedRangeUnavailable =
    Boolean(chapterListQuery.error) || (chapterListQuery.hasLoaded && selectableChapters.length === 0);

  const url = useMemo(
    () => buildContentExportUrl(projectId, "markdown", form, selectedExportChapterIds),
    [form, projectId, selectedExportChapterIds],
  );

  const txtUrl = useMemo(
    () => buildContentExportUrl(projectId, "txt", form, selectedExportChapterIds),
    [form, projectId, selectedExportChapterIds],
  );

  const chooseChapterRange = useCallback(
    (chapters: ExportForm["chapters"]) => {
      if (chapters === "selected" && selectedRangeUnavailable) return;
      setForm((v) => ({ ...v, chapters }));
    },
    [selectedRangeUnavailable],
  );

  const toggleSelectedChapter = useCallback((chapterId: string, checked: boolean) => {
    setSelectedChapterIds((current) => {
      const next = new Set(current);
      if (checked) next.add(chapterId);
      else next.delete(chapterId);
      return [...next];
    });
  }, []);

  const applySelectedChapterAction = useCallback(
    (action: SelectedChapterAction) => {
      setSelectedChapterIds(selectedChapterIdsForAction(action, selectableChapters));
    },
    [selectableChapters],
  );

  const doExport = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;
    if (!url) return false;
    if (!contentCanExport) {
      toast.toastError("请选择至少一个章节");
      return false;
    }
    if (exporting) return false;
    setExporting(true);
    try {
      const { filename, content } = await apiDownloadMarkdown(url);
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename || "ainovel.md";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.toastSuccess("已导出 Markdown，已开始下载");
      markWizardExported(projectId);
      bumpWizardLocal();
      return true;
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
      return false;
    } finally {
      setExporting(false);
    }
  }, [bumpWizardLocal, contentCanExport, exporting, projectId, toast, url]);

  const doTxtExport = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;
    if (!txtUrl) return false;
    if (!contentCanExport) {
      toast.toastError("请选择至少一个章节");
      return false;
    }
    if (exportingTxt) return false;
    setExportingTxt(true);
    try {
      const { filename, blob } = await apiDownloadAttachment(txtUrl);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename || "ainovel.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.toastSuccess("已导出 TXT，已开始下载");
      markWizardExported(projectId);
      bumpWizardLocal();
      return true;
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
      return false;
    } finally {
      setExportingTxt(false);
    }
  }, [bumpWizardLocal, contentCanExport, exportingTxt, projectId, toast, txtUrl]);

  const doBundleExport = useCallback(async (): Promise<boolean> => {
    if (!projectId || exportingBundle) return false;
    setExportingBundle(true);
    try {
      const { filename, blob } = await apiDownloadAttachment(`/api/projects/${projectId}/export/bundle`);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename || "ainovel.bundle.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.toastSuccess("已导出项目包，已开始下载");
      return true;
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
      return false;
    } finally {
      setExportingBundle(false);
    }
  }, [exportingBundle, projectId, toast]);

  return (
    <div className="grid gap-6 pb-24">
      <section className="panel p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="font-content text-xl">导出 Markdown</div>
            <div className="text-xs text-subtext">
              按选项生成并下载 `.md` 文件（如浏览器拦截下载，请允许该站点下载）。
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-secondary"
              disabled={!projectId || exportingTxt || !contentCanExport}
              onClick={() => void doTxtExport()}
              type="button"
            >
              {exportingTxt ? "导出中…" : "导出 TXT"}
            </button>
            <button
              className="btn btn-primary"
              disabled={!projectId || exporting || !contentCanExport}
              onClick={() => void doExport()}
              type="button"
            >
              {exporting ? "导出中…" : "导出 Markdown"}
            </button>
          </div>
        </div>

        {exporting ? <GhostwriterIndicator className="mt-4" label="导出中：正在生成并下载 Markdown…" /> : null}
        {exportingTxt ? <GhostwriterIndicator className="mt-4" label="导出中：正在生成并下载 TXT…" /> : null}

        <div className="mt-5 grid gap-4">
          <div className="grid gap-2">
            <div className="text-xs text-subtext">包含内容</div>
            <AtelierOptionControl
              checked={form.include_settings}
              disabled={exportBusy}
              name="include_settings"
              onCheckedChange={(next) => setForm((v) => ({ ...v, include_settings: next }))}
              type="checkbox"
            >
              设定
            </AtelierOptionControl>
            <AtelierOptionControl
              checked={form.include_characters}
              disabled={exportBusy}
              name="include_characters"
              onCheckedChange={(next) => setForm((v) => ({ ...v, include_characters: next }))}
              type="checkbox"
            >
              角色卡
            </AtelierOptionControl>
            <AtelierOptionControl
              checked={form.include_outline}
              disabled={exportBusy}
              name="include_outline"
              onCheckedChange={(next) => setForm((v) => ({ ...v, include_outline: next }))}
              type="checkbox"
            >
              大纲
            </AtelierOptionControl>
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-subtext">章节范围</div>
            <AtelierOptionControl
              checked={form.chapters === "all"}
              disabled={exportBusy}
              name="chapters"
              onCheckedChange={(next) => {
                if (!next) return;
                chooseChapterRange("all");
              }}
              type="radio"
            >
              全部章节
            </AtelierOptionControl>
            <AtelierOptionControl
              checked={form.chapters === "done"}
              disabled={exportBusy}
              name="chapters"
              onCheckedChange={(next) => {
                if (!next) return;
                chooseChapterRange("done");
              }}
              type="radio"
            >
              仅定稿章节
            </AtelierOptionControl>
            <AtelierOptionControl
              checked={form.chapters === "selected"}
              disabled={exportBusy || selectedRangeUnavailable}
              name="chapters"
              onCheckedChange={(next) => {
                if (!next) return;
                chooseChapterRange("selected");
              }}
              type="radio"
            >
              选择章节
            </AtelierOptionControl>
            <div className="text-[11px] text-subtext">定稿章节：章节状态为“定稿（done）”。</div>
            {form.chapters !== "selected" && chapterListQuery.error ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-danger">
                <span>章节列表加载失败，选择章节导出暂不可用。</span>
                <button
                  className="btn btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => void chapterListQuery.refresh()}
                  type="button"
                >
                  重试
                </button>
              </div>
            ) : null}
            {form.chapters !== "selected" && chapterListQuery.hasLoaded && selectableChapters.length === 0 ? (
              <div className="text-xs text-subtext">暂无可选择章节。</div>
            ) : null}
          </div>

          {form.chapters === "selected" ? (
            <div className="grid gap-3 border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-subtext">
                  已选择 {selectedExportChapterIds.length} / {selectableChapters.length} 章
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="btn btn-secondary px-3 py-1.5 text-xs"
                    disabled={exportBusy || selectableChapters.length === 0}
                    onClick={() => applySelectedChapterAction("all")}
                    type="button"
                  >
                    全选
                  </button>
                  <button
                    className="btn btn-secondary px-3 py-1.5 text-xs"
                    disabled={exportBusy || selectableChapters.length === 0}
                    onClick={() => applySelectedChapterAction("done")}
                    type="button"
                  >
                    仅选择定稿
                  </button>
                  <button
                    className="btn btn-ghost px-3 py-1.5 text-xs"
                    disabled={exportBusy || selectedChapterIds.length === 0}
                    onClick={() => applySelectedChapterAction("clear")}
                    type="button"
                  >
                    清空
                  </button>
                </div>
              </div>

              {!contentCanExport ? <div className="text-xs text-warning">请选择至少一个章节。</div> : null}
              {chapterListQuery.loading && !chapterListQuery.hasLoaded ? (
                <div className="text-xs text-subtext">章节列表加载中...</div>
              ) : null}
              {chapterListQuery.error ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-danger">
                  <span>章节列表加载失败，选择章节导出暂不可用。</span>
                  <button
                    className="btn btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => void chapterListQuery.refresh()}
                    type="button"
                  >
                    重试
                  </button>
                </div>
              ) : null}
              {chapterListQuery.hasLoaded && selectableChapters.length === 0 ? (
                <div className="text-xs text-subtext">暂无可选择章节。</div>
              ) : null}

              {selectableChapters.length > 0 ? (
                <div className="max-h-80 overflow-y-auto border border-border bg-canvas">
                  {selectableChapters.map((chapter) => (
                    <label
                      className="flex min-w-0 items-start gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
                      key={chapter.id}
                    >
                      <input
                        checked={selectedChapterIdSet.has(chapter.id)}
                        className="mt-1 h-4 w-4 accent-accent"
                        disabled={exportBusy}
                        onChange={(e) => toggleSelectedChapter(chapter.id, e.target.checked)}
                        type="checkbox"
                      />
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="truncate text-ink">
                          第{chapter.number}章 {chapter.title || "未命名章节"}
                        </span>
                        <span className="text-xs text-subtext">
                          {chapter.status === "done" ? "定稿" : "草稿"} · {chapter.has_content ? "有正文" : "无正文"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <details className="surface p-3 text-xs text-subtext">
            <summary className="ui-transition-fast cursor-pointer hover:text-ink">排障信息（请求 URL）</summary>
            <div className="mt-2 grid gap-1 break-all">
              <div>Markdown：{url || "（请选择项目）"}</div>
              <div>TXT：{txtUrl || "（请选择项目）"}</div>
            </div>
          </details>
        </div>
      </section>

      <section className="panel p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="font-content text-xl">项目包备份/迁移</div>
            <div className="text-xs text-subtext">
              下载 `.bundle.json`，用于导入为新项目并继续写作；项目包默认包含导入资料原文，不包含 API Key 密文。
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={!projectId || exportingBundle}
            onClick={() => void doBundleExport()}
            type="button"
          >
            {exportingBundle ? "导出中..." : "导出项目包"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-subtext">
          <div>导入项目包会创建新项目，不会覆盖当前项目。</div>
          <Link className="btn btn-secondary px-3 py-2 text-xs" to="/?importBundle=1">
            去首页导入项目包
          </Link>
        </div>
      </section>

      <WizardNextBar
        projectId={projectId}
        currentStep="export"
        progress={wizard.progress}
        loading={wizard.loading}
        primaryAction={
          wizard.progress.nextStep?.key === "export"
            ? { label: "本页：导出 Markdown", disabled: exportBusy || !contentCanExport, onClick: doExport }
            : undefined
        }
      />
    </div>
  );
}
