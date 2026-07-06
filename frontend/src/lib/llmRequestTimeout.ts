import type { ApiRequestInit } from "../services/apiClient";

export const DEFAULT_LLM_TIMEOUT_SECONDS = 180;
export const LLM_REQUEST_RESPONSE_MARGIN_MS = 60_000;

export function resolveLlmRequestTimeoutMs(llmTimeoutSeconds: number | null | undefined): number {
  const timeoutSeconds =
    typeof llmTimeoutSeconds === "number" && Number.isFinite(llmTimeoutSeconds) && llmTimeoutSeconds > 0
      ? llmTimeoutSeconds
      : DEFAULT_LLM_TIMEOUT_SECONDS;
  return Math.ceil(timeoutSeconds * 1000) + LLM_REQUEST_RESPONSE_MARGIN_MS;
}

export function buildLlmJsonRequestInit(args: {
  headers?: Record<string, string>;
  payload: unknown;
  llmTimeoutSeconds: number | null | undefined;
}): ApiRequestInit {
  return {
    method: "POST",
    headers: args.headers ?? {},
    body: JSON.stringify(args.payload),
    timeoutMs: resolveLlmRequestTimeoutMs(args.llmTimeoutSeconds),
  };
}
