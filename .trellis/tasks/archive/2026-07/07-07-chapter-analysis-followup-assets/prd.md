# 章节分析后续资产注入

## 目标

让章节分析产生的 `followup_assets` 按语义类型选择性沉淀为可注入记忆，使后续章节生成能可靠承接连续性事实、下一章必做事项和未来伏笔，同时保持质量评审意见与写作上下文的边界清晰。

## 背景与已确认事实

- 当前章节分析成功后会保存 `PlotAnalysis` 快照，并通过 `apply_chapter_analysis` 把部分分析字段写入 `StoryMemory`。
- 当前已写入 `StoryMemory` 的分析字段包括 `chapter_summary`、`hooks`、`plot_points`、`foreshadows`，以及代码支持的 `character_states`。
- 当前 `finalization`、`blocking_issues`、`optional_improvements`、`polish_suggestions`、`followup_assets`、`planning_notes`、`overall_notes` 不会进入后续章节生成。
- 当前写作页默认开启记忆注入，默认开启 `story_memory`，默认关闭 `semantic_history` 和 `foreshadow_open_loops`。
- `StoryMemory.memory_type` 不是严格枚举；项目包导出导入已保留 `memory_type` 和 `metadata_json`。
- 用户已确认：`followup_assets` 不应整体无脑注入，应按标准类型和生命周期选择性沉淀。

## 需求

### R1 分析契约标准化

- `followup_assets.type` 使用受控类型：
  - `continuity_fact`
  - `next_chapter_requirement`
  - `future_payoff`
  - `author_note`
  - `optional_idea`
- 未知、空值或旧模型自由文本类型必须保留在分析快照中，但不得自动写入 `StoryMemory`。
- 不可注入类型 `author_note`、`optional_idea` 只用于展示，不写入 `StoryMemory`。

### R2 后续资产沉淀规则

- `continuity_fact` 写入 `StoryMemory(memory_type="continuity_fact")`，作为普通长期连续性事实进入普通 `story_memory` 注入和检索。
- `next_chapter_requirement` 写入 `StoryMemory(memory_type="next_requirement")`，由后端生成目标章节元数据：
  - `metadata.source = "chapter_analysis.followup_assets"`
  - `metadata.asset_type = "next_chapter_requirement"`
  - `metadata.target_chapter_number = 当前章节号 + 1`
  - `metadata.lifecycle = "next_chapter_only"`
- `future_payoff` 写入 `StoryMemory(memory_type="foreshadow")`，并设置 `is_foreshadow=1`、`foreshadow_resolved_at_chapter_id=NULL`，复用未回收伏笔机制。
- 不设置固定条数上限；通过类型白名单、内容长度裁剪、重要度和现有 prompt budget 控制注入规模。
- 新增 `continuity_fact` 和 `next_requirement` 必须纳入章节分析受管记忆范围；重新分析同一章节时删除并重建。

### R3 下一章要求专用注入区块

- 新增 `next_requirements` 记忆区块，用于章节生成 prompt 中的 `<NextChapterRequirements>`。
- `next_requirement` 只进入专用区块，不进入普通 `story_memory` 区块，避免重复放大权重。
- `next_requirements` 只注入满足以下条件的记忆：
  - `memory_type = "next_requirement"`
  - 作用域匹配当前项目/大纲规则
  - `metadata.target_chapter_number == 当前生成章节号`
- `NextChapterRequirements` 在总记忆注入开启时默认启用，不放入高级模块单独开关。
- 不自动续期；如果下一章未满足要求，由下一章分析重新生成新的资产。

### R4 兼容与可观察性

- 前端上下文预览和 prompt inspector 需要显示 `next_requirements`。
- 前端记忆类型中文显示补充 `continuity_fact` 和 `next_requirement`，未知类型仍可原样显示。
- 项目包导出再导入后，`next_requirement` 的 `metadata_json` 应保留，并仍只注入目标章节。
- `chapter_rewrite` 默认仍只处理 `blocking_issues`，不把 `followup_assets` 塞入当前章重写。

### R5 项目规范沉淀

- 将章节分析字段分层和后续资产注入规则更新到项目规范，避免后续改动破坏边界。

## 非目标

- 不新增独立数据库表。
- 不为 `continuity_fact` 单独创建 prompt 区块。
- 不修改“按建议重写”默认策略。
- 不做复杂 NLP 语义猜测；后端只做类型白名单和结构性防护。

## 验收标准

- [ ] 章节分析输出 `followup_assets.type="continuity_fact"` 后，会创建 `StoryMemory.memory_type="continuity_fact"`，并进入普通 `story_memory` 注入。
- [ ] 章节分析输出 `followup_assets.type="next_chapter_requirement"` 后，会创建 `StoryMemory.memory_type="next_requirement"`，并带有目标章节元数据。
- [ ] 生成目标下一章时，匹配的 `next_requirement` 只出现在 `NextChapterRequirements` 区块，不出现在普通 `StoryMemory` 区块。
- [ ] 生成非目标章节时，旧的 `next_requirement` 不注入。
- [ ] 章节分析输出 `followup_assets.type="future_payoff"` 后，会创建未回收伏笔型 `StoryMemory`。
- [ ] 未知或不可注入的 `followup_assets.type` 不写入 `StoryMemory`，但分析快照仍保留原始内容。
- [ ] 重新分析同一章不会残留旧的 `continuity_fact` 或 `next_requirement`。
- [ ] 项目包导出导入保留 `next_requirement.metadata_json`，导入后仍按目标章节注入。
- [ ] 前端上下文预览可看到 `next_requirements` 区块和对应调试信息。
- [ ] 相关后端单测通过，前端 lint 通过。
