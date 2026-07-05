import { describe, expect, it } from "vitest";

import type { Outline, OutlineListItem } from "../../types";

import { buildSavedOutlineSyncState } from "./outlineSavedOutlineSync";

const baseOutline = {
  id: "o1",
  project_id: "p1",
  title: "旧大纲",
  content_md: "# 旧大纲",
  structure: { chapters: [{ number: 1, title: "旧章", beats: [] }] },
  created_at: "2026-07-05T08:00:00Z",
  updated_at: "2026-07-05T08:00:00Z",
} satisfies Outline;

const savedOutline = {
  id: "o2",
  project_id: "p1",
  title: "AI 大纲 2026-07-05 16:30",
  content_md: "# 新大纲",
  structure: { chapters: [{ number: 1, title: "新章", beats: ["开场"] }] },
  created_at: "2026-07-05T08:30:00Z",
  updated_at: "2026-07-05T08:30:00Z",
} satisfies Outline;

const outlineList = [
  {
    id: "o1",
    title: "旧大纲",
    created_at: "2026-07-05T08:00:00Z",
    updated_at: "2026-07-05T08:00:00Z",
    has_chapters: true,
  },
] satisfies OutlineListItem[];

describe("buildSavedOutlineSyncState", () => {
  it("switches page state to the backend saved outline and adds it to the list", () => {
    const next = buildSavedOutlineSyncState({
      outlines: outlineList,
      activeOutline: baseOutline,
      content: "# 旧大纲本地未保存",
      savedOutline,
    });

    expect(next.activeOutline.id).toBe("o2");
    expect(next.content).toBe("# 新大纲");
    expect(next.baseline).toBe("# 新大纲");
    expect(next.outlines.map((outline) => outline.id)).toEqual(["o2", "o1"]);
    expect(next.outlines[0]).toMatchObject({
      id: "o2",
      title: "AI 大纲 2026-07-05 16:30",
      has_chapters: false,
    });
  });

  it("updates an existing list item instead of duplicating the saved outline", () => {
    const next = buildSavedOutlineSyncState({
      outlines: [
        ...outlineList,
        {
          id: "o2",
          title: "旧标题",
          created_at: "2026-07-05T08:20:00Z",
          updated_at: "2026-07-05T08:20:00Z",
          has_chapters: true,
        },
      ],
      activeOutline: baseOutline,
      content: "# 旧大纲",
      savedOutline,
    });

    expect(next.outlines.filter((outline) => outline.id === "o2")).toHaveLength(1);
    expect(next.outlines[0]).toMatchObject({
      id: "o2",
      title: "AI 大纲 2026-07-05 16:30",
      has_chapters: true,
    });
  });
});
