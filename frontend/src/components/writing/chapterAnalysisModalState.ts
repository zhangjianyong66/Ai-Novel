import type { ChapterAnalyzeResult } from "./types";

export function getAnalysisMemoryApplyButtonState(args: {
  analysisResult: ChapterAnalyzeResult | null;
  busy: boolean;
  applyLoading: boolean;
}): { visible: boolean; disabled: boolean; label: string } {
  const isStale = Boolean(args.analysisResult?.persisted_analysis?.is_stale);
  return {
    visible: Boolean(args.analysisResult),
    disabled: !args.analysisResult || args.busy || isStale,
    label: args.applyLoading ? "保存中..." : "保存到记忆库",
  };
}
