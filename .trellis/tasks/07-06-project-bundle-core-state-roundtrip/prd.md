# 修复项目包导入导出核心状态缺失

## Goal

项目包导出后再导入为新项目，应保留“可继续写作”的核心编辑状态：章节历史版本、章节当前激活版本、剧情记忆的作用域和所属大纲。导入后用户在新项目中继续写作、查看版本历史、使用按大纲过滤的剧情记忆时，语义应与原项目一致。

## Background

- 当前项目包契约是 `project_bundle_v1`，定位为迁移“可继续写作”的作品数据，不迁移运行历史、任务历史、搜索索引、向量索引、FractalMemory、PlotAnalysis、协作成员、用户偏好历史和任何 API Key 密文。
- 当前 `export_project_bundle()` 只导出 `chapters` 当前正文和元数据，没有查询或写出 `chapter_versions`。
- 当前 `import_project_bundle()` 只创建 `Chapter`，没有重建 `ChapterVersion`，也没有把章节的 `active_version_id` 映射到新版本。
- `StoryMemory` 模型包含 `scope` 和 `outline_id`，其中 `scope=outline` 必须对应当前项目的大纲 ID；当前项目包导出 `story_memory.memories` 时没有写出这两个字段，导入时也没有恢复。
- 当前 roundtrip 测试只断言主要实体数量，没有覆盖章节版本历史、激活版本和剧情记忆作用域。

## Requirements

- R1: 项目包导出必须包含每章所有 `ChapterVersion` 历史，至少保留 `id`、`chapter_id`、`source`、`content_md`、`word_count`、`generation_run_id`、`provider`、`model`、`meta_json`、`created_at`。
- R2: 项目包导出必须在 `chapters` 条目中保留旧章节的 `active_version_id`，用于导入时映射到新版本。
- R3: 项目包导入必须先创建章节，再创建对应章节版本，并把旧版本 ID 映射为新版本 ID。
- R4: 导入后章节的 `active_version_id` 必须指向导入后同章的对应新版本；如果旧激活版本不存在于包内或无法映射，应保持为空，不应引用旧项目 ID。
- R5: 项目包导出必须包含每条 `StoryMemory` 的 `scope` 和 `outline_id`。
- R6: 项目包导入必须把 `StoryMemory.chapter_id`、`StoryMemory.outline_id`、`foreshadow_resolved_at_chapter_id` 按新项目 ID 映射恢复。
- R7: `StoryMemory.scope` 导入时必须规范化为合法值：`project`、`outline`、`unassigned`。当 scope 为 `outline` 但旧 `outline_id` 无法映射时，应降级为 `unassigned` 且 `outline_id=None`，避免生成无效外键或污染当前大纲检索。
- R8: 继续保持敏感信息红线：项目包不能导出 API Key 密文，不引入运行历史、任务历史、搜索索引、向量索引、FractalMemory 或 PlotAnalysis。
- R9: 旧 `project_bundle_v1` 缺少新增章节版本或剧情记忆作用域字段时仍能导入，缺失 sections 按空列表/兼容默认处理。

## Acceptance Criteria

- [ ] AC1: 新增或更新 roundtrip 测试，种子项目包含一个章节、至少两个章节历史版本，并设置其中一个为 `active_version_id`；导入后新项目存在同数量版本，版本内容和元数据保留，章节 `active_version_id` 指向导入后的对应版本。
- [ ] AC2: roundtrip 测试覆盖 `StoryMemory(scope="outline", outline_id=<旧大纲>)`；导入后该记忆的 `scope` 仍为 `outline`，`outline_id` 指向新项目映射后的大纲 ID，`chapter_id` 指向新章节 ID。
- [ ] AC3: roundtrip 测试覆盖项目级或无归属剧情记忆，导入后不会被错误挂到大纲。
- [ ] AC4: 导入旧格式包时不报错，缺少 `chapter_versions`、`active_version_id`、`scope` 或 `outline_id` 的条目按兼容默认导入。
- [ ] AC5: 安全断言继续通过：导出包字符串中不包含 API Key 密文字段，也不包含明确排除的 FractalMemory / PlotAnalysis sections。
- [ ] AC6: 相关后端测试命令通过，至少包括 `cd backend && python -m pytest tests/test_project_bundle_roundtrip.py tests/test_project_bundle_routes.py`。

## Out Of Scope

- 不迁移 `generation_runs`、`ProjectTask`、搜索索引、向量索引、FractalMemory、PlotAnalysis。
- 不为旧包生成缺失章节历史版本；如果旧包没有 `chapter_versions`，只导入章节当前正文。
- 不修改前端项目包导入交互，除非后续实现发现摘要统计必须同步展示章节版本数量。

