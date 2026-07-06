import { describe, expect, it } from "vitest";

import { buildLlmJsonRequestInit, resolveLlmRequestTimeoutMs } from "./llmRequestTimeout";

describe("resolveLlmRequestTimeoutMs", () => {
  it("uses LLM timeout plus response margin", () => {
    expect(resolveLlmRequestTimeoutMs(600)).toBe(660_000);
  });

  it("falls back to default LLM timeout plus response margin", () => {
    expect(resolveLlmRequestTimeoutMs(null)).toBe(240_000);
  });
});

describe("buildLlmJsonRequestInit", () => {
  it("builds a POST JSON request with LLM-derived timeout", () => {
    const init = buildLlmJsonRequestInit({
      headers: { "X-LLM-Provider": "openai_compatible" },
      payload: { prompt: "hello" },
      llmTimeoutSeconds: 600,
    });

    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "X-LLM-Provider": "openai_compatible" });
    expect(init.body).toBe(JSON.stringify({ prompt: "hello" }));
    expect(init.timeoutMs).toBe(660_000);
  });

  it("allows requests without custom headers", () => {
    const init = buildLlmJsonRequestInit({
      payload: { ok: true },
      llmTimeoutSeconds: 300,
    });

    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({});
    expect(init.body).toBe(JSON.stringify({ ok: true }));
    expect(init.timeoutMs).toBe(360_000);
  });
});
