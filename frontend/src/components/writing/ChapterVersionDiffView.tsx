import { useMemo } from "react";
import clsx from "clsx";

import {
  buildChapterVersionDiff,
  type ChapterVersionDiffBlock,
  type ChapterVersionDiffToken,
} from "../../lib/chapterVersionDiff";

type Props = {
  baseContentMd: string;
  targetContentMd: string;
  baseLabel: string;
  targetLabel: string;
};

function tokenClassName(token: ChapterVersionDiffToken): string {
  if (token.kind === "added") return "rounded bg-success/15 text-success";
  if (token.kind === "removed") return "rounded bg-danger/15 text-danger line-through decoration-danger/70";
  return "";
}

function renderTokens(tokens: ChapterVersionDiffToken[] | undefined, fallback: string | undefined) {
  if (!tokens?.length) return fallback || "（空）";
  return tokens.map((token, index) => (
    <span className={tokenClassName(token)} key={`${index}-${token.kind}-${token.text}`}>
      {token.text}
    </span>
  ));
}

function panelTone(block: ChapterVersionDiffBlock, side: "base" | "target"): string {
  if (block.type === "equal") return "border-border bg-canvas/50";
  if (block.type === "removed" && side === "base") return "border-danger/30 bg-danger/5";
  if (block.type === "added" && side === "target") return "border-success/30 bg-success/5";
  if (block.type === "changed")
    return side === "base" ? "border-danger/25 bg-danger/5" : "border-success/25 bg-success/5";
  return "border-border bg-canvas/30 opacity-60";
}

function renderBlockSide(block: ChapterVersionDiffBlock, side: "base" | "target") {
  const text = side === "base" ? block.baseText : block.targetText;
  const tokens = side === "base" ? block.baseTokens : block.targetTokens;
  return (
    <div
      className={clsx(
        "min-h-12 whitespace-pre-wrap break-words rounded-md border p-3 font-content text-sm leading-7 text-ink",
        panelTone(block, side),
      )}
    >
      {renderTokens(tokens, text)}
    </div>
  );
}

export function ChapterVersionDiffView(props: Props) {
  const diff = useMemo(
    () =>
      buildChapterVersionDiff({
        baseContent: props.baseContentMd,
        targetContent: props.targetContentMd,
      }),
    [props.baseContentMd, props.targetContentMd],
  );

  if (!diff.hasChanges) {
    return (
      <div className="rounded-atelier border border-border bg-canvas/60 p-4 text-sm text-subtext">
        两个版本正文一致，无差异。
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-subtext">
          基准版本：<span className="text-ink">{props.baseLabel}</span>
        </div>
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-subtext">
          目标版本：<span className="text-ink">{props.targetLabel}</span>
        </div>
      </div>

      <div className="grid gap-3">
        {diff.blocks.map((block, index) => (
          <div className="grid gap-3 md:grid-cols-2" key={`${index}-${block.type}`}>
            {renderBlockSide(block, "base")}
            {renderBlockSide(block, "target")}
          </div>
        ))}
      </div>
    </div>
  );
}
