export const DEFAULT_LLM_TIMEOUT_SECONDS = 180;
export const LLM_REQUEST_RESPONSE_MARGIN_MS = 60_000;

export function resolveLlmRequestTimeoutMs(llmTimeoutSeconds: number | null | undefined): number {
  const timeoutSeconds =
    typeof llmTimeoutSeconds === "number" && Number.isFinite(llmTimeoutSeconds) && llmTimeoutSeconds > 0
      ? llmTimeoutSeconds
      : DEFAULT_LLM_TIMEOUT_SECONDS;
  return Math.ceil(timeoutSeconds * 1000) + LLM_REQUEST_RESPONSE_MARGIN_MS;
}
