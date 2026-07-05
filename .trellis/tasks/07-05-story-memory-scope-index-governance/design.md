# 剧情记忆作用域与索引治理设计

## 架构边界

本次改动跨越数据库、记忆检索、搜索索引、向量索引、章节生成和前端剧情记忆管理页。源数据仍以 `story_memories` 为准，`search_documents` 和 `vector_chunks` 只作为派生索引；用户治理操作只修改源记忆，索引由后端同步维护。

## 数据模型

`story_memories` 新增：

- `scope VARCHAR(32) NOT NULL DEFAULT 'unassigned'`
- `outline_id VARCHAR(36) NULL REFERENCES outlines(id) ON DELETE SET NULL`

合法组合：

- `scope='outline'`：`outline_id` 必须非空且属于同一项目。
- `scope='project'`：`outline_id` 必须为空。
- `scope='unassigned'`：`outline_id` 必须为空。

迁移回填：

```sql
-- 概念规则，实际迁移需兼容 SQLite/Postgres
UPDATE story_memories
SET scope='outline', outline_id=chapters.outline_id
FROM chapters
WHERE story_memories.chapter_id = chapters.id
  AND chapters.outline_id IS NOT NULL;

UPDATE story_memories
SET scope='unassigned', outline_id=NULL
WHERE outline_id IS NULL AND scope IS NULL/默认态;
```

ORM 输出和 API schema 增加 `scope`、`outline_id`、`injectable_for_current_outline` 或等价派生字段。

## 生成过滤规则

后端引入共享过滤条件，避免多处重复：

```python
def story_memory_scope_filter(*, project_id: str, outline_id: str | None):
    allowed = [StoryMemory.project_id == project_id, StoryMemory.scope == "project"]
    if outline_id:
        allowed.append(and_(StoryMemory.scope == "outline", StoryMemory.outline_id == outline_id))
    return and_(StoryMemory.project_id == project_id, or_(*allowed_scope_terms))
```

调用点：

- `memory_retrieval_service.retrieve_memory_context_pack`
- `vector_rag_service.build_project_chunks`
- `vector_rag_service.query_project` / Postgres 查询层
- `search_index_service.build_project_search_documents`
- 伏笔 open loops 查询
- 前端上下文预览和生成历史 debug 展示依赖后端返回的过滤结果

注意：`query_project` 当前只知道 `project_id`、`sources`、`query_text`，需要扩展可选 `outline_id` / `scope_filter`，由章节生成和 RAG 页面传入。

## 索引一致性

删除顺序固定：

1. 删除 `search_documents` 中 `source_type='story_memory' AND source_id=:id`。
2. 删除 Postgres `vector_chunks` 中 `source='story_memory' AND source_id=:id`。
3. 删除 `story_memories.id=:id`。

在同一个数据库 session/事务内完成。任何一步失败，事务回滚，源记录保留。

新增服务函数建议放在 `backend/app/services/story_memory_index_service.py`：

- `delete_story_memory_indexes(db, project_id, story_memory_ids) -> dict`
- `upsert_story_memory_search_document(db, story_memory)`
- `delete_story_memory_vector_chunks(db, project_id, story_memory_ids)`
- `sync_story_memory_index_metadata(db, story_memory)`

修改内容时：

- 搜索索引用单条 upsert。
- 向量索引需要局部 embedding。若当前 embedding 不可用，源内容更新应失败或进入明确“索引不可同步”错误，本次按用户确认优先一致性处理：失败则不改源内容。

修改作用域/大纲归属时：

- 搜索索引 locator/metadata 同步更新。
- `vector_chunks.metadata_json`、`source_id` 不变，但 metadata 中的 `scope`、`outline_id` 要同步。

## 前端管理页

扩展现有「剧情记忆」页：

- 顶部筛选：关键词、类型、作用域、所属大纲、章节来源、注入状态。
- 列表字段：标题、类型、内容预览、作用域、大纲/章节、更新时间、是否会注入当前大纲。
- 操作：编辑、删除、合并、标记完成、设为当前大纲、设为项目全局、移入未归属、批量删除/批量设作用域。

前端 service `storyMemoryApi.ts` 增加：

- `scope`
- `outline_id`
- 查询参数
- 批量操作 API 封装

## API 契约

扩展现有路由优先：

- `GET /projects/{project_id}/story_memories` 增加查询参数：`scope`、`outline_id`、`q`、`memory_type`、`injectable_for_outline_id`。
- `POST/PUT /story_memories` 支持 `scope`、`outline_id`。
- 新增批量操作：`POST /projects/{project_id}/story_memories/bulk`，支持 `delete` 和 `set_scope`。

删除响应返回：

```json
{
  "deleted_ids": ["..."],
  "index_deletes": {
    "search_documents": 1,
    "vector_chunks": 3
  }
}
```

## 兼容和回滚

- 迁移后旧 `chapter_id=NULL` 记忆不会丢失，只变成 `unassigned`。
- 用户可在页面恢复其业务作用域。
- 若发现过滤过严，用户可把特定记忆设为 `project`。
- 回滚代码时新增字段留存不影响旧代码读取，但旧代码可能再次按项目级注入；因此发布后不建议回退到无过滤版本。

## 测试重点

- 迁移回填。
- 生成/预览过滤。
- StoryMemory 删除时定点删除索引，且不调度全量 vector rebuild。
- 索引删除失败时源记录保留。
- 前端筛选和作用域显示。
