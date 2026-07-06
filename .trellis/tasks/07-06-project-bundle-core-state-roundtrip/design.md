# 技术设计

## Approach

推荐采用向后兼容扩展 `project_bundle_v1` 的方式：在现有 `chapters` 条目中增加可选 `active_version_id`，并新增顶层 `chapter_versions` section。继续保持根 schema 为 `project_bundle_v1`，因为现有导入端已经按缺失 section 兼容空列表处理，新字段不会破坏旧包导入。

备选方案是把版本嵌套到每个 chapter 下。它可读性强，但导入时仍需要跨章节维护版本 ID 映射，且会让章节条目承担更多历史数据。顶层 section 与现有 `structured_memory`、`story_memory`、`project_tables` 的导出风格更一致。

## Data Contract

新增导出结构：

```json
{
  "chapters": [
    {
      "id": "old_chapter_id",
      "outline_id": "old_outline_id",
      "active_version_id": "old_version_id"
    }
  ],
  "chapter_versions": {
    "schema_version": "chapter_versions_export_v1",
    "versions": [
      {
        "id": "old_version_id",
        "chapter_id": "old_chapter_id",
        "source": "ai_generate",
        "content_md": "...",
        "word_count": 123,
        "generation_run_id": "old_run_id",
        "provider": "openai",
        "model": "gpt-4o-mini",
        "meta_json": "{}",
        "created_at": "2026-..."
      }
    ]
  }
}
```

`story_memory.memories` 增加 `scope` 和 `outline_id`。导入时 `chapter_id`、`outline_id`、`foreshadow_resolved_at_chapter_id` 都通过旧 ID 到新 ID 的映射恢复。

## Import Flow

1. 创建项目、设置、LLM 配置和大纲，得到 `outline_id_map`。
2. 创建章节，得到 `chapter_id_map`；章节初始可以不设置 `active_version_id`。
3. 创建章节版本，得到 `chapter_version_id_map`。
4. 二次遍历章节 payload，把旧 `active_version_id` 映射到新版本 ID 后写回 `Chapter.active_version_id`。
5. 创建剧情记忆时规范化 `scope/outline_id`：
   - `scope=project` -> `outline_id=None`
   - `scope=outline` 且旧大纲可映射 -> `outline_id=<new_outline_id>`
   - `scope=outline` 但无法映射 -> `scope=unassigned`、`outline_id=None`
   - 其他值或缺失 -> `unassigned`

## Compatibility

- 旧包没有 `chapter_versions` 时，导入流程创建 0 个版本，章节 `active_version_id` 保持为空。
- 旧包 `story_memory` 没有 `scope/outline_id` 时，导入为 `unassigned`，保持现有默认兼容。
- `generation_run_id` 是旧项目运行历史引用；按需求保留字符串元数据，但不要求新项目存在对应 `generation_runs` 行。

## Risks

- `Chapter.active_version_id` 外键指向 `chapter_versions`，因此导入时不能在版本创建前写入该字段。
- SQLite roundtrip 测试启用了外键，能覆盖错误 flush 顺序。
- 导入时不能保留任何旧章节、大纲或版本 ID 作为新项目外键。

