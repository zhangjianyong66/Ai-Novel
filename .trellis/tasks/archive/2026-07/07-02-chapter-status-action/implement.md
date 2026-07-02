# 拆分章节状态修改接口与交互实施计划

## Scope

本轮只执行章节状态接口和写作页状态动作拆分。不扩展批量操作，不改变自动更新触发接口，不引入“定稿并触发更新”的混合动作。

## Checklist

- [x] 后端：新增 `ChapterStatusUpdate` 请求 schema 或等价类型。
- [x] 后端：新增章节状态合法流转集合。
- [x] 后端：新增 `PATCH /api/chapters/{chapter_id}/status`。
- [x] 后端：让 `PUT /api/chapters/{chapter_id}` 收到 `status` 字段时统一返回 `chapter_status_update_requires_status_endpoint`。
- [x] 后端：保留 `PUT` 对已定稿章节内容修改的只读保护。
- [x] 后端测试：覆盖合法状态流转、非法状态流转、expected_status 冲突、成功不创建 `ProjectTask`、PUT status 禁止。
- [x] 前端服务层：新增 `updateChapterStatus`。
- [x] 前端模型：从 `ChapterForm` 和保存 payload 中拆出 `status`。
- [x] 前端写作页：用状态徽标 + 合法动作按钮替换下拉框。
- [x] 前端写作页：状态动作 dirty 禁用、loading、toast、错误处理。
- [x] 前端写作页：`done -> drafting` 使用 `ConfirmProvider` 二次确认。
- [x] 前端测试：更新保存 payload 测试，新增状态动作模型或组件测试。
- [x] 文档：更新 `.trellis/spec/backend/chapter-auto-update-guidelines.md`。
- [x] 文档：更新根目录 `AGENTS.md` 中章节状态修改相关约定。
- [x] 验证：运行相关后端和前端测试。

## Validation Commands

后端优先运行：

```bash
cd backend && python -m pytest tests/test_chapter_trigger_auto_updates_endpoint.py
```

如新增独立测试文件，则运行对应文件：

```bash
cd backend && python -m pytest tests/test_chapter_status_endpoint.py
```

前端优先运行：

```bash
cd frontend && npm test -- writingPageModels
```

如果状态动作组件测试新增到其它文件，运行对应测试文件。最终视改动范围补充：

```bash
cd frontend && npm run lint
```

## Risk Points

- `PUT` 立刻禁止 `status` 是破坏性行为，必须确保写作页所有状态修改路径都迁移到新接口。
- `ChapterForm` 拆出 `status` 会影响生成、分析、改写等写作页 hooks 中把状态改为 `drafting` 的逻辑，需要逐处判断是内容变更后本地状态应更新，还是应通过新状态接口处理。
- 定稿只读保护不能因为 `PUT status` 禁止而被误删；已定稿章节内容修改仍要拒绝。
- 自动更新任务边界不能漂移：状态接口成功不得创建 `ProjectTask`。

## Review Gate Before Start

开始实现前确认：

- PRD 中的需求和验收是否完整。
- 是否接受 `same status PATCH` 按非法流转处理。
- 是否接受 `PUT` 对已定稿章节内容修改继续使用 `chapter_done_readonly`。
