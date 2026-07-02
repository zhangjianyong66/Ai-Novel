import { describe, expect, it } from "vitest";

import {
  buildBatchTaskCenterHref,
  getChapterStatusActions,
  buildProjectTaskCenterHref,
  buildWritingTaskCenterHref,
  isChapterStatusActionDisabled,
  isSaveAndTriggerDisabled,
  pickFirstProjectTaskId,
} from "./writingPageModels";
import { buildChapterSavePayload } from "./writingUtils";

describe("writingPageModels", () => {
  it("picks the first non-empty task id", () => {
    expect(pickFirstProjectTaskId(null)).toBeNull();
    expect(pickFirstProjectTaskId({ a: null, b: "  ", c: "task-1" })).toBe("task-1");
  });

  it("keeps save-and-trigger enabled for already saved chapters", () => {
    expect(
      isSaveAndTriggerDisabled({
        loadingChapter: false,
        generating: false,
        saving: false,
        autoUpdatesTriggering: false,
      }),
    ).toBe(false);
    expect(
      isSaveAndTriggerDisabled({
        loadingChapter: false,
        generating: false,
        saving: true,
        autoUpdatesTriggering: false,
      }),
    ).toBe(true);
  });

  it("builds stable task center links", () => {
    expect(buildWritingTaskCenterHref("p1")).toBe("/projects/p1/tasks");
    expect(buildWritingTaskCenterHref("p1", "c1")).toBe("/projects/p1/tasks?chapterId=c1");
    expect(buildProjectTaskCenterHref("p1", "task-1")).toBe("/projects/p1/tasks?project_task_id=task-1");
    expect(buildBatchTaskCenterHref("p1", "task-1")).toBe("/projects/p1/tasks?project_task_id=task-1");
    expect(buildBatchTaskCenterHref("p1", null)).toBeNull();
  });

  it("builds save payload without chapter status", () => {
    expect(
      buildChapterSavePayload(
        {
          title: "第 1 章",
          plan: "原计划",
          content_md: "已定稿正文",
          summary: "原摘要",
        },
        {
          title: "第 1 章",
          plan: "原计划",
          content_md: "改动正文",
          summary: "原摘要",
        },
      ),
    ).toEqual({
      title: "第 1 章",
      plan: "原计划",
      content_md: "改动正文",
      summary: "原摘要",
    });
  });

  it("returns only legal chapter status actions for current status", () => {
    expect(getChapterStatusActions("planned")).toEqual([{ status: "drafting", label: "开始起草" }]);
    expect(getChapterStatusActions("drafting")).toEqual([
      { status: "planned", label: "标记为已规划" },
      { status: "done", label: "标记为定稿" },
    ]);
    expect(getChapterStatusActions("done")).toEqual([{ status: "drafting", label: "回退为起草中", confirm: true }]);
  });

  it("disables chapter status actions when content has unsaved changes", () => {
    expect(
      isChapterStatusActionDisabled({
        dirty: true,
        loadingChapter: false,
        saving: false,
        statusUpdating: false,
        activeChapterId: "c1",
      }),
    ).toBe(true);
    expect(
      isChapterStatusActionDisabled({
        dirty: false,
        loadingChapter: false,
        saving: false,
        statusUpdating: false,
        activeChapterId: "c1",
      }),
    ).toBe(false);
  });
});
