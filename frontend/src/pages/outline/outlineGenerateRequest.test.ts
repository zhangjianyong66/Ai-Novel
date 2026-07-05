import { describe, expect, it } from "vitest";

import { buildOutlineGenerateRequestInit, resolveOutlineGenerateRequestTimeoutMs } from "./outlineGenerateRequest";

describe("outline generate request", () => {
  it("derives non-stream request timeout from the LLM preset timeout", () => {
    const init = buildOutlineGenerateRequestInit({
      headers: { "X-LLM-Provider": "openai_compatible" },
      payload: { requirements: { chapter_count: 12 } },
      llmTimeoutSeconds: 222,
    });

    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "X-LLM-Provider": "openai_compatible" });
    expect(init.body).toBe(JSON.stringify({ requirements: { chapter_count: 12 } }));
    expect(init.timeoutMs).toBe(282_000);
  });

  it("falls back to the backend default LLM timeout plus response margin", () => {
    expect(resolveOutlineGenerateRequestTimeoutMs(null)).toBe(240_000);
    expect(resolveOutlineGenerateRequestTimeoutMs(undefined)).toBe(240_000);
  });
});
