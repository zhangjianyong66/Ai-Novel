import { useId } from "react";

import type { ProjectTaskRuntime } from "../../services/projectTaskRuntime";
import { Modal } from "../ui/Modal";
import { ProgressBar } from "../ui/ProgressBar";

import type { BatchGenerationTask, BatchGenerationTaskItem } from "./types";

function tryExtractRequestId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const direct = obj.request_id ?? obj.requestId;
      if (typeof direct === "string" && direct.trim()) return direct;

      const nestedError = obj.error;
      if (nestedError && typeof nestedError === "object") {
        const err = nestedError as Record<string, unknown>;
        const nested = err.request_id ?? err.requestId;
        if (typeof nested === "string" && nested.trim()) return nested;
      }
    }
  } catch {
    return null;
  }

  const match = raw.match(/request[_-]?id\s*[:=]\s*([A-Za-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

function tryParseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatProjectTaskStreamStatus(status: "idle" | "connecting" | "open" | "error"): string {
  if (status === "open") return "已连接";
  if (status === "connecting") return "重连中";
  if (status === "error") return "使用轮询兜底";
  return "空闲";
}

function formatTaskStatus(status: BatchGenerationTask["status"]): string {
  const labels: Record<BatchGenerationTask["status"], string> = {
    queued: "排队中",
    running: "生成中",
    paused: "已暂停",
    succeeded: "已完成",
    failed: "失败",
    canceled: "已取消",
  };
  return labels[status] ?? status;
}

function formatItemStatus(status: BatchGenerationTaskItem["status"]): string {
  const labels: Record<BatchGenerationTaskItem["status"], string> = {
    queued: "排队中",
    running: "生成中",
    succeeded: "已完成",
    failed: "失败",
    canceled: "已取消",
    skipped: "已跳过",
  };
  return labels[status] ?? status;
}

function formatCheckpointStatus(value: unknown, fallback: BatchGenerationTask["status"]): string {
  if (typeof value !== "string" || !value.trim()) return formatTaskStatus(fallback);
  const status = value.trim();
  if (status === "queued" || status === "running" || status === "paused" || status === "succeeded") {
    return formatTaskStatus(status);
  }
  if (status === "failed" || status === "canceled") return formatTaskStatus(status);
  return status;
}

function buildStepLabel(item: BatchGenerationTaskItem): string {
  const requestId = item.last_request_id ? ` · 请求 ID ${item.last_request_id}` : "";
  const attempts = ` · 第 ${item.attempt_count} 次尝试`;
  const error = item.error_message ? ` · ${item.error_message}` : "";
  return `${formatItemStatus(item.status)}${attempts}${requestId}${error}`;
}

export function BatchGenerationModal(props: {
  open: boolean;
  batchLoading: boolean;
  activeChapterNumber: number | null;
  batchCount: number;
  setBatchCount: (value: number) => void;
  batchIncludeExisting: boolean;
  setBatchIncludeExisting: (value: boolean) => void;
  batchTask: BatchGenerationTask | null;
  batchItems: BatchGenerationTaskItem[];
  batchRuntime: ProjectTaskRuntime | null;
  projectTaskStreamStatus: "idle" | "connecting" | "open" | "error";
  taskCenterHref?: string | null;
  onClose: () => void;
  onCancelTask: () => void;
  onPauseTask: () => void;
  onResumeTask: () => void;
  onRetryFailedTask: () => void;
  onSkipFailedTask: () => void;
  onStartTask: () => void;
  onApplyItemToEditor: (item: BatchGenerationTaskItem) => void;
}) {
  const titleId = useId();
  const task = props.batchTask;
  const failedItems = props.batchItems.filter((item) => item.status === "failed");
  const taskRunning = Boolean(task && (task.status === "queued" || task.status === "running"));
  const taskPaused = task?.status === "paused";
  const taskTerminal = Boolean(
    task && (task.status === "succeeded" || task.status === "failed" || task.status === "canceled"),
  );
  const requestId =
    tryExtractRequestId(task?.error_json) ??
    failedItems.map((item) => tryExtractRequestId(item.last_error_json)).find(Boolean) ??
    null;
  const processedCount = task ? task.completed_count + task.failed_count + task.skipped_count : 0;
  const taskProgressPercent = task
    ? Math.round((task.total_count > 0 ? processedCount / task.total_count : 0) * 100)
    : 0;
  const latestCheckpoint =
    props.batchRuntime?.checkpoints.at(-1)?.checkpoint ?? tryParseJsonObject(task?.checkpoint_json) ?? null;
  const timeline = props.batchRuntime?.timeline ?? [];
  const streamStatusLabel = formatProjectTaskStreamStatus(props.projectTaskStreamStatus);
  const canResume = Boolean(taskPaused && failedItems.length === 0);
  const canRetryFailed = Boolean(taskPaused && failedItems.length > 0);
  const canSkipFailed = Boolean(taskPaused && failedItems.length > 0);
  const canCancel = Boolean(
    task && (task.status === "queued" || task.status === "running" || task.status === "paused"),
  );

  return (
    <Modal
      open={props.open}
      onClose={props.batchLoading ? undefined : props.onClose}
      panelClassName="surface max-w-3xl p-5"
      ariaLabelledBy={titleId}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-content text-xl text-ink" id={titleId}>
            批量生成
          </div>
          <div className="mt-1 text-xs text-subtext">
            批量生成只会先写入生成记录。应用结果到编辑器前，章节正文不会被自动覆盖。
          </div>
        </div>
        <button
          className="btn btn-secondary"
          aria-label="关闭"
          onClick={props.onClose}
          disabled={props.batchLoading}
          type="button"
        >
          关闭
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-atelier border border-border bg-canvas px-3 py-2 text-xs text-subtext">
        <span aria-label="batch_generation_live_status">运行状态流：{streamStatusLabel}</span>
        {props.taskCenterHref ? (
          <a
            className="btn btn-secondary btn-sm"
            href={props.taskCenterHref}
            aria-label="打开任务中心 (batch_generation_open_task_center)"
          >
            打开任务中心
          </a>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3">
        <div className="grid gap-2 rounded-atelier border border-border bg-canvas p-3">
          <div className="text-sm font-medium text-ink">步骤 1 · 选择范围</div>
          <div className="text-xs text-subtext">
            起点：{props.activeChapterNumber ? `第 ${props.activeChapterNumber} 章之后` : "从第 1 章开始"}
          </div>
          <div className="text-[11px] text-subtext">当前选中的章节会决定起始位置，后续章节会按顺序连续生成。</div>
        </div>

        <div className="grid gap-2 rounded-atelier border border-border bg-canvas p-3">
          <div className="text-sm font-medium text-ink">步骤 2 · 生成选项</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-subtext">生成数量：1~200</span>
              <input
                className="input w-28"
                min={1}
                max={200}
                type="number"
                value={props.batchCount}
                disabled={props.batchLoading || taskRunning}
                onChange={(e) => props.setBatchCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-ink">
              <input
                className="checkbox"
                type="checkbox"
                checked={props.batchIncludeExisting}
                disabled={props.batchLoading || taskRunning}
                onChange={(e) => props.setBatchIncludeExisting(e.target.checked)}
              />
              包含已有正文的章节
            </label>
          </div>
        </div>

        <div className="grid gap-3 rounded-atelier border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-ink">步骤 3 · 执行与恢复</div>
            <div className="flex flex-wrap items-center gap-2">
              {!task || taskTerminal ? (
                <button
                  className="btn btn-primary"
                  disabled={props.batchLoading}
                  onClick={props.onStartTask}
                  type="button"
                >
                  {props.batchLoading ? "启动中..." : "开始批量生成"}
                </button>
              ) : null}
              {taskRunning ? (
                <button
                  className="btn btn-secondary"
                  disabled={props.batchLoading}
                  onClick={props.onPauseTask}
                  aria-label="暂停批量生成 (batch_generation_pause)"
                  type="button"
                >
                  {props.batchLoading ? "处理中..." : "暂停"}
                </button>
              ) : null}
              {canResume ? (
                <button
                  className="btn btn-secondary"
                  disabled={props.batchLoading}
                  onClick={props.onResumeTask}
                  aria-label="继续批量生成 (batch_generation_resume)"
                  type="button"
                >
                  {props.batchLoading ? "处理中..." : "继续"}
                </button>
              ) : null}
              {canRetryFailed ? (
                <button
                  className="btn btn-secondary"
                  disabled={props.batchLoading}
                  onClick={props.onRetryFailedTask}
                  aria-label="重试失败章节 (batch_generation_retry_failed)"
                  type="button"
                >
                  {props.batchLoading ? "处理中..." : "重试失败章节"}
                </button>
              ) : null}
              {canSkipFailed ? (
                <button
                  className="btn btn-secondary"
                  disabled={props.batchLoading}
                  onClick={props.onSkipFailedTask}
                  aria-label="跳过失败章节 (batch_generation_skip_failed)"
                  type="button"
                >
                  {props.batchLoading ? "处理中..." : "跳过失败章节"}
                </button>
              ) : null}
              {canCancel ? (
                <button
                  className="btn btn-secondary"
                  disabled={props.batchLoading}
                  onClick={props.onCancelTask}
                  aria-label="取消批量生成 (batch_generation_cancel)"
                  type="button"
                >
                  {props.batchLoading ? "处理中..." : "取消批量任务"}
                </button>
              ) : null}
            </div>
          </div>

          {!task ? <div className="text-sm text-subtext">还没有批量任务。配置选项后即可启动。</div> : null}

          {task ? (
            <>
              <section
                className="grid gap-2 rounded-atelier border border-border bg-canvas p-3"
                aria-label="batch_generation_runtime_summary"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink">
                  <span>
                    状态：<span>{formatTaskStatus(task.status)}</span>
                  </span>
                  <span>
                    已完成 {task.completed_count}/{task.total_count} · 失败 {task.failed_count} · 已跳过{" "}
                    {task.skipped_count}
                  </span>
                </div>
                <ProgressBar ariaLabel="批量生成进度" value={taskProgressPercent} />
                <div className="text-[11px] text-subtext">
                  请求暂停：{task.pause_requested ? "是" : "否"} · 请求取消：{task.cancel_requested ? "是" : "否"}
                </div>
                {requestId ? <div className="text-[11px] text-subtext">请求 ID：{requestId}</div> : null}
              </section>

              {latestCheckpoint ? (
                <section className="rounded-atelier border border-border bg-canvas p-3">
                  <div className="text-sm text-ink">恢复点</div>
                  <div className="mt-2 grid gap-1 text-xs text-subtext">
                    <div>状态：{formatCheckpointStatus(latestCheckpoint.status, task.status)}</div>
                    <div>已完成：{readNumber(latestCheckpoint.completed_count, task.completed_count)}</div>
                    <div>失败：{readNumber(latestCheckpoint.failed_count, task.failed_count)}</div>
                    <div>已跳过：{readNumber(latestCheckpoint.skipped_count, task.skipped_count)}</div>
                  </div>
                </section>
              ) : null}

              {task.error_json ? (
                <div className="rounded-atelier border border-border bg-canvas p-3">
                  <div className="text-sm text-ink">错误信息</div>
                  <div className="mt-1 break-words text-xs text-subtext">{task.error_json}</div>
                </div>
              ) : null}

              <details
                className="rounded-atelier border border-border bg-canvas p-3"
                aria-label="batch_generation_runtime_timeline"
              >
                <summary className="cursor-pointer select-none text-sm text-ink">运行时间线</summary>
                {timeline.length === 0 ? (
                  <div className="mt-2 text-xs text-subtext">暂无运行事件。</div>
                ) : (
                  <div className="mt-3 max-h-48 space-y-2 overflow-auto text-xs text-subtext">
                    {timeline.map((entry) => (
                      <div
                        key={`${entry.seq}-${entry.event_type}`}
                        className="rounded-atelier border border-border bg-surface px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-ink">
                          <span>
                            #{entry.seq} ? {entry.event_type}
                          </span>
                          <span>{entry.created_at || "-"}</span>
                        </div>
                        <div className="mt-1 text-subtext">
                          {entry.reason ? `原因：${entry.reason}` : "原因：-"}
                          {entry.source ? ` · 来源：${entry.source}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </details>

              <section
                className="max-h-72 overflow-auto rounded-atelier border border-border bg-canvas"
                aria-label="batch_generation_items"
              >
                {props.batchItems.length === 0 ? (
                  <div className="p-3 text-sm text-subtext">暂无批量条目。</div>
                ) : (
                  <div className="divide-y divide-border">
                    {props.batchItems.map((item) => (
                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-ink">第 {item.chapter_number} 章</div>
                          <div className="mt-1 break-words text-xs text-subtext">{buildStepLabel(item)}</div>
                          {item.started_at || item.finished_at ? (
                            <div className="mt-1 text-[11px] text-subtext">
                              开始时间：{item.started_at || "-"} · 结束时间：{item.finished_at || "-"}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {item.status === "succeeded" && item.chapter_id && item.generation_run_id ? (
                            <button
                              className="btn btn-secondary"
                              onClick={() => props.onApplyItemToEditor(item)}
                              disabled={props.batchLoading}
                              type="button"
                            >
                              应用到编辑器
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
