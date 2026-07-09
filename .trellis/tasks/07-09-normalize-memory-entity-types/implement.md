# 规范化结构化记忆实体类型 - 实施计划

## Checklist

1. 梳理当前触碰文件
   - `backend/app/schemas/memory_update.py`
   - `backend/app/services/memory_update_service.py`
   - `backend/app/api/routes/memory.py`
   - `backend/app/resources/prompt_presets/memory_update_v1/templates/*.md`
   - `backend/tests/test_memory_update_v1_endpoints.py`
   - `backend/tests/test_structured_memory_restore_on_create.py`
   - `backend/tests/test_prompt_preset_resources.py`

2. 增加规范化单元
   - 新增或放置在 `memory_update_service.py` 附近的 helper，避免分散在路由层。
   - 规范化 entity/relation/event/foreshadow/evidence 的 `after`。
   - 规范化 `target_id`、`evidence_ids` 和可 trim 的引用字段。
   - 增加 artifact 同义类型规范化：`object/item/prop/物品/道具 -> artifact`。
   - 保持 schema fail-closed：不能修正的坏类型继续报 `VALIDATION_ERROR`。

3. 接入 propose
   - 在 `propose_chapter_memory_change_set` 每个 op schema validate 后、restore-on-create 前应用规范化。
   - entity aliases 使用规范化后的名称和 target_id。
   - relation 解析使用规范化后的 refs。

4. 改进 restore-on-create
   - entity 查找先按规范类型查。
   - 对 `character` 兼容查找历史同名 `person`。
   - 对 `artifact` 兼容查找历史同名 `object/item/prop`。
   - 唯一候选可复用；多候选仍拒绝或留给历史清理。

5. 增加疑似重复审批标记
   - 对不同名但同规范类型、高相似的 entity upsert 生成 `attributes.__review.duplicate_candidates`。
   - 初次 propose 允许保存 review marker；从前端重新 propose/apply 时如果 marker 未处理则拒绝。
   - MemoryUpdateDrawer 对带 marker 的 item 默认不勾选，展示候选，并支持“复用已有实体 / 仍创建新实体 / 放弃”。

6. 更新自动提议 prompt 配置
   - `memory_update_v1` contract 写明人物统一 `character` 和字段规范。
   - 写明物件统一 `artifact`，优先复用 `existing_entities[].id`。
   - user template 增加 `existing_entities` 块。
   - `auto_propose_chapter_memory_update` 渲染 values 时加入精简现有实体列表。

7. 历史数据清理能力
   - 增加脚本或服务函数支持 dry-run 和 apply。
   - 合并 `person` / `character` 同名实体时更新运行时引用。
   - 对当前 Docker 数据库先 dry-run，再按确认后的策略执行 apply。

8. 测试
   - 添加 propose 规范化测试。
   - 添加 restore-on-create 跨 `person` / `character` 复用测试。
   - 添加 artifact 类型规范化和不同名高相似候选标记测试。
   - 添加 MemoryUpdateDrawer 审批转换纯函数测试。
   - 添加字段规范化测试。
   - 添加 prompt resource 测试。

9. 图谱底座数据页轻量入口
   - 实体表选择两个实体时，批量操作中生成 Memory Update 草稿入口。
   - 本轮不直接在页面执行数据库合并。

10. 文档和项目记忆
   - 将新约定写入 `AGENTS.md` 的结构化记忆章节。
   - 如形成可复用后端契约，更新 `.trellis/spec/backend/database-guidelines.md`。

## Validation Commands

- `cd backend && .venv/bin/python -m unittest tests.test_memory_update_v1_endpoints`
- `cd backend && .venv/bin/python -m unittest tests.test_structured_memory_restore_on_create`
- `cd backend && .venv/bin/python -m unittest tests.test_prompt_preset_resources`
- `cd frontend && npm run lint`
- `cd frontend && npm test -- MemoryUpdateDrawerReview`

如 `.venv` 缺少依赖，改用 `python3 -m unittest ...` 并记录结果。全量 pytest 当前有 AGENTS.md 记录的既有阻塞，不作为本任务唯一完成标准。

## Rollback Points

- 规范化 helper 是主要回滚点；撤回后提议恢复旧行为。
- prompt resource 更新只影响新建/重置默认预设；已有项目自定义块不自动覆盖。
- 历史数据清理 apply 前必须先 dry-run，记录 entity id 映射；执行前建议导出受影响行。
