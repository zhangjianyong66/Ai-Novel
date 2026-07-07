# 实施计划

## 上下文

本任务为 inline Codex 工作流，不使用子代理。进入实现前读取 `trellis-before-dev`，并按后端/前端相关规范执行。

## 步骤

1. 更新后端章节分析契约与解析
   - 修改 `chapter_analyze_v1` contract 文案，明确 `followup_assets.type` 枚举和使用规则。
   - 确认 `output_parsers.py` 和 `validate_analysis_payload` 兼容标准类型与旧自由文本。

2. 更新 `plot_analysis_service`
   - 扩展 `_MANAGED_MEMORY_TYPES`，加入 `continuity_fact`、`next_requirement`。
   - 在 `extract_story_memory_seeds` 中映射可注入 `followup_assets`。
   - 为可注入资产写入来源、资产类型、生命周期和目标章节 metadata。
   - 对不可注入或未知类型跳过自动沉淀。

3. 更新记忆检索服务
   - 新增 `next_requirements` allowed section、预算和格式化函数。
   - 普通 `story_memory` 查询排除 `next_requirement`。
   - `next_requirements` 按当前生成章节号匹配 metadata。
   - `build_memory_retrieval_log_json` 增加 `next_requirements` 观测项。

4. 更新章节生成调用
   - 调整 `_prepare_chapter_memory_injection`，向 `retrieve_memory_context_pack` 传当前章节号。
   - 在 `memory_modules` 内部默认启用 `next_requirements`，但不要求前端传开关。

5. 更新 prompt preset 资源
   - `chapter_generate_v4/preset.json` 增加 `sys.memory.next_requirements` block。
   - 增加空模板文件 `templates/sys.memory.next_requirements.md`。

6. 更新前端类型和预览
   - `frontend/src/components/writing/types.ts` 增加 `next_requirements`。
   - `ContextPreviewDrawer` / `PromptInspectorDrawer` 展示 `next_requirements`。
   - 记忆类型中文映射补 `continuity_fact`、`next_requirement`。

7. 测试
   - 后端单测覆盖 `followup_assets` 三类可注入映射、未知类型跳过、受管重建。
   - 后端单测覆盖 `next_requirements` 只注入目标章节，且普通 `story_memory` 排除 `next_requirement`。
   - 项目包 roundtrip 测试覆盖 `next_requirement.metadata_json` 保留。
   - 前端 lint 验证。

8. 规范更新
   - 更新 `AGENTS.md` 和 `.trellis/spec/backend/chapter-auto-update-guidelines.md` 中的章节分析字段分层与注入规则。

## 验证命令

- `cd backend && python3 -m pytest tests/test_plot_analysis_apply.py tests/test_memory_retrieval_scope.py tests/test_project_bundle_roundtrip.py`
- `cd frontend && npm run lint`

## 回滚点

- 若 `next_requirements` section 影响范围过大，可先保留 `followup_assets` 映射和 `StoryMemory` 写入，暂时关闭 prompt preset block。
- 若前端预览改动引入类型问题，可先只更新类型和 prompt inspector，后续再补完整 UI 展示。
