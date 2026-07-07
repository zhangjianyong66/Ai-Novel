import { describe, expect, it } from "vitest";

import { getAnalysisMemoryApplyButtonState } from "../../components/writing/chapterAnalysisModalState";
import type { ChapterAnalyzeResult, ChapterRewriteResult } from "../../components/writing/types";
import { resolveAnalysisAfterRewrite } from "./useChapterAnalysis";

const analysisResult: ChapterAnalyzeResult = {
  generation_run_id: "run-analysis",
  analysis: {
    chapter_summary: "旧正文分析",
    suggestions: [{ recommendation: "重写这一段" }],
  },
};

function rewriteResult(overrides: Partial<ChapterRewriteResult>): ChapterRewriteResult {
  return {
    generation_run_id: "run-rewrite",
    content_md: "重写后的正文",
    ...overrides,
  };
}

describe("resolveAnalysisAfterRewrite", () => {
  it("invalidates the previous analysis after a rewrite is saved as the active chapter version", () => {
    expect(resolveAnalysisAfterRewrite(analysisResult, rewriteResult({ saved_version: { id: "v2" } }))).toBeNull();
    expect(resolveAnalysisAfterRewrite(analysisResult, rewriteResult({ active_version: { id: "v2" } }))).toBeNull();
  });

  it("keeps the previous analysis when the rewrite only updates the local editor draft", () => {
    expect(resolveAnalysisAfterRewrite(analysisResult, rewriteResult({}))).toBe(analysisResult);
  });
});

describe("getAnalysisMemoryApplyButtonState", () => {
  it("shows the manual save-to-memory action whenever a fresh analysis result exists", () => {
    expect(
      getAnalysisMemoryApplyButtonState({
        analysisResult,
        busy: false,
        applyLoading: false,
      }),
    ).toEqual({
      visible: true,
      disabled: false,
      label: "保存到记忆库",
    });
  });

  it("keeps the manual action visible but disabled for stale analysis results", () => {
    expect(
      getAnalysisMemoryApplyButtonState({
        analysisResult: {
          ...analysisResult,
          persisted_analysis: {
            plot_analysis_id: "pa1",
            analysis: analysisResult.analysis,
            is_stale: true,
          },
        },
        busy: false,
        applyLoading: false,
      }),
    ).toEqual({
      visible: true,
      disabled: true,
      label: "保存到记忆库",
    });
  });
});
