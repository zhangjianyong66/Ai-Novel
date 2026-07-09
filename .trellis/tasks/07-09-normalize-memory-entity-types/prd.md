# 规范化结构化记忆实体类型

## Goal

避免结构化记忆中同一人物因为 `entity_type` 不一致被拆成多条实体，例如同一项目同时出现 `person:潘越` 和 `character:潘越`，导致关系提议无法按名称消歧并返回 `关系引用的实体不存在 (VALIDATION_ERROR)`。

本任务要同时解决配置层和服务层问题：

- 配置层：memory_update 提示词应给模型足够的现有实体 ID / 类型规范，减少模型输出模糊名称或错误类型。
- 服务层：后端在一键生成提议和手工提议的 propose/apply 边界对结构化数据做统一规范化，避免 `person` / `character` 这类同义类型和其他字段漂移继续制造重复实体或不可解析引用。
- 数据层：为当前项目里的既有重复人物实体提供可控清理策略，至少修复当前阻塞提议的重复数据。

## Confirmed Facts

- 失败请求 `e5152b59-8d0a-49da-91c0-930f00f53116` 是 `POST /api/chapters/79daf4d8-c746-44ce-b06b-28a4c13f6da6/memory/propose/auto`，章节为第 2 章《鼓面余震》。
- LLM 调用已成功返回，后端在 `propose_chapter_memory_change_set` 解析 relation 时拒绝，错误来自 [memory_update_service.py](/home/zhangjianyong/project/Ai-Novel/backend/app/services/memory_update_service.py:482)。
- 本次 LLM 输出的 relation 使用了中文名作为引用，例如 `from_entity_id="阿南"`, `to_entity_id="潘越"`。
- 当前项目中未删除实体存在同名不同类型：
  - `pan_yue` / `person` / `潘越`，创建于 2026-07-07 20:25:12，来源 change_set `efb99bdc-7dc4-419d-a233-ed90ad4046c8`。
  - `411d957d-0ad8-45f7-a125-d2da97dbfd5d` / `character` / `潘越`，创建于 2026-07-08 20:50:51，来源 change_set `fbd2c109-fe39-4315-9443-a75f6f4a85e9`。
- `entities` 表唯一索引是 `project_id + entity_type + name`，因此 `person:潘越` 和 `character:潘越` 可以共存。
- restore-on-create 当前只按 `project_id + entity_type + name` 复用实体；`character + 潘越` 不会复用已有 `person + 潘越`。
- 资源化 `memory_update_v1` 预设的用户输入模板 [user.memory_update.inputs.md](/home/zhangjianyong/project/Ai-Novel/backend/app/resources/prompt_presets/memory_update_v1/templates/user.memory_update.inputs.md:1) 当前只提供章节信息，没有提供 `existing_entities`。
- 资源化 `memory_update_v1` 契约 [sys.memory_update.contract.json.md](/home/zhangjianyong/project/Ai-Novel/backend/app/resources/prompt_presets/memory_update_v1/templates/sys.memory_update.contract.json.md:23) 只描述 `entity_type` 字段，没有给出规范类型集合或 `person` / `character` 映射规则。
- 用户已决定：一键生成提议产出的结构化数据要统一处理，小说人物统一为 `character`；其他结构化字段也需要统一化，避免类似数据类型混乱。

## Requirements

- R1：为结构化记忆实体定义后端规范化规则，小说人物统一落到 `character`，并至少覆盖 `person -> character`。
- R2：`POST /api/chapters/{chapter_id}/memory/propose` 和 `/memory/propose/auto` 都必须应用同一套实体类型规范化规则；不能只修自动提议路径。
- R3：restore-on-create 必须能在规范化后复用已有实体，避免同名人物因历史类型差异继续创建新 ID。
- R4：relation 引用解析仍应保持 fail-closed：如果名称在规范化后仍不能唯一解析，不应猜测目标实体。
- R5：`memory_update_v1` 资源提示词必须明确实体类型规范，并给模型可用的现有实体 ID / 名称 / 类型上下文，降低输出模糊名称的概率。
- R6：历史数据清理必须保留关系、事件、证据、搜索索引、向量索引等引用一致性；不能只删除一条实体记录造成外键或孤儿数据。
- R7：当前项目至少应能消除 `潘越`、`阿南`、`林薇` 这类同名 `person` / `character` 歧义，使第 2 章自动记忆提议不再因为这些名称报 `unresolved_relation_entity_ref`。
- R8：新增或更新测试覆盖配置输出、服务层规范化、历史重复实体复用/合并和 relation 引用解析。
- R9：一键生成提议的结构化数据字段要统一化；优先覆盖会影响唯一性、索引、引用、筛选和后续注入的字段，包括 `entity_type`、`relation_type`、`event_type`、`evidence.source_type`、`foreshadows.resolved`、ID/名称首尾空白。
- R10：字段统一化应在服务层形成单一入口，资源提示词只作为前置约束，不能依赖模型自觉遵守。
- R11：`attributes` 本轮只做低风险结构清理：必须是 JSON object，去掉空 key，字符串值做首尾空白清理；不做任意中英文 key 的语义合并。
- R12：有剧情意义的物件、证物、道具类结构化实体统一落到 `artifact`，至少覆盖 `object`、`item`、`prop`、`物品`、`道具` -> `artifact`，避免同一物件因类型漂移被拆分。
- R13：不同名但疑似重复的实体不得在日常 propose/apply 主流程自动合并；只能进入 dry-run 候选，由人工确认后通过清理流程 apply。
- R14：候选合并选择保留实体时优先保留 canonical 类型实体；若多个候选都是 canonical，再按更新时间较新、引用/关系更多等确定性规则选择。
- R15：记忆更新主流程应保持“生成提议 -> 查看提议 -> 应用提议 -> 保存数据库”。当生成结果疑似指向已有结构化实体时，应优先把新增实体提议改写为对已有实体的更新提议，而不是新增重复实体；该处理可以由 prompt 中的现有实体上下文约束和 propose 后服务层校验/匹配共同完成。
- R16：不同名但高相似的疑似重复实体应在提议查看/审批阶段提示用户选择处理方式；后端不得静默自动改写为更新，也不得默认新增重复实体。
- R17：疑似重复项在审批界面默认不应用；用户必须显式选择“复用已有实体”或“仍创建新实体”后，该条才可进入 apply。

## Acceptance Criteria

- [ ] 后端测试证明 `entity_type="person"` 的人物提议会规范化为约定类型，并复用同名既有人物实体。
- [ ] 后端测试证明一键生成提议产出的 `entity_type="person"` 会规范化为 `character` 后再保存为 change_set item。
- [ ] 后端测试证明同一批 ops 中 relation 使用新建人物名称时仍可解析到规范化后的目标 ID。
- [ ] 后端测试证明历史存在 `person:潘越` 和 `character:潘越` 时，清理/迁移后 relation 名称 `潘越` 不再因这两个同义类型歧义失败。
- [ ] 后端测试证明 `object/item/prop/物品/道具` 类物件提议会规范化为 `artifact`，并可复用历史同名同义类型实体。
- [ ] 清理能力能对不同名但高度相似的同义类型实体输出 dry-run 候选证据；默认不写库、不自动合并。
- [ ] 自动记忆提议在能明确匹配已有实体时，生成的 change_set item 应表现为更新已有实体（target_id 指向已有 ID），而不是新增重复实体。
- [ ] 自动记忆提议遇到不同名高相似候选时，前端审批界面应展示疑似重复证据，并允许用户选择复用已有实体、仍创建新实体或放弃该条。
- [ ] 后端测试覆盖 `relation_type`、`event_type`、`evidence.source_type`、`foreshadows.resolved` 和 ID/名称空白的统一化行为。
- [ ] `memory_update_v1` 默认资源提示词包含实体类型规范和现有实体 ID 上下文；相关 prompt resource 测试更新。
- [ ] 对当前 Docker 数据库执行清理后，`entities` 中不再同时存在同项目同名的 `person` 与 `character` 人物实体。
- [ ] 相关后端测试可通过；若全量测试受既有问题阻塞，记录具体阻塞项并运行本任务触碰范围测试。

## Notes

- 当前任务是复杂任务，需要 `design.md` 和 `implement.md` 后才能 `task.py start`。
- 当前讨论使用 `$grill-me`：每次只问一个仍需产品/风险决策的问题；能从仓库确认的事实不问用户。
- 已确认：小说人物规范类型统一为 `character`；其他字段统一化限定为低风险字段，`attributes` 不做语义归一。
- 已确认：结构化记忆中的物件类实体统一为 `artifact`；`object/item/prop/物品/道具` 视为同义类型。
- 已确认：不同名但疑似重复的实体只进入 dry-run 候选，不在日常提议流程自动合并。
- 已确认：候选合并时优先保留 canonical 类型实体；若多个都是 canonical，再按确定性规则选择。
- 已确认：核心用户流程仍是生成提议、查看提议、应用提议、保存数据库；疑似已有数据应尽量在提议阶段转成更新已有实体，而不是落成新增重复实体后再依赖事后清理。
- 已确认：不同名高相似实体在提议审批阶段处理，由用户选择；后端不静默自动改写。
- 已确认：疑似重复项默认不应用，必须人工选择后才能 apply。
