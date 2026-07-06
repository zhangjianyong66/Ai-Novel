import { buildLlmJsonRequestInit, resolveLlmRequestTimeoutMs } from "../../lib/llmRequestTimeout";
import type { ApiRequestInit } from "../../services/apiClient";

export function resolveOutlineGenerateRequestTimeoutMs(llmTimeoutSeconds: number | null | undefined): number {
  return resolveLlmRequestTimeoutMs(llmTimeoutSeconds);
}

export function buildOutlineGenerateRequestInit(args: {
  headers: Record<string, string>;
  payload: unknown;
  llmTimeoutSeconds: number | null | undefined;
}): ApiRequestInit {
  return buildLlmJsonRequestInit(args);
}
