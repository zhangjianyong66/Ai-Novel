import { useId } from "react";
import clsx from "clsx";
import { Check, History, RotateCcw } from "lucide-react";

import type { ChapterVersionDetail, ChapterVersionSummary } from "../../types";
import { Drawer } from "../ui/Drawer";

type Props = {
  open: boolean;
  loading: boolean;
  detailLoading: boolean;
  activating: boolean;
  versions: ChapterVersionSummary[];
  selectedVersion: ChapterVersionDetail | null;
  activeVersionId?: string | null;
  canActivate: boolean;
  blockReason?: string | null;
  onClose: () => void;
  onSelectVersion: (versionId: string) => void;
  onActivateVersion: () => void;
};

function sourceLabel(source: string): string {
  if (source === "ai_generate") return "AI 生成";
  if (source === "ai_optimize") return "AI 优化";
  if (source === "manual_snapshot") return "AI 前快照";
  return source;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function ChapterVersionsDrawer(props: Props) {
  const titleId = useId();
  const selectedId = props.selectedVersion?.id ?? null;

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      ariaLabelledBy={titleId}
      panelClassName="h-full w-full max-w-5xl border-l border-border bg-surface shadow-panel"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
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

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)]">
          <div className="min-h-0 border-b border-border md:border-b-0 md:border-r">
            <div className="h-full overflow-y-auto p-3">
              {props.loading ? <div className="p-3 text-sm text-subtext">加载中...</div> : null}
              {!props.loading && props.versions.length === 0 ? (
                <div className="p-3 text-sm text-subtext">暂无历史版本</div>
              ) : null}
              <div className="grid gap-2">
                {props.versions.map((version) => {
                  const active = version.id === props.activeVersionId || version.is_active;
                  const selected = version.id === selectedId;
                  return (
                    <button
                      key={version.id}
                      className={clsx(
                        "ui-focus-ring grid w-full gap-1 rounded-md border p-3 text-left text-sm ui-transition",
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
                      <span className="text-xs text-subtext">{formatDate(version.created_at)}</span>
                      <span className="text-xs text-subtext">
                        {version.word_count} 字{version.model ? ` · ${version.model}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div className="min-w-0 text-sm text-subtext">
                {props.selectedVersion ? (
                  <>
                    <span className="font-medium text-ink">{sourceLabel(props.selectedVersion.source)}</span>
                    <span> · {formatDate(props.selectedVersion.created_at)}</span>
                    <span> · {props.selectedVersion.word_count} 字</span>
                  </>
                ) : (
                  "选择一个版本查看预览"
                )}
              </div>
              <button
                className="btn btn-primary min-h-9 px-3"
                disabled={!props.selectedVersion || props.activating || !props.canActivate}
                onClick={props.onActivateVersion}
                type="button"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                设为当前版本
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-5">
              {props.blockReason ? <div className="callout-warning mb-4 text-xs">{props.blockReason}</div> : null}
              {props.detailLoading ? <div className="text-sm text-subtext">加载预览中...</div> : null}
              {!props.detailLoading && props.selectedVersion ? (
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
