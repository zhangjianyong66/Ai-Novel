import type { ApiRequestInit } from "../../services/apiClient";
import { buildLlmJsonRequestInit, resolveLlmRequestTimeoutMs } from "../../lib/llmRequestTimeout";

export function resolveChapterGenerateRequestTimeoutMs(llmTimeoutSeconds: number | null | undefined): number {
  return resolveLlmRequestTimeoutMs(llmTimeoutSeconds);
}

export function buildChapterGenerateRequestInit(args: {
  headers: Record<string, string>;
  payload: unknown;
  llmTimeoutSeconds: number | null | undefined;
}): ApiRequestInit {
  return buildLlmJsonRequestInit(args);
}
