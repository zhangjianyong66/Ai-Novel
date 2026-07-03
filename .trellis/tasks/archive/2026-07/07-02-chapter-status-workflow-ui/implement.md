# 优化章节状态工作流交互 - Implement

## Checklist

1. 读取前端规范和相关测试规范
   - `.trellis/spec/guides/index.md`
   - `.trellis/spec/frontend/*/index.md` 中与 React 页面、测试相关的条目
   - `.trellis/spec/backend/*/index.md` 中与 API 路由、测试相关的条目

2. 后端保存契约
   - 修改 `backend/app/api/routes/chapters.py` 的 `update_chapter`
   - 在 `planned` 且最终 `content_md.strip()` 非空时自动设为 `drafting`
   - 保持 `PUT` 禁止显式携带 `status`
   - 保持 `done` 章节只读保护
   - 添加或更新后端测试，覆盖：
     - planned 保存空正文仍 planned
     - planned 保存非空正文变 drafting
     - drafting 保存正文仍 drafting
     - done 保存内容仍被拒绝

3. 前端工作流模型
   - 扩展或替换 `frontend/src/pages/writing/writingPageModels.ts`
   - 用动作 id 建模主动作、次动作、更多动作
   - 覆盖 `planned / drafting / done`、dirty / clean、loading / saving / statusUpdating / autoUpdatesTriggering
   - 更新 `frontend/src/pages/writing/writingPageModels.test.ts`

4. 前端状态编排
   - 在 `frontend/src/pages/writing/useWritingPageState.ts` 增加工作流动作处理函数
   - 实现 `保存并定稿`：保存成功后按最新章节状态执行 `drafting -> done`
   - 实现 `退回草稿`：保留确认后执行 `done -> drafting`
   - 实现 `更新记忆 / 重试更新记忆`：复用现有 `saveAndTriggerAutoUpdates` 或打开 Memory Update 的既有能力，确保只对 done 开放
   - 记忆状态只展示可靠状态；无后端准确数据时不显示虚假的 `已更新 / 可能过期`
   - 保留已有切章未保存确认逻辑

5. 前端详情区 UI
   - 修改 `frontend/src/pages/writing/WritingPageSections.tsx`
   - 拆分章节工具和状态工作流面板
   - 删除常驻删除按钮，放入更多菜单危险项
   - 保留分析、标注回溯入口
   - 定稿状态保持只读 callout
   - 检查窄屏换行与按钮文本不溢出

6. 章节列表轻量状态
   - 评估 `frontend/src/components/writing/ChapterVirtualList.tsx` 是否需要增加记忆状态扩展位
   - 若没有可靠记忆状态数据，第一版只保留写作状态，不显示虚假的已更新/过期

7. 文案
   - 更新 `frontend/src/pages/writing/writingPageCopy.ts`
   - 将旧文案“开始起草 / 标记为已规划 / 标记为定稿 / 一键保存并触发更新”替换为工作流语义文案
   - 确保确认弹窗解释 `定稿 -> 草稿` 不会自动回滚已有记忆

8. 验证
   - 后端：进入 `backend/` 后运行相关章节接口测试；若没有精确测试文件，运行 `python -m pytest tests` 或最小可行子集
   - 前端：进入 `frontend/` 后运行 `npm test -- writingPageModels` 或项目可用测试命令
   - 前端：运行类型检查 / 构建命令，以 `package.json` 为准
   - 手动检查写作页：
     - planned 空正文保存
     - planned 非空正文保存
     - drafting 保存并定稿
     - done 只读和退回草稿
     - done 更新记忆入口
     - dirty 切章保护

## Risky Files

- `backend/app/api/routes/chapters.py`
- `frontend/src/pages/writing/useChapterEditor.ts`
- `frontend/src/pages/writing/useWritingPageState.ts`
- `frontend/src/pages/writing/WritingPageSections.tsx`
- `frontend/src/pages/writing/writingPageModels.ts`
- `frontend/src/pages/writing/writingPageCopy.ts`

## Review Gate Before Start

- 用户确认 PRD、design、implement 的范围。
- 已确认：记忆状态第一版允许“无可靠数据时只显示不可更新/待更新/更新中/更新失败”，把“已更新/可能过期”的持久化准确展示延后。
