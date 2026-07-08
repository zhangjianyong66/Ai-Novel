# 技术设计：修复写作页记忆更新状态

## Data Flow

当前链路：

`WritingPage action -> POST /chapters/{id}/trigger_auto_updates -> ProjectTask(plot_auto_update) -> plot_auto_update_v1 -> PlotAnalysis + StoryMemory`

缺失链路：

`ProjectTask/PlotAnalysis/StoryMemory -> API 状态摘要 -> WritingPage workflow model -> 记忆状态标签和按钮`

## Proposed Contract

新增或扩展一个章节级状态摘要，前端按章节详情加载时一并获取或按章节切换单独获取：

```json
{
  "memory_update_status": {
    "status": "unavailable | pending | updating | updated | failed",
    "task_id": "string | null",
    "task_status": "queued | running | succeeded | failed | canceled | null",
    "plot_analysis_id": "string | null",
    "apply_status": "success | empty | failed | pending | null",
    "last_updated_at": "ISO string | null",
    "error_message": "string | null"
  }
}
```

状态派生优先级：

1. 章节非 `done`：`unavailable`。
2. 最近的同章 `plot_auto_update` 为 `queued` 或 `running`：`updating`。
3. 最近的同章 `plot_auto_update` 为失败或取消，且没有更新的成功 `PlotAnalysis/StoryMemory` 覆盖：`failed`。
4. 该章存在未过期 `PlotAnalysis.apply_status in ("success", "empty")` 或该章存在由自动分析写入的 `StoryMemory`：`updated`。
5. 其他情况：`pending`。

已更新且章节内容未变化时，默认不把重跑作为主路径。UI 显示“已更新”，主操作让位给章节状态相关动作；“重新更新记忆”放入次要动作或更多动作。该动作必须显式强制新 token，避免复用旧的已成功 `plot_auto_update` 任务。

## Backend Boundary

- 优先在章节详情响应中增加状态摘要，避免写作页切章时额外请求；如果现有 schema 影响较大，可新增 `GET /api/chapters/{chapter_id}/memory_update_status`。
- 查询 `ProjectTask.params_json.chapter_id` 时需要使用数据库兼容写法。PostgreSQL 可用 JSONB 运算，SQLite 测试环境可能只有文本 JSON；实现应复用已有 JSON 解析模式或先取有限近期任务再在 Python 中过滤。
- 失败摘要必须脱敏，复用任务已有 `error_json` / `result_json` 中安全字段，不暴露 API key、base URL 凭据或完整上游错误。
- `POST /trigger_auto_updates` 需要支持显式 token 或 `force` 来服务“重新更新记忆”；默认调用保持既有幂等行为不变。

## Frontend Boundary

- `writingPageModels.ts` 增加 typed status 输入，不再用布尔 `memoryUpdateFailed` 表达全部状态。
- 写作页 hook 在章节加载、触发任务成功、任务事件更新后刷新该状态摘要。
- 如果采用任务 SSE，复用 `useProjectTaskEvents`，只监听当前项目并过滤 `kind === "plot_auto_update"` 和当前章节。
- UI 文案保持短标签：`不可更新`、`待更新`、`更新中`、`已更新`、`更新失败`。

## Compatibility

- 现有 `POST /trigger_auto_updates` 默认行为保持兼容。
- 草稿章节继续只调度索引重建，不参与剧情记忆状态更新。
- 旧数据没有 `PlotAnalysis` 或 `StoryMemory` 时显示“待更新”。
- 已有成功 `StoryMemory` 但缺少任务记录的历史章节，可显示“已更新”，避免老项目误导用户。

## Trade-offs

- 只看最近任务实现简单，但历史成功后又有一次失败会显示失败；这符合“最近一次更新尝试失败”的恢复语义。
- 只看 `StoryMemory` 会漏掉正在运行和失败状态；因此任务状态必须参与派生。
- 强制重跑会增加 LLM 成本，因此只作为明确的“重新更新记忆”动作或失败恢复动作，不作为“已更新”状态下的主按钮。
