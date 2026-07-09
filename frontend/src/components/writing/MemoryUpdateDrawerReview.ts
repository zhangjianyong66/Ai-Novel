export type MemoryUpdateDrawerItem = {
  id: string;
  item_index: number;
  target_table: string;
  target_id?: string | null;
  op: string;
  after_json?: string | null;
  evidence_ids_json?: string | null;
};

export type MemoryUpdateDuplicateCandidate = {
  id: string;
  entity_type?: string | null;
  name?: string | null;
  summary_md?: string | null;
  evidence?: { shared_terms?: string[] };
};

export type MemoryUpdateOpPayload = {
  op: string;
  target_table: string;
  target_id?: string | null;
  after?: unknown;
  evidence_ids?: unknown[];
};

function parseJsonField(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function stringifyJsonField(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(value);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function withoutId(value: unknown): unknown {
  const obj = objectRecord(value);
  if (!obj) return value;
  const out = { ...obj };
  delete out.id;
  return out;
}

function removeDuplicateReviewMarker(value: unknown): unknown {
  const obj = objectRecord(value);
  if (!obj) return value;
  const out = { ...obj };
  const attrs = objectRecord(out.attributes);
  if (!attrs) return out;
  const nextAttrs = { ...attrs };
  delete nextAttrs.__review;
  out.attributes = Object.keys(nextAttrs).length ? nextAttrs : null;
  return out;
}

function duplicateReview(value: unknown): Record<string, unknown> | null {
  const obj = objectRecord(value);
  const attrs = objectRecord(obj?.attributes);
  const review = objectRecord(attrs?.__review);
  return review?.duplicate_review_required === true ? review : null;
}

export function getDuplicateReviewCandidates(item: MemoryUpdateDrawerItem): MemoryUpdateDuplicateCandidate[] {
  const review = duplicateReview(parseJsonField(item.after_json));
  const raw = review?.duplicate_candidates;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((candidate) => objectRecord(candidate))
    .filter((candidate): candidate is Record<string, unknown> => !!candidate && typeof candidate.id === "string")
    .map((candidate) => ({
      id: String(candidate.id),
      entity_type: typeof candidate.entity_type === "string" ? candidate.entity_type : null,
      name: typeof candidate.name === "string" ? candidate.name : null,
      summary_md: typeof candidate.summary_md === "string" ? candidate.summary_md : null,
      evidence: objectRecord(candidate.evidence) as MemoryUpdateDuplicateCandidate["evidence"],
    }));
}

export function hasDuplicateReviewRequired(item: MemoryUpdateDrawerItem): boolean {
  return duplicateReview(parseJsonField(item.after_json)) !== null;
}

export function buildInitialAcceptedMap(items: MemoryUpdateDrawerItem[]): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const item of items) next[item.id] = !hasDuplicateReviewRequired(item);
  return next;
}

export function buildMemoryUpdateOpFromItem(item: MemoryUpdateDrawerItem): MemoryUpdateOpPayload {
  const evidenceIds = parseJsonField(item.evidence_ids_json);
  if (item.op === "delete") {
    const base: MemoryUpdateOpPayload = {
      op: "delete",
      target_table: item.target_table,
      target_id: item.target_id,
    };
    if (Array.isArray(evidenceIds) && evidenceIds.length) base.evidence_ids = evidenceIds;
    return base;
  }
  const after = withoutId(parseJsonField(item.after_json));
  const base: MemoryUpdateOpPayload = {
    op: "upsert",
    target_table: item.target_table,
    target_id: item.target_id,
    after,
  };
  if (Array.isArray(evidenceIds) && evidenceIds.length) base.evidence_ids = evidenceIds;
  return base;
}

export function resolveDuplicateReviewForReuse(
  item: MemoryUpdateDrawerItem,
  candidateId: string,
): MemoryUpdateDrawerItem {
  const after = removeDuplicateReviewMarker(parseJsonField(item.after_json));
  return {
    ...item,
    target_id: candidateId,
    after_json: stringifyJsonField(after),
  };
}

export function resolveDuplicateReviewForCreate(item: MemoryUpdateDrawerItem): MemoryUpdateDrawerItem {
  const after = removeDuplicateReviewMarker(parseJsonField(item.after_json));
  return {
    ...item,
    after_json: stringifyJsonField(after),
  };
}
