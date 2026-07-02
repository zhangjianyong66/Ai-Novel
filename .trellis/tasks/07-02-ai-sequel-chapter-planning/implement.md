# AI 生成用户指令历史与默认选项实施计划

## Scope

本轮只实现单章 AI 生成抽屉里的「生成」和「追加生成」用户指令历史保存与默认选项。批量生成不纳入。

## Checklist

- [x] 后端 RED：新增测试覆盖章节生成用户指令偏好的保存、读取、去重、最近使用排序、项目/用户隔离、viewer 只读 editor 可写。
- [x] 后端 GREEN：新增模型、schema、service、route，并在 `chapters.py` 暴露接口。
- [x] 迁移：新增 Alembic migration 创建 `project_chapter_generation_instruction_preferences`。
- [x] 前端 RED：新增模型/工具测试，覆盖默认指令与历史指令合并、去重、排序。
- [x] 前端 GREEN：新增默认指令常量和合并函数。
- [x] 前端集成：`useChapterGeneration` 加载历史，单章生成请求开始后保存非空指令，失败不阻断生成。
- [x] 前端 UI：`AiGenerateDrawer` 增加“套用用户指令”选择控件，选择后写入 textarea。
- [x] 验证：运行后端相关测试、前端相关测试；必要时运行更大范围质量检查。

## Validation Commands

建议按 TDD 顺序执行：

```bash
cd backend && pytest tests/test_chapter_generation_instruction_preferences.py
```

```bash
cd frontend && npm test -- --run src/pages/writing/chapterGenerationInstructionOptions.test.ts
```

实现完成后补充：

```bash
cd backend && pytest tests/test_chapter_generation_instruction_preferences.py tests/test_outline_generation_preferences.py
```

```bash
cd frontend && npm test -- --run src/pages/writing/chapterGenerationInstructionOptions.test.ts
```

## Risk Points

- Alembic 当前 head 为 `5d6c1e7a2b4f`，新增迁移应基于该 head，避免产生意外多头。
- 章节路由文件较大，新增偏好接口应保持在项目级路由附近，避免混入章节生成核心逻辑。
- 保存历史必须在单章生成路径实现，不要改 `useBatchGeneration.ts`。
- 保存历史失败不得影响生成请求、流式生成和 dirty-save 确认流程。
- 前端选项控件不能替代 textarea，最终请求仍以 `genForm.instruction` 为准。
