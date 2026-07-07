export type ChapterVersionDiffTokenKind = "equal" | "added" | "removed";

export type ChapterVersionDiffToken = {
  kind: ChapterVersionDiffTokenKind;
  text: string;
};

export type ChapterVersionDiffBlockType = "equal" | "changed" | "added" | "removed";

export type ChapterVersionDiffBlock = {
  type: ChapterVersionDiffBlockType;
  baseText?: string;
  targetText?: string;
  baseTokens?: ChapterVersionDiffToken[];
  targetTokens?: ChapterVersionDiffToken[];
};

export type ChapterVersionDiffResult = {
  hasChanges: boolean;
  blocks: ChapterVersionDiffBlock[];
};

type DiffOp<T> = { kind: "equal"; value: T } | { kind: "added"; value: T } | { kind: "removed"; value: T };

const PARAGRAPH_PAIR_SIMILARITY_THRESHOLD = 0.35;

type RemovedParagraphEntry = { op: Extract<DiffOp<string>, { kind: "removed" }>; index: number; order: number };
type AddedParagraphEntry = { op: Extract<DiffOp<string>, { kind: "added" }>; index: number; order: number };
type ParagraphPair = {
  id: string;
  baseOrder: number;
  targetOrder: number;
  baseText: string;
  targetText: string;
};
type PairPlan = { pairCount: number; pairs: ParagraphPair[]; score: number };

export function buildChapterVersionDiff(input: {
  baseContent: string;
  targetContent: string;
}): ChapterVersionDiffResult {
  const baseParagraphs = splitParagraphs(normalizeContent(input.baseContent));
  const targetParagraphs = splitParagraphs(normalizeContent(input.targetContent));
  const paragraphOps = diffSequence(baseParagraphs, targetParagraphs);
  const blocks = coalesceParagraphOps(paragraphOps);
  return {
    hasChanges: blocks.some((block) => block.type !== "equal"),
    blocks,
  };
}

function normalizeContent(content: string): string {
  return String(content ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitParagraphs(content: string): string[] {
  if (!content) return [];
  return content.split(/\n{2}/g);
}

function coalesceParagraphOps(ops: Array<DiffOp<string>>): ChapterVersionDiffBlock[] {
  const blocks: ChapterVersionDiffBlock[] = [];
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    if (op.kind === "equal") {
      blocks.push({ type: "equal", baseText: op.value, targetText: op.value });
      continue;
    }

    const group: Array<DiffOp<string>> = [op];
    while (ops[i + 1]?.kind !== "equal" && i + 1 < ops.length) {
      i += 1;
      group.push(ops[i]);
    }

    blocks.push(...coalesceChangeGroup(group));
  }
  return blocks;
}

function coalesceChangeGroup(ops: Array<DiffOp<string>>): ChapterVersionDiffBlock[] {
  const removed = collectRemovedParagraphs(ops);
  const added = collectAddedParagraphs(ops);
  const pairs = pairSimilarParagraphs(removed, added);
  const blocks: ChapterVersionDiffBlock[] = [];
  let baseCursor = 0;
  let targetCursor = 0;

  for (const pair of pairs) {
    while (baseCursor < pair.baseOrder) {
      blocks.push(buildRemovedBlock(removed[baseCursor].op.value));
      baseCursor += 1;
    }

    while (targetCursor < pair.targetOrder) {
      blocks.push(buildAddedBlock(added[targetCursor].op.value));
      targetCursor += 1;
    }

    blocks.push(buildChangedBlock(pair.baseText, pair.targetText));
    baseCursor = pair.baseOrder + 1;
    targetCursor = pair.targetOrder + 1;
  }

  while (baseCursor < removed.length) {
    blocks.push(buildRemovedBlock(removed[baseCursor].op.value));
    baseCursor += 1;
  }

  while (targetCursor < added.length) {
    blocks.push(buildAddedBlock(added[targetCursor].op.value));
    targetCursor += 1;
  }

  return blocks;
}

function buildAddedBlock(targetText: string): ChapterVersionDiffBlock {
  return {
    type: "added",
    targetText,
    targetTokens: [{ kind: "added", text: targetText }],
  };
}

function buildRemovedBlock(baseText: string): ChapterVersionDiffBlock {
  return {
    type: "removed",
    baseText,
    baseTokens: [{ kind: "removed", text: baseText }],
  };
}

function buildChangedBlock(baseText: string, targetText: string): ChapterVersionDiffBlock {
  return {
    type: "changed",
    baseText,
    targetText,
    ...buildInlineTokenDiff(baseText, targetText),
  };
}

function collectRemovedParagraphs(ops: Array<DiffOp<string>>): RemovedParagraphEntry[] {
  return ops
    .map((op, index) => ({ op, index }))
    .filter(
      (entry): entry is { op: Extract<DiffOp<string>, { kind: "removed" }>; index: number } =>
        entry.op.kind === "removed",
    )
    .map((entry, order) => ({ ...entry, order }));
}

function collectAddedParagraphs(ops: Array<DiffOp<string>>): AddedParagraphEntry[] {
  return ops
    .map((op, index) => ({ op, index }))
    .filter(
      (entry): entry is { op: Extract<DiffOp<string>, { kind: "added" }>; index: number } => entry.op.kind === "added",
    )
    .map((entry, order) => ({ ...entry, order }));
}

function pairSimilarParagraphs(removed: RemovedParagraphEntry[], added: AddedParagraphEntry[]): ParagraphPair[] {
  const emptyPlan: PairPlan = { pairCount: 0, pairs: [], score: 0 };
  const dp = Array.from({ length: removed.length + 1 }, () => Array<PairPlan>(added.length + 1).fill(emptyPlan));

  for (let i = 1; i <= removed.length; i += 1) {
    for (let j = 1; j <= added.length; j += 1) {
      let best = betterPairPlan(dp[i - 1][j], dp[i][j - 1]);
      const baseEntry = removed[i - 1];
      const targetEntry = added[j - 1];
      const similarity = paragraphSimilarity(baseEntry.op.value, targetEntry.op.value);

      if (similarity >= PARAGRAPH_PAIR_SIMILARITY_THRESHOLD) {
        const previous = dp[i - 1][j - 1];
        const withPair: PairPlan = {
          pairCount: previous.pairCount + 1,
          pairs: [
            ...previous.pairs,
            {
              id: `${baseEntry.index}-${targetEntry.index}`,
              baseOrder: baseEntry.order,
              targetOrder: targetEntry.order,
              baseText: baseEntry.op.value,
              targetText: targetEntry.op.value,
            },
          ],
          score: previous.score + similarity,
        };
        best = betterPairPlan(best, withPair);
      }

      dp[i][j] = best;
    }
  }

  return dp[removed.length][added.length].pairs;
}

function betterPairPlan(a: PairPlan, b: PairPlan): PairPlan {
  if (a.score !== b.score) return a.score > b.score ? a : b;
  if (a.pairCount !== b.pairCount) return a.pairCount > b.pairCount ? a : b;
  return a;
}

function buildInlineTokenDiff(
  baseText: string,
  targetText: string,
): Pick<ChapterVersionDiffBlock, "baseTokens" | "targetTokens"> {
  const baseTokens = tokenize(baseText);
  const targetTokens = tokenize(targetText);
  const ops = diffSequence(baseTokens, targetTokens);
  return {
    baseTokens: ops
      .filter((op) => op.kind !== "added")
      .map((op) => ({ kind: op.kind === "equal" ? "equal" : "removed", text: op.value })),
    targetTokens: ops
      .filter((op) => op.kind !== "removed")
      .map((op) => ({ kind: op.kind === "equal" ? "equal" : "added", text: op.value })),
  };
}

function tokenize(text: string): string[] {
  const tokens = text.match(/[\u4e00-\u9fff]|[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_\u4e00-\u9fff]/gu);
  return tokens ?? [];
}

function paragraphSimilarity(baseText: string, targetText: string): number {
  const baseTokens = tokenize(baseText).filter((token) => token.trim());
  const targetTokens = tokenize(targetText).filter((token) => token.trim());
  if (!baseTokens.length || !targetTokens.length) return 0;

  const sharedTokenCount = diffSequence(baseTokens, targetTokens).filter((op) => op.kind === "equal").length;
  return (sharedTokenCount * 2) / (baseTokens.length + targetTokens.length);
}

function diffSequence<T>(base: T[], target: T[]): Array<DiffOp<T>> {
  const rows = base.length + 1;
  const cols = target.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = base.length - 1; i >= 0; i -= 1) {
    for (let j = target.length - 1; j >= 0; j -= 1) {
      if (Object.is(base[i], target[j])) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const ops: Array<DiffOp<T>> = [];
  let i = 0;
  let j = 0;
  while (i < base.length && j < target.length) {
    if (Object.is(base[i], target[j])) {
      ops.push({ kind: "equal", value: base[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "removed", value: base[i] });
      i += 1;
    } else {
      ops.push({ kind: "added", value: target[j] });
      j += 1;
    }
  }
  while (i < base.length) {
    ops.push({ kind: "removed", value: base[i] });
    i += 1;
  }
  while (j < target.length) {
    ops.push({ kind: "added", value: target[j] });
    j += 1;
  }
  return ops;
}
