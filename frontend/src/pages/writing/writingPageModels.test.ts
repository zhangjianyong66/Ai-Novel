import { describe, expect, it } from "vitest";

import {
  buildBatchTaskCenterHref,
  buildProjectTaskCenterHref,
  buildWritingTaskCenterHref,
  getChapterWorkflowState,
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

  it("builds the planned workflow without a direct finalize action", () => {
    const workflow = getChapterWorkflowState({
      status: "planned",
      dirty: false,
      hasNonEmptyContent: false,
      loadingChapter: false,
      generating: false,
      saving: false,
      statusUpdating: false,
      autoUpdatesTriggering: false,
      activeChapterId: "c1",
    });

    expect(workflow.writingStatusLabel).toBe("计划中");
    expect(workflow.memoryStatusLabel).toBe("不可更新");
    expect(workflow.primaryAction).toMatchObject({ id: "save_plan", label: "保存计划" });
    expect(workflow.secondaryAction).toBeNull();
    expect(workflow.moreActions.map((action) => action.id)).not.toContain("finalize");
  });

  it("builds the planned workflow as save draft when content exists", () => {
    const workflow = getChapterWorkflowState({
      status: "planned",
      dirty: true,
      hasNonEmptyContent: true,
      loadingChapter: false,
      generating: false,
      saving: false,
      statusUpdating: false,
      autoUpdatesTriggering: false,
      activeChapterId: "c1",
    });

    expect(workflow.primaryAction).toMatchObject({ id: "save_draft", label: "保存为草稿" });
    expect(workflow.dirtyLabel).toBe("未保存");
  });

  it("builds the drafting workflow with save-and-finalize and save-draft actions", () => {
    const dirtyWorkflow = getChapterWorkflowState({
      status: "drafting",
      dirty: true,
      hasNonEmptyContent: true,
      loadingChapter: false,
      generating: false,
      saving: false,
      statusUpdating: false,
      autoUpdatesTriggering: false,
      activeChapterId: "c1",
    });

    expect(dirtyWorkflow.primaryAction).toMatchObject({ id: "save_and_finalize", label: "保存并定稿" });
    expect(dirtyWorkflow.secondaryAction).toMatchObject({ id: "save_draft", label: "仅保存草稿" });

    const cleanWorkflow = getChapterWorkflowState({
      status: "drafting",
      dirty: false,
      hasNonEmptyContent: true,
      loadingChapter: false,
      generating: false,
      saving: false,
      statusUpdating: false,
      autoUpdatesTriggering: false,
      activeChapterId: "c1",
    });

    expect(cleanWorkflow.primaryAction).toMatchObject({ id: "finalize", label: "标记为定稿" });
    expect(cleanWorkflow.secondaryAction).toBeNull();
  });

  it("builds the done workflow with memory update as the primary action", () => {
    const workflow = getChapterWorkflowState({
      status: "done",
      dirty: false,
      hasNonEmptyContent: true,
      loadingChapter: false,
      generating: false,
      saving: false,
      statusUpdating: false,
      autoUpdatesTriggering: false,
      activeChapterId: "c1",
    });

    expect(workflow.memoryStatusLabel).toBe("待更新");
    expect(workflow.primaryAction).toMatchObject({ id: "update_memory", label: "更新记忆" });
    expect(workflow.secondaryAction).toMatchObject({ id: "reopen_draft", label: "退回草稿", confirm: true });
  });

  it("builds the done workflow with retry action after memory update failure", () => {
    const workflow = getChapterWorkflowState({
      status: "done",
      dirty: false,
      hasNonEmptyContent: true,
      loadingChapter: false,
      generating: false,
      saving: false,
      statusUpdating: false,
      autoUpdatesTriggering: false,
      activeChapterId: "c1",
      memoryUpdateFailed: true,
    });

    expect(workflow.memoryStatusLabel).toBe("更新失败");
    expect(workflow.primaryAction).toMatchObject({ id: "retry_memory_update", label: "重试更新记忆" });
  });

  it("marks workflow actions disabled while a request is in flight", () => {
    const workflow = getChapterWorkflowState({
      status: "drafting",
      dirty: true,
      hasNonEmptyContent: true,
      loadingChapter: false,
      generating: false,
      saving: true,
      statusUpdating: false,
      autoUpdatesTriggering: false,
      activeChapterId: "c1",
    });

    expect(workflow.primaryAction?.disabled).toBe(true);
    expect(workflow.primaryAction?.pendingLabel).toBe("保存中...");
  });
});
