# 技术设计

## 边界

本任务沿用现有 `StoryMemory` 和记忆注入架构，不新增数据库表。章节分析仍先保存 `PlotAnalysis` 快照，再把可注入分析资产转成受管 `StoryMemory`。章节生成仍通过 `retrieve_memory_context_pack` 组装上下文，并由 prompt preset 的 `marker_key` 注入。

## 数据契约

### followup_assets

章节分析 contract 中 `followup_assets` 的 item 继续保持：

```json
{"type": "string", "title": "string", "note": "string"}
```

但提示词和后端语义只接受以下标准类型：

- `continuity_fact`
- `next_chapter_requirement`
- `future_payoff`
- `author_note`
- `optional_idea`

后端不因未知类型拒绝整个分析，避免旧数据和模型偏差导致分析失败；未知类型只不参与自动沉淀。

### StoryMemory 映射

`continuity_fact`：

```json
{
  "memory_type": "continuity_fact",
  "is_foreshadow": 0,
  "importance_score": 0.7,
  "metadata": {
    "source": "chapter_analysis.followup_assets",
    "asset_type": "continuity_fact"
  }
}
```

`next_chapter_requirement`：

```json
{
  "memory_type": "next_requirement",
  "is_foreshadow": 0,
  "importance_score": 0.9,
  "metadata": {
    "source": "chapter_analysis.followup_assets",
    "asset_type": "next_chapter_requirement",
    "target_chapter_number": 12,
    "lifecycle": "next_chapter_only"
  }
}
```

`future_payoff`：

```json
{
  "memory_type": "foreshadow",
  "is_foreshadow": 1,
  "importance_score": 0.8,
  "metadata": {
    "source": "chapter_analysis.followup_assets",
    "asset_type": "future_payoff"
  }
}
```

## 生成注入设计

`retrieve_memory_context_pack` 新增 `next_requirements` section：

- 默认启用由章节生成端控制，属于总记忆注入的一部分。
- 查询 `StoryMemory.memory_type == "next_requirement"`。
- 使用同一大纲/项目 scope 规则。
- 解析 `metadata_json.target_chapter_number`，仅保留等于当前生成章节号的记录。
- 输出 `text_md` 包装为：

```text
<NextChapterRequirements>
### 标题
内容
</NextChapterRequirements>
```

普通 `story_memory` section 排除 `memory_type="next_requirement"`，避免重复注入。

`ChapterGenerateRequest.memory_modules` 不需要暴露 `next_requirements` 给用户；后端在记忆注入开启时默认启用该 section。上下文预览可显示该 section，但不需要新增可关闭开关。

## Prompt Preset

`chapter_generate_v4` 新增一个启用的 system block：

- `identifier = "sys.memory.next_requirements"`
- `marker_key = "memory.next_requirements.text_md"`
- `injection_order` 放在普通 `story_memory` 附近，建议位于 `story_memory` 之前或之后，保持与记忆模块聚合。
- 模板文件可为空，依赖 marker 直接注入。

## 前端

- `MemoryContextPack` 类型增加 `next_requirements`。
- 上下文预览和 prompt inspector 的 section 列表增加 `next_requirements`。
- 记忆类型显示补 `continuity_fact`、`next_requirement` 的中文名称。
- 生成请求无需新增 `memory_modules.next_requirements` 字段。

## 导入导出

现有项目包导出导入已保留 `StoryMemory.metadata_json` 和 `memory_type`。本任务增加回归测试，覆盖 `next_requirement` 导出导入后仍按 `metadata.target_chapter_number` 过滤。

## 风险与取舍

- 不限制 `followup_assets` 固定条数，避免长章节误删有效资产；注入规模依赖内容裁剪、重要度排序和 prompt budget。
- 未知 `type` 不注入而不是报错，兼容旧模型输出；代价是用户可能需要在分析提示词中明确标准类型才能获得自动沉淀。
- `next_requirement` 单独区块增加 prompt 结构复杂度，但能避免把“必须承接事项”混成普通背景事实。
