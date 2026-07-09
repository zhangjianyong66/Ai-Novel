import { describe, expect, it } from "vitest";

import {
  buildInitialAcceptedMap,
  buildMemoryUpdateOpFromItem,
  resolveDuplicateReviewForCreate,
  resolveDuplicateReviewForReuse,
} from "./MemoryUpdateDrawerReview";

const duplicateItem = {
  id: "item-1",
  item_index: 0,
  target_table: "entities",
  target_id: "new-ticket",
  op: "upsert",
  after_json: JSON.stringify({
    id: "new-ticket",
    entity_type: "artifact",
    name: "四年前迷笛音乐节门票",
    summary_md: "泛黄演出门票，背面写着监听完毕，保留。",
    attributes: {
      __review: {
        duplicate_review_required: true,
        duplicate_candidates: [{ id: "ticket_midi", name: "迷笛音乐节旧门票" }],
      },
    },
  }),
};

describe("MemoryUpdateDrawerReview", () => {
  it("默认不接受疑似重复项", () => {
    expect(buildInitialAcceptedMap([duplicateItem])).toEqual({ "item-1": false });
  });

  it("选择复用已有实体时改写 target_id 并移除 review marker", () => {
    const resolved = resolveDuplicateReviewForReuse(duplicateItem, "ticket_midi");
    const op = buildMemoryUpdateOpFromItem(resolved);

    expect(op.target_id).toBe("ticket_midi");
    expect(op.after).toMatchObject({
      entity_type: "artifact",
      name: "四年前迷笛音乐节门票",
    });
    expect((op.after as { attributes?: Record<string, unknown> }).attributes?.__review).toBeUndefined();
  });

  it("选择仍创建新实体时只移除阻断 marker", () => {
    const resolved = resolveDuplicateReviewForCreate(duplicateItem);
    const op = buildMemoryUpdateOpFromItem(resolved);

    expect(op.target_id).toBe("new-ticket");
    expect((op.after as { attributes?: Record<string, unknown> }).attributes?.__review).toBeUndefined();
  });
});
