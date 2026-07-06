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
  const pairs = pairSimilarParagraphs(ops);
  const blocks: ChapterVersionDiffBlock[] = [];
  const emittedPairs = new Set<string>();

  for (const [index, op] of ops.entries()) {
    const pair = pairs.get(index);
    if (pair) {
      if (emittedPairs.has(pair.id)) continue;
      emittedPairs.add(pair.id);
      blocks.push(buildChangedBlock(pair.baseText, pair.targetText));
      continue;
    }

    if (op.kind === "added") {
      blocks.push({
        type: "added",
        targetText: op.value,
        targetTokens: [{ kind: "added", text: op.value }],
      });
      continue;
    }

    if (op.kind === "removed") {
      blocks.push({
        type: "removed",
        baseText: op.value,
        baseTokens: [{ kind: "removed", text: op.value }],
      });
    }
  }

  return blocks;
}

function buildChangedBlock(baseText: string, targetText: string): ChapterVersionDiffBlock {
  return {
    type: "changed",
    baseText,
    targetText,
    ...buildInlineTokenDiff(baseText, targetText),
  };
}

function pairSimilarParagraphs(
  ops: Array<DiffOp<string>>,
): Map<number, { id: string; baseText: string; targetText: string }> {
  const removed = ops
    .map((op, index) => ({ op, index }))
    .filter(
      (entry): entry is { op: Extract<DiffOp<string>, { kind: "removed" }>; index: number } =>
        entry.op.kind === "removed",
    );
  const added = ops
    .map((op, index) => ({ op, index }))
    .filter(
      (entry): entry is { op: Extract<DiffOp<string>, { kind: "added" }>; index: number } => entry.op.kind === "added",
    );

  const candidates = removed.flatMap((baseEntry) =>
    added
      .map((targetEntry) => ({
        baseIndex: baseEntry.index,
        targetIndex: targetEntry.index,
        score: paragraphSimilarity(baseEntry.op.value, targetEntry.op.value),
      }))
      .filter((candidate) => candidate.score >= PARAGRAPH_PAIR_SIMILARITY_THRESHOLD),
  );

  candidates.sort((a, b) => b.score - a.score);

  const usedBaseIndexes = new Set<number>();
  const usedTargetIndexes = new Set<number>();
  const pairs = new Map<number, { id: string; baseText: string; targetText: string }>();

  for (const candidate of candidates) {
    if (usedBaseIndexes.has(candidate.baseIndex) || usedTargetIndexes.has(candidate.targetIndex)) continue;

    const baseOp = ops[candidate.baseIndex];
    const targetOp = ops[candidate.targetIndex];
    if (baseOp.kind !== "removed" || targetOp.kind !== "added") continue;

    usedBaseIndexes.add(candidate.baseIndex);
    usedTargetIndexes.add(candidate.targetIndex);

    const pair = {
      id: `${candidate.baseIndex}-${candidate.targetIndex}`,
      baseText: baseOp.value,
      targetText: targetOp.value,
    };
    pairs.set(candidate.baseIndex, pair);
    pairs.set(candidate.targetIndex, pair);
  }

  return pairs;
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
