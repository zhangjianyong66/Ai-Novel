import { useId } from "react";

import { Modal } from "../ui/Modal";

import type { ChapterAnalysisSuggestion, ChapterAnalyzeResult } from "./types";

function getFinalizationLabel(verdict?: string): string {
  if (verdict === "ready") return "可以定稿";
  if (verdict === "needs_revision") return "建议修改后定稿";
  if (verdict === "blocked") return "不建议定稿";
  return "未给出结论";
}

function getOutlineGoalLabel(status?: string): string {
  if (status === "complete") return "完成";
  if (status === "partial") return "部分完成";
  if (status === "missing") return "未完成";
  if (status === "unknown") return "无法判断";
  return status?.trim() || "未给出";
}

function SuggestionList(props: {
  title: string;
  empty: string;
  items: ChapterAnalysisSuggestion[] | undefined;
  onLocateInEditor: (excerpt: string) => void;
}) {
  const items = props.items ?? [];
  return (
    <div className="grid gap-2 rounded-atelier border border-border bg-surface p-3">
      <div className="text-sm text-ink">{props.title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-subtext">{props.empty}</div>
      ) : (
        <div className="grid gap-2">
          {items.map((it, idx) => (
            <div key={idx} className="rounded-atelier border border-border bg-canvas p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-ink">
                  {(it.title ?? "").trim() || "建议"}{" "}
                  {(it.severity ?? it.priority ?? "").trim() ? (
                    <span className="text-xs text-subtext">({it.severity ?? it.priority})</span>
                  ) : null}
                </div>
                {it.excerpt ? (
                  <button
                    className="btn btn-ghost px-2 py-1 text-xs"
                    onClick={() => props.onLocateInEditor(it.excerpt ?? "")}
                    type="button"
                  >
                    定位
                  </button>
                ) : null}
              </div>
              {it.excerpt ? <div className="mt-2 text-xs text-subtext">{it.excerpt}</div> : null}
              {it.issue ? <div className="mt-2 text-sm text-ink">问题：{it.issue}</div> : null}
              {it.recommendation ? <div className="mt-2 text-sm text-ink">建议：{it.recommendation}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChapterAnalysisModal(props: {
  open: boolean;
  analysisLoading: boolean;
  rewriteLoading: boolean;
  applyLoading: boolean;
  analysisFocus: string;
  setAnalysisFocus: (value: string) => void;
  analysisResult: ChapterAnalyzeResult | null;
  rewriteInstruction: string;
  setRewriteInstruction: (value: string) => void;
  onClose: () => void;
  onAnalyze: () => void;
  onApplyAnalysisToMemory: () => void;
  onLocateInEditor: (excerpt: string) => void;
  onRewriteFromAnalysis: () => void;
}) {
  const busy = props.analysisLoading || props.rewriteLoading || props.applyLoading;
  const titleId = useId();
  return (
    <Modal
      open={props.open}
      onClose={busy ? undefined : props.onClose}
      panelClassName="surface max-w-3xl p-5"
      ariaLabelledBy={titleId}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-content text-xl text-ink" id={titleId}>
            章节分析
          </div>
          <div className="mt-1 text-xs text-subtext">
            分析与重写只会写入“生成记录”；保存到记忆库会写入长期记忆（不影响章节正文）。
          </div>
        </div>
        <button className="btn btn-secondary" aria-label="关闭" onClick={props.onClose} disabled={busy} type="button">
          关闭
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1">
          <span className="text-xs text-subtext">分析重点（可选）</span>
          <input
            className="input"
            value={props.analysisFocus}
            onChange={(e) => props.setAnalysisFocus(e.target.value)}
            disabled={busy}
            placeholder="例如：钩子/伏笔回收、节奏、人物动机、逻辑矛盾…"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" disabled={busy} onClick={props.onAnalyze} type="button">
            {props.analysisLoading ? "分析中..." : props.analysisResult ? "重新分析" : "开始分析"}
          </button>
          <button
            className="btn btn-secondary"
            disabled={!props.analysisResult || busy}
            onClick={props.onApplyAnalysisToMemory}
            type="button"
          >
            {props.applyLoading ? "保存中..." : "保存到记忆库"}
          </button>
          {props.analysisResult?.generation_run_id ? (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void navigator.clipboard.writeText(props.analysisResult?.generation_run_id ?? "")}
              type="button"
            >
              复制 run_id
            </button>
          ) : null}
        </div>

        {props.analysisResult ? (
          <div className="grid gap-4">
            {props.analysisResult.parse_error?.message ? (
              <div className="rounded-atelier border border-border bg-surface p-3 text-sm text-accent">
                解析失败：{props.analysisResult.parse_error.message}
                {props.analysisResult.parse_error.hint ? (
                  <div className="mt-1 text-xs text-subtext">hint: {props.analysisResult.parse_error.hint}</div>
                ) : null}
              </div>
            ) : null}

            {props.analysisResult.warnings && props.analysisResult.warnings.length > 0 ? (
              <div className="rounded-atelier border border-border bg-surface p-3 text-xs text-subtext">
                warnings: {props.analysisResult.warnings.join(", ")}
              </div>
            ) : null}

            <div className="grid gap-3 rounded-atelier border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-ink">定稿结论</div>
                <span className="rounded-md border border-border bg-canvas px-2 py-1 text-xs text-ink">
                  {getFinalizationLabel(props.analysisResult.analysis?.finalization?.verdict)}
                </span>
              </div>
              <div className="text-sm text-ink">
                {(props.analysisResult.analysis?.finalization?.reason ?? "").trim() || "（无说明）"}
              </div>
              {props.analysisResult.analysis?.finalization?.recommended_action ? (
                <div className="text-xs text-subtext">
                  本轮建议：{props.analysisResult.analysis.finalization.recommended_action}
                </div>
              ) : null}
              <div className="grid gap-1 border-t border-border pt-3 text-sm">
                <div className="text-ink">
                  章节目标完成度：{getOutlineGoalLabel(props.analysisResult.analysis?.outline_goal?.status)}
                </div>
                {props.analysisResult.analysis?.outline_goal?.notes ? (
                  <div className="text-subtext">{props.analysisResult.analysis.outline_goal.notes}</div>
                ) : null}
              </div>
            </div>

            <SuggestionList
              title="阻断定稿问题"
              empty="无阻断定稿问题，可以定稿。"
              items={props.analysisResult.analysis?.blocking_issues}
              onLocateInEditor={props.onLocateInEditor}
            />

            <SuggestionList
              title="可选优化"
              empty="无可选优化。"
              items={props.analysisResult.analysis?.optional_improvements}
              onLocateInEditor={props.onLocateInEditor}
            />

            <SuggestionList
              title="润色建议"
              empty="无润色建议。"
              items={props.analysisResult.analysis?.polish_suggestions}
              onLocateInEditor={props.onLocateInEditor}
            />

            {(props.analysisResult.analysis?.previous_issue_tracking ?? []).length > 0 ? (
              <div className="grid gap-2 rounded-atelier border border-border bg-surface p-3">
                <div className="text-sm text-ink">上一轮问题追踪</div>
                <div className="grid gap-2">
                  {(props.analysisResult.analysis?.previous_issue_tracking ?? []).map((it, idx) => (
                    <div key={idx} className="rounded-atelier border border-border bg-canvas p-3 text-sm">
                      <div className="text-ink">
                        {(it.issue ?? "").trim() || "问题"}{" "}
                        {(it.status ?? "").trim() ? <span className="text-xs text-subtext">({it.status})</span> : null}
                      </div>
                      {it.note ? <div className="mt-1 text-subtext">{it.note}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 rounded-atelier border border-border bg-surface p-3">
              <div className="text-sm text-ink">本章摘要</div>
              <div className="text-sm text-ink">
                {(props.analysisResult.analysis?.chapter_summary ?? "").trim() || "（空）"}
              </div>
            </div>

            <div className="grid gap-2 rounded-atelier border border-border bg-surface p-3">
              <div className="text-sm text-ink">Hooks / 钩子</div>
              {(props.analysisResult.analysis?.hooks ?? []).length === 0 ? (
                <div className="text-sm text-subtext">（无）</div>
              ) : (
                <div className="grid gap-2">
                  {(props.analysisResult.analysis?.hooks ?? []).map((it, idx) => (
                    <div key={idx} className="rounded-atelier border border-border bg-canvas p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-subtext">{(it.excerpt ?? "").trim() || "（无 excerpt）"}</div>
                        {it.excerpt ? (
                          <button
                            className="btn btn-ghost px-2 py-1 text-xs"
                            onClick={() => props.onLocateInEditor(it.excerpt ?? "")}
                            type="button"
                          >
                            定位
                          </button>
                        ) : null}
                      </div>
                      {it.note ? <div className="mt-2 text-sm text-ink">{it.note}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-2 rounded-atelier border border-border bg-surface p-3">
              <div className="text-sm text-ink">Foreshadows / 伏笔</div>
              {(props.analysisResult.analysis?.foreshadows ?? []).length === 0 ? (
                <div className="text-sm text-subtext">（无）</div>
              ) : (
                <div className="grid gap-2">
                  {(props.analysisResult.analysis?.foreshadows ?? []).map((it, idx) => (
                    <div key={idx} className="rounded-atelier border border-border bg-canvas p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-subtext">{(it.excerpt ?? "").trim() || "（无 excerpt）"}</div>
                        {it.excerpt ? (
                          <button
                            className="btn btn-ghost px-2 py-1 text-xs"
                            onClick={() => props.onLocateInEditor(it.excerpt ?? "")}
                            type="button"
                          >
                            定位
                          </button>
                        ) : null}
                      </div>
                      {it.note ? <div className="mt-2 text-sm text-ink">{it.note}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-2 rounded-atelier border border-border bg-surface p-3">
              <div className="text-sm text-ink">Plot Points / 情节点</div>
              {(props.analysisResult.analysis?.plot_points ?? []).length === 0 ? (
                <div className="text-sm text-subtext">（无）</div>
              ) : (
                <div className="grid gap-2">
                  {(props.analysisResult.analysis?.plot_points ?? []).map((it, idx) => (
                    <div key={idx} className="rounded-atelier border border-border bg-canvas p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm text-ink">{(it.beat ?? "").trim() || "（无 beat）"}</div>
                        {it.excerpt ? (
                          <button
                            className="btn btn-ghost px-2 py-1 text-xs"
                            onClick={() => props.onLocateInEditor(it.excerpt ?? "")}
                            type="button"
                          >
                            定位
                          </button>
                        ) : null}
                      </div>
                      {it.excerpt ? <div className="mt-2 text-xs text-subtext">{it.excerpt}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-2 rounded-atelier border border-border bg-surface p-3">
              <div className="text-sm text-ink">Suggestions / 修改建议</div>
              {(props.analysisResult.analysis?.suggestions ?? []).length === 0 ? (
                <div className="text-sm text-subtext">（无）</div>
              ) : (
                <div className="grid gap-2">
                  {(props.analysisResult.analysis?.suggestions ?? []).map((it, idx) => (
                    <div key={idx} className="rounded-atelier border border-border bg-canvas p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm text-ink">
                          {(it.title ?? "").trim() || "建议"}{" "}
                          {(it.priority ?? "").trim() ? (
                            <span className="text-xs text-subtext">({it.priority})</span>
                          ) : null}
                        </div>
                        {it.excerpt ? (
                          <button
                            className="btn btn-ghost px-2 py-1 text-xs"
                            onClick={() => props.onLocateInEditor(it.excerpt ?? "")}
                            type="button"
                          >
                            定位
                          </button>
                        ) : null}
                      </div>
                      {it.excerpt ? <div className="mt-2 text-xs text-subtext">{it.excerpt}</div> : null}
                      {it.issue ? <div className="mt-2 text-sm text-ink">问题：{it.issue}</div> : null}
                      {it.recommendation ? (
                        <div className="mt-2 text-sm text-ink">建议：{it.recommendation}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {props.analysisResult.analysis?.overall_notes ? (
              <div className="grid gap-2 rounded-atelier border border-border bg-surface p-3">
                <div className="text-sm text-ink">总体备注</div>
                <div className="text-sm text-ink">{props.analysisResult.analysis.overall_notes}</div>
              </div>
            ) : null}

            {(props.analysisResult.analysis?.followup_assets ?? []).length > 0 ||
            (props.analysisResult.analysis?.planning_notes ?? []).length > 0 ? (
              <div className="grid gap-2 rounded-atelier border border-border bg-surface p-3">
                <div className="text-sm text-ink">后续写作资产</div>
                {(props.analysisResult.analysis?.followup_assets ?? []).map((it, idx) => (
                  <div key={`asset-${idx}`} className="rounded-atelier border border-border bg-canvas p-3 text-sm">
                    <div className="text-ink">
                      {(it.title ?? "").trim() || "资产"}{" "}
                      {(it.type ?? "").trim() ? <span className="text-xs text-subtext">({it.type})</span> : null}
                    </div>
                    {it.note ? <div className="mt-1 text-subtext">{it.note}</div> : null}
                  </div>
                ))}
                {(props.analysisResult.analysis?.planning_notes ?? []).map((note, idx) => (
                  <div
                    key={`note-${idx}`}
                    className="rounded-atelier border border-border bg-canvas p-3 text-sm text-subtext"
                  >
                    {note}
                  </div>
                ))}
              </div>
            ) : null}

            <details>
              <summary className="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink">
                raw_output
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded-atelier border border-border bg-canvas p-3 text-xs text-ink">
                {props.analysisResult.raw_output ?? ""}
              </pre>
            </details>
          </div>
        ) : (
          <div className="text-sm text-subtext">暂无分析结果。</div>
        )}

        <div className="grid gap-3 rounded-atelier border border-border bg-surface p-3">
          <div className="text-sm text-ink">按建议重写（覆盖编辑器正文）</div>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">重写指令（可选）</span>
            <input
              className="input"
              value={props.rewriteInstruction}
              onChange={(e) => props.setRewriteInstruction(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-subtext">默认只应用阻断定稿问题；普通优化和润色由作者自行取舍。</div>
            <button
              className="btn btn-primary"
              disabled={!props.analysisResult || busy}
              onClick={props.onRewriteFromAnalysis}
              type="button"
            >
              {props.rewriteLoading ? "重写中..." : "按建议重写并应用"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
