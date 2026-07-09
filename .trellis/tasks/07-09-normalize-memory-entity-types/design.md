# 规范化结构化记忆实体类型 - 设计

## Problem

`memory_update_v1` 的结构化数据由 LLM 生成，当前后端只做 schema 级校验，没有统一业务枚举和字段形态。结果同一人物可被写成 `person:潘越` 和 `character:潘越`，而 relation 引用名称 `潘越` 时因同名歧义被 fail-closed 拒绝。

本任务目标不是放松 relation 校验，而是在提议进入 change_set 之前统一结构化数据，让可修正的模型漂移在边界被规范化，真正不可解析的数据仍被拒绝。

## Approaches

### A. 只改提示词

优点：改动小，能减少新错误。

缺点：不能修手工提议、旧 prompt preset、历史数据，也不能保证模型遵守。不是可靠边界。

### B. 只改数据库唯一约束

优点：能从表层阻止 `person:潘越` / `character:潘越` 共存。

缺点：破坏现有 `entity_type` 分类语义；迁移复杂，且不解决 relation_type/source_type 等其他漂移。

### C. 服务层规范化 + 提示词增强 + 历史清理

优点：把模型输出、手工提交和一键生成提议统一走同一边界；提示词降低错误率；历史清理解决当前阻塞数据；保留 relation fail-closed。

缺点：需要新增共享规范化函数、测试和一次性清理脚本/命令。

推荐 C。

## Normalization Contract

新增一个结构化记忆规范化入口，供 `propose_chapter_memory_change_set` 使用。自动提议 `/memory/propose/auto` 在解析 LLM 后仍构造 `MemoryUpdateV1Request`，最终同样进入该入口；手工 `/memory/propose` 也会走同一入口。

规范化范围：

- `entities.after.entity_type`
  - trim + lower。
  - `person`, `people`, `human`, `人物`, `角色` 统一为 `character`。
  - `object`, `item`, `prop`, `物品`, `道具` 统一为 `artifact`。
  - 空值统一为 `generic`。
  - 其他类型保留 lower 后的短字符串，避免误把 organization/location 等压成 character/artifact。
- `entities.after.name`
  - trim，空名仍由 schema 拒绝。
- `relations.after.relation_type`
  - trim + lower，空值为 `related_to`。
  - 非字母数字下划线/短横线的空白归一为 `_`；不过不做语义映射，避免改错关系含义。
- `events.after.event_type`
  - trim + lower，空值为 `event`。
- `evidence.after.source_type`
  - trim + lower，空值为 `unknown`。
- `foreshadows.after.resolved`
  - 接受 `true/false`、`0/1`、`resolved/unresolved` 等常见形态，落为 `0` 或 `1`。
- 通用 ID/名称字段
  - `target_id`、relation entity refs、chapter/source IDs 做 trim。
  - 空字符串按缺省处理，不把空字符串持久化为有效 ID。
- `attributes`
  - 只接受 JSON object。
  - 删除空 key；字符串值 trim。
  - 不做中英文 key 语义合并。

规范化应在保存 `MemoryChangeSetItem.after_json` 前完成，因此后续 apply 看到的是稳定数据。

## Restore-On-Create

实体复用逻辑改为先规范化 `entity_type`，再按 `project_id + normalized_entity_type + name` 查找未删除或软删除实体。

为兼容历史数据，查找 `character + name` 时还需要识别同名 `person` 历史实体：

- 如果只存在一个候选，则复用该 ID，并在 apply 时把它更新为 `character`。
- 如果存在多个同名同义候选，默认不猜；历史清理会先合并当前项目中的重复数据。

relation 名称解析仍保持现有原则：可解析到唯一实体才接受，否则 `VALIDATION_ERROR`。

## Duplicate Candidate Review

日常主流程仍是“生成提议 -> 查看提议 -> 应用提议 -> 保存数据库”。同名同义类型在服务层自动复用已有 ID，直接表现为更新提议；不同名但高相似的实体不静默自动合并，也不默认新增。

服务层在 `entities upsert` 保存 `MemoryChangeSetItem.after_json` 前执行候选检测：

- 候选范围：同项目未删除实体，规范化后 `entity_type` 与当前提议一致，名称不同。
- 初始启发式：名称存在明显共享片段，且摘要/属性中有足够重叠词。该规则用于提示，不用于自动写库。
- 命中候选后，在 `after.attributes.__review.duplicate_candidates` 写入候选证据，并设置 `duplicate_review_required=true`。
- 初次 propose 允许保存这种 review marker，供前端审批展示；如果用户未处理该 marker 又重新 propose/apply，服务层应拒绝，防止默认新增。

前端 `MemoryUpdateDrawer`：

- 含 `duplicate_review_required` 的 item 默认不勾选。
- 展示候选实体和证据。
- 用户可选择“复用已有实体”：把 `target_id` 改为候选 ID，去掉 review marker，作为更新提议进入 apply。
- 用户可选择“仍创建新实体”：去掉阻断 marker，保留新增。
- 用户可保持不勾选，放弃该条。

图谱底座数据页本轮只做轻量入口：实体表选择两个实体后，可打开 Memory Update 生成合并/更新草稿；不在该页直接改库。

## Prompt Configuration

更新资源化 `memory_update_v1`：

- contract 明确实体类型规范：人物输出 `character`，不要输出 `person`。
- contract 明确物件类型规范：有剧情意义的物件/证物/道具输出 `artifact`，不要输出 `object`。
- user 输入增加现有实体块，包含 `id/entity_type/name/summary_md` 的精简列表。
- 提示模型优先复用 `existing_entities[].id`，语义相同实体不要重建；不确定时在摘要里保留差异线索。
- 自动提议路由在渲染 prompt 前加载当前项目未删除实体，限制数量并按更新时间/名称稳定排序。

数据库中已存在的项目级 prompt preset 不会自动刷新资源默认块；本任务只更新资源和后端渲染值。需要用户在 Prompt Studio 重置默认预设/提示块时才会覆盖已有项目自定义内容。服务层规范化保证即使旧提示词仍存在，也不会继续落入 `person`。

## Historical Cleanup

新增一次性清理能力，优先作为后端脚本或服务函数，处理同项目同名 `person` / `character`：

1. 选择保留目标：优先 `character`，否则选择 `person` 并改为 `character`。
2. 将 `relations.from_entity_id/to_entity_id` 从被合并实体改到保留实体。
3. 将 `evidence.source_type='entity'` 且 `source_id=被合并实体` 改到保留实体。
4. 更新 `memory_change_set_items.before_json/after_json` 中直接可识别的 entity id 引用，作为审计一致性补强；若实现风险过高，可只处理运行时表并在脚本输出中记录未改审计 JSON。
5. 软删除或删除被合并实体。为避免唯一约束冲突，优先软删除并改名加后缀，或在确认无引用后硬删除。
6. 标记/同步搜索与向量索引，避免检索层继续显示旧实体。

当前 Docker 数据库至少清理 `潘越`、`阿南`、`林薇` 的 `person` / `character` 重复。

## Tests

重点测试：

- propose 中 `person` 被规范化为 `character`，并复用已有 `character`。
- propose 中 `object/item/prop` 被规范化为 `artifact`，并可复用同名历史物件。
- 自动提议解析出的 `person` 进入 change_set item 前已规范化。
- 自动提议解析出的不同名高相似物件会带 duplicate review marker，前端默认不应用。
- relation 使用新建 entity 名称时能解析到规范化 ID。
- 历史 `person` / `character` 重复清理后，relation 名称不再因同义类型歧义失败。
- 低风险字段规范化：relation/event/source/resolved/attributes。
- prompt resource 测试确保默认模板包含实体类型规范和 existing_entities 变量。

## Rollback

代码回滚即可恢复旧行为。历史清理脚本执行前应输出 dry-run 计划；实际执行后如果需要回滚，只能依赖数据库备份或清理脚本记录的映射，因此执行前需要明确备份当前 Docker volume 或至少导出受影响行。
