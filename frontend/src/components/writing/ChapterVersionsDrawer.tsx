import { useId } from "react";
import clsx from "clsx";
import { Check, Diff, History, RotateCcw } from "lucide-react";

import { formatDateTime } from "../../lib/dateTime";
import type { ChapterVersionDetail, ChapterVersionSummary } from "../../types";
import { Drawer } from "../ui/Drawer";
import { ChapterVersionDiffView } from "./ChapterVersionDiffView";

type Props = {
  open: boolean;
  loading: boolean;
  detailLoading: boolean;
  activating: boolean;
  compareMode: boolean;
  compareLoading: boolean;
  versions: ChapterVersionSummary[];
  selectedVersion: ChapterVersionDetail | null;
  compareBaseVersion: ChapterVersionDetail | null;
  compareBaseVersionId: string;
  activeVersionId?: string | null;
  canActivate: boolean;
  blockReason?: string | null;
  onClose: () => void;
  onSelectVersion: (versionId: string) => void;
  onComparePreviousVersion: () => void;
  onCompareBaseVersionChange: (versionId: string) => void;
  onCloseCompare: () => void;
  onActivateVersion: () => void;
};

function sourceLabel(source: string): string {
  if (source === "ai_generate") return "AI 生成";
  if (source === "ai_optimize") return "AI 优化";
  if (source === "manual_snapshot") return "AI 前快照";
  return source;
}

function versionOptionLabel(version: ChapterVersionSummary): string {
  return `${sourceLabel(version.source)} · ${formatDateTime(version.created_at)} · ${version.word_count} 字`;
}

export function ChapterVersionsDrawer(props: Props) {
  const titleId = useId();
  const selectedId = props.selectedVersion?.id ?? null;
  const selectedIndex = selectedId ? props.versions.findIndex((version) => version.id === selectedId) : -1;
  const previousVersion = selectedIndex >= 0 ? props.versions[selectedIndex + 1] : null;
  const compareOptions = props.versions.filter((version) => version.id !== selectedId);
  const compareDisabled = !props.selectedVersion || !previousVersion || props.loading || props.detailLoading;
  const selectedLabel = props.selectedVersion ? versionOptionLabel(props.selectedVersion) : "目标版本";
  const compareBaseLabel = props.compareBaseVersion ? versionOptionLabel(props.compareBaseVersion) : "基准版本";
  const compactCompare = props.compareMode;

  return (
    <Drawer
      open={props.open}
      side="bottom"
      onClose={props.onClose}
      ariaLabelledBy={titleId}
      panelClassName="h-[86dvh] w-full !overflow-hidden rounded-t-atelier border-t border-border bg-surface shadow-panel sm:h-full sm:max-w-5xl sm:rounded-none sm:border-l sm:border-t-0"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <History className="h-4 w-4 text-subtext" aria-hidden="true" />
            <h2 id={titleId} className="truncate text-sm font-semibold text-ink">
              章节版本
            </h2>
          </div>
          <button className="btn btn-secondary" onClick={props.onClose} type="button">
            关闭
          </button>
        </div>

        <div
          className={clsx(
            "grid min-h-0 min-w-0 flex-1 overflow-hidden md:grid-cols-[320px_minmax(0,1fr)] md:grid-rows-1",
            compactCompare ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[minmax(0,34dvh)_minmax(0,1fr)]",
          )}
        >
          <div className="min-h-0 min-w-0 overflow-hidden border-b border-border md:border-b-0 md:border-r">
            <div
              className={clsx(
                "h-full",
                compactCompare
                  ? "max-h-28 overflow-x-hidden overflow-y-auto p-2 md:max-h-none md:overflow-y-auto md:p-3"
                  : "overflow-y-auto p-3",
              )}
            >
              {props.loading ? <div className="p-3 text-sm text-subtext">加载中...</div> : null}
              {!props.loading && props.versions.length === 0 ? (
                <div className="p-3 text-sm text-subtext">暂无历史版本</div>
              ) : null}
              <div className={clsx(compactCompare ? "grid grid-cols-2 gap-2 md:grid-cols-1" : "grid gap-2")}>
                {props.versions.map((version) => {
                  const active = version.id === props.activeVersionId || version.is_active;
                  const selected = version.id === selectedId;
                  return (
                    <button
                      key={version.id}
                      className={clsx(
                        "ui-focus-ring grid gap-1 rounded-md border text-left text-sm ui-transition",
                        compactCompare ? "w-full min-w-0 p-2 md:p-3" : "w-full p-3",
                        selected ? "border-accent bg-accent/10" : "border-border bg-canvas/40 hover:bg-canvas",
                      )}
                      onClick={() => props.onSelectVersion(version.id)}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink">{sourceLabel(version.source)}</span>
                        {active ? (
                          <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">
                            <Check className="h-3 w-3" aria-hidden="true" />
                            当前
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-xs text-subtext">{formatDateTime(version.created_at)}</span>
                      <span className="truncate text-xs text-subtext">
                        {version.word_count} 字{version.model ? ` · ${version.model}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
            <div
              className={clsx(
                "flex flex-col border-b border-border md:flex-row md:items-center md:justify-between",
                compactCompare ? "gap-2 px-3 py-2 sm:px-4" : "gap-3 px-4 py-3 sm:px-5",
              )}
            >
              <div className="min-w-0 truncate text-sm text-subtext">
                {props.selectedVersion ? (
                  <>
                    <span className="font-medium text-ink">{sourceLabel(props.selectedVersion.source)}</span>
                    <span> · {formatDateTime(props.selectedVersion.created_at)}</span>
                    <span> · {props.selectedVersion.word_count} 字</span>
                  </>
                ) : (
                  "选择一个版本查看预览"
                )}
              </div>
              {props.compareMode ? (
                <label className="grid min-w-0 gap-1 md:max-w-md md:flex-1 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
                  <span className="text-xs text-subtext">对比基准</span>
                  <select
                    className="select min-w-0 text-xs"
                    disabled={props.compareLoading || compareOptions.length === 0}
                    onChange={(event) => props.onCompareBaseVersionChange(event.target.value)}
                    value={props.compareBaseVersionId}
                  >
                    {compareOptions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {versionOptionLabel(version)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div
                className={clsx(
                  "grid w-full gap-2 md:flex md:w-auto md:flex-wrap md:items-center",
                  compactCompare ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-2",
                )}
              >
                {props.compareMode ? (
                  <button
                    className={clsx("btn btn-secondary", compactCompare ? "btn-sm min-h-8 px-2" : "min-h-9 px-3")}
                    onClick={props.onCloseCompare}
                    type="button"
                  >
                    返回预览
                  </button>
                ) : null}
                <button
                  className={clsx("btn btn-secondary", compactCompare ? "btn-sm min-h-8 px-2" : "min-h-9 px-3")}
                  disabled={compareDisabled}
                  onClick={props.onComparePreviousVersion}
                  title={!previousVersion ? "没有可对比的上一个版本" : "对比版本列表中的上一个更早版本"}
                  type="button"
                >
                  <Diff className="h-4 w-4" aria-hidden="true" />
                  {compactCompare ? (
                    <>
                      <span className="sm:hidden">上一版</span>
                      <span className="hidden sm:inline">对比上一个版本</span>
                    </>
                  ) : (
                    "对比上一个版本"
                  )}
                </button>
                <button
                  className={clsx("btn btn-primary", compactCompare ? "btn-sm min-h-8 px-2" : "min-h-9 px-3")}
                  disabled={!props.selectedVersion || props.activating || !props.canActivate}
                  onClick={props.onActivateVersion}
                  type="button"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {compactCompare ? (
                    <>
                      <span className="sm:hidden">设当前</span>
                      <span className="hidden sm:inline">设为当前版本</span>
                    </>
                  ) : (
                    "设为当前版本"
                  )}
                </button>
              </div>
            </div>

            <div
              className={clsx(
                "min-h-0 min-w-0 overflow-x-hidden overflow-y-auto",
                compactCompare ? "px-2 pb-2 pt-0 sm:px-4 sm:pb-4" : "p-4 sm:p-5",
              )}
            >
              {props.blockReason ? <div className="callout-warning mb-4 text-xs">{props.blockReason}</div> : null}
              {props.compareMode ? (
                <div className="grid min-w-0 gap-3">
                  {!props.compareBaseVersion && !props.compareLoading ? (
                    <div className="rounded-md border border-border bg-canvas/50 px-3 py-2 text-xs text-subtext">
                      没有可对比版本。
                    </div>
                  ) : null}
                  {props.compareLoading || props.detailLoading ? (
                    <div className="text-sm text-subtext">加载对比中...</div>
                  ) : props.selectedVersion && props.compareBaseVersion ? (
                    <ChapterVersionDiffView
                      baseContentMd={props.compareBaseVersion.content_md}
                      targetContentMd={props.selectedVersion.content_md}
                      baseLabel={compareBaseLabel}
                      targetLabel={selectedLabel}
                    />
                  ) : null}
                </div>
              ) : props.detailLoading ? (
                <div className="text-sm text-subtext">加载预览中...</div>
              ) : props.selectedVersion ? (
                <pre className="whitespace-pre-wrap break-words rounded-atelier border border-border bg-canvas/60 p-4 font-content text-sm leading-7 text-ink">
                  {props.selectedVersion.content_md}
                </pre>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
