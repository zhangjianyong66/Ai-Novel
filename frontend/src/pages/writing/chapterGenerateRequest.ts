import type { ApiRequestInit } from "../../services/apiClient";

const DEFAULT_LLM_TIMEOUT_SECONDS = 180;
const CHAPTER_GENERATE_RESPONSE_MARGIN_MS = 60_000;

export function resolveChapterGenerateRequestTimeoutMs(llmTimeoutSeconds: number | null | undefined): number {
  const timeoutSeconds =
    typeof llmTimeoutSeconds === "number" && Number.isFinite(llmTimeoutSeconds) && llmTimeoutSeconds > 0
      ? llmTimeoutSeconds
      : DEFAULT_LLM_TIMEOUT_SECONDS;
  return Math.ceil(timeoutSeconds * 1000) + CHAPTER_GENERATE_RESPONSE_MARGIN_MS;
}

export function buildChapterGenerateRequestInit(args: {
  headers: Record<string, string>;
  payload: unknown;
  llmTimeoutSeconds: number | null | undefined;
}): ApiRequestInit {
  return {
    method: "POST",
    headers: args.headers,
    body: JSON.stringify(args.payload),
    timeoutMs: resolveChapterGenerateRequestTimeoutMs(args.llmTimeoutSeconds),
  };
}
