import { describe, expect, it } from "vitest";

import { buildChapterGenerateRequestInit, resolveChapterGenerateRequestTimeoutMs } from "./chapterGenerateRequest";

describe("chapter generate request", () => {
  it("derives non-stream request timeout from the LLM preset timeout", () => {
    const init = buildChapterGenerateRequestInit({
      headers: { "X-LLM-Provider": "openai_compatible" },
      payload: { mode: "replace" },
      llmTimeoutSeconds: 222,
    });

    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "X-LLM-Provider": "openai_compatible" });
    expect(init.body).toBe(JSON.stringify({ mode: "replace" }));
    expect(init.timeoutMs).toBe(282_000);
  });

  it("falls back to the backend default LLM timeout plus response margin", () => {
    expect(resolveChapterGenerateRequestTimeoutMs(null)).toBe(240_000);
    expect(resolveChapterGenerateRequestTimeoutMs(undefined)).toBe(240_000);
  });
});
