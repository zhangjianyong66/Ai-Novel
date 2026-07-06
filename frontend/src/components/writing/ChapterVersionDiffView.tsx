import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

import {
  buildChapterVersionDiff,
  type ChapterVersionDiffBlock,
  type ChapterVersionDiffToken,
} from "../../lib/chapterVersionDiff";
import { findCurrentDiffOrdinalByViewport, type DiffViewportRect } from "./chapterVersionDiffNavigation";

type Props = {
  baseContentMd: string;
  targetContentMd: string;
  baseLabel: string;
  targetLabel: string;
};

function getScrollParent(element: HTMLElement | null): HTMLElement | Window {
  let current = element?.parentElement ?? null;
  while (current) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`)) return current;
    current = current.parentElement;
  }
  return window;
}

function tokenClassName(token: ChapterVersionDiffToken): string {
  if (token.kind === "added") return "rounded-sm bg-success/10 px-0.5 text-success";
  if (token.kind === "removed") return "rounded-sm bg-danger/10 px-0.5 text-danger line-through decoration-danger/60";
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
  if (block.type === "removed" && side === "base") return "border-danger/30 border-l-danger/70 ring-danger/20";
  if (block.type === "added" && side === "target") return "border-success/30 border-l-success/70 ring-success/20";
  if (block.type === "changed")
    return side === "base"
      ? "border-danger/25 border-l-danger/70 ring-danger/20"
      : "border-success/25 border-l-success/70 ring-success/20";
  return "border-border bg-canvas/40 text-subtext";
}

function emptySideLabel(block: ChapterVersionDiffBlock, side: "base" | "target"): string | null {
  if (block.type === "added" && side === "base") return "此侧无对应段落";
  if (block.type === "removed" && side === "target") return "此侧无对应段落";
  return null;
}

function renderBlockSide(block: ChapterVersionDiffBlock, side: "base" | "target") {
  const text = side === "base" ? block.baseText : block.targetText;
  const tokens = side === "base" ? block.baseTokens : block.targetTokens;
  const emptyLabel = emptySideLabel(block, side);
  return (
    <div
      className={clsx(
        "min-h-12 whitespace-pre-wrap break-words rounded-md border border-l-4 bg-canvas/50 p-3 font-content text-sm leading-7 text-ink ring-1 ring-inset",
        panelTone(block, side),
        emptyLabel && "flex items-center font-sans text-xs leading-5 text-subtext",
      )}
    >
      {emptyLabel ?? renderTokens(tokens, text)}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ChapterVersionDiffView(props: Props) {
  const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const navigationRef = useRef<HTMLDivElement | null>(null);
  const diffIdentity = `${props.baseContentMd}\u0000${props.targetContentMd}`;
  const [navigationState, setNavigationState] = useState({ diffIdentity: "", ordinal: 0 });
  const diff = useMemo(
    () =>
      buildChapterVersionDiff({
        baseContent: props.baseContentMd,
        targetContent: props.targetContentMd,
      }),
    [props.baseContentMd, props.targetContentMd],
  );
  const diffBlockIndexes = useMemo(
    () =>
      diff.blocks
        .map((block, index) => (block.type === "equal" ? null : index))
        .filter((index): index is number => index !== null),
    [diff.blocks],
  );
  const diffCount = diffBlockIndexes.length;
  const currentDiffOrdinal =
    navigationState.diffIdentity === diffIdentity ? Math.min(navigationState.ordinal, Math.max(diffCount - 1, 0)) : 0;

  useEffect(() => {
    const navigationElement = navigationRef.current;
    if (!navigationElement || diffCount <= 0) return undefined;

    const navigation = navigationElement;
    const scrollParent = getScrollParent(navigation);
    let frameId: number | null = null;

    function syncCurrentDiffFromScroll() {
      frameId = null;
      const anchorY = navigation.getBoundingClientRect().bottom + 1;
      const rects = diffBlockIndexes
        .map((blockIndex, ordinal) => {
          const element = blockRefs.current.get(blockIndex);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { ordinal, top: rect.top, bottom: rect.bottom };
        })
        .filter((rect): rect is DiffViewportRect => rect !== null);
      const nextOrdinal = findCurrentDiffOrdinalByViewport(anchorY, rects);
      if (nextOrdinal === null) return;

      setNavigationState((previous) => {
        if (previous.diffIdentity === diffIdentity && previous.ordinal === nextOrdinal) return previous;
        return { diffIdentity, ordinal: nextOrdinal };
      });
    }

    function scheduleSync() {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(syncCurrentDiffFromScroll);
    }

    scheduleSync();
    scrollParent.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      scrollParent.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
    };
  }, [diffBlockIndexes, diffCount, diffIdentity]);

  function jumpToDiff(direction: "previous" | "next") {
    if (diffCount <= 0) return;

    setNavigationState(() => {
      const current = currentDiffOrdinal;
      const nextOrdinal = direction === "next" ? (current + 1) % diffCount : (current - 1 + diffCount) % diffCount;
      const blockIndex = diffBlockIndexes[nextOrdinal];
      window.requestAnimationFrame(() => {
        blockRefs.current.get(blockIndex)?.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "center",
        });
      });
      return { diffIdentity, ordinal: nextOrdinal };
    });
  }

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

      <div
        className="sticky -top-5 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface/95 px-3 py-2 shadow-sm"
        ref={navigationRef}
        aria-label="chapter_version_diff_navigation"
      >
        <div
          className="text-xs font-medium text-subtext"
          aria-label={`第 ${currentDiffOrdinal + 1} / 共 ${diffCount} 处`}
        >
          第 <span className="text-ink">{currentDiffOrdinal + 1}</span> / 共{" "}
          <span className="text-ink">{diffCount}</span> 处
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-secondary btn-sm"
            disabled={diffCount <= 1}
            onClick={() => jumpToDiff("previous")}
            title={diffCount <= 1 ? "只有一处差异" : "跳转到上一个差异"}
            type="button"
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
            上一个差异
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={diffCount <= 1}
            onClick={() => jumpToDiff("next")}
            title={diffCount <= 1 ? "只有一处差异" : "跳转到下一个差异"}
            type="button"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
            下一个差异
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {diff.blocks.map((block, index) => {
          const diffOrdinal = diffBlockIndexes.indexOf(index);
          const current = diffOrdinal === currentDiffOrdinal;
          return (
            <div
              className={clsx(
                "scroll-mt-6 rounded-md",
                current && "ring-2 ring-accent/40 ring-offset-2 ring-offset-surface",
              )}
              key={`${index}-${block.type}`}
              ref={(element) => {
                if (!element) {
                  blockRefs.current.delete(index);
                  return;
                }
                blockRefs.current.set(index, element);
              }}
              aria-current={current ? "location" : undefined}
            >
              <div className="grid gap-3 md:grid-cols-2">
                {renderBlockSide(block, "base")}
                {renderBlockSide(block, "target")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
