# 章节版本差异对比实施计划

## Checklist

1. 阅读实现前规范
   - 加载 `trellis-before-dev`。
   - 读取前端组件、Hook、类型安全和质量规范。

2. 实现 diff 纯函数
   - 在 `frontend/src/lib/` 新增章节正文 diff 工具。
   - 实现空白归一化、段落切分、token 切分、LCS 对比。
   - 添加单元测试覆盖中文、Markdown 和空白噪音。

3. 实现差异展示组件
   - 新增可复用左右对照组件。
   - 使用 Tailwind 主题 token 和现有 `btn/select` 样式。
   - 保证长文本 `whitespace-pre-wrap`、`break-words`，移动端单列。

4. 扩展版本抽屉
   - 增加对比状态：目标版本、基准版本、基准详情加载状态、对比模式。
   - 增加“对比上一个版本”快捷按钮。
   - 增加基准版本下拉框，排除目标版本自身。
   - 保留现有预览和“设为当前版本”逻辑。

5. 增加写作页快捷入口
   - 在写作页工具区增加“与上一个版本比较”按钮。
   - 复用版本列表加载和详情加载逻辑。
   - 未保存修改、无激活版本、无更早版本时禁用并显示原因。

6. 验证
   - 运行 diff 单元测试。
   - 运行 `cd frontend && npm run build`。
   - 手动检查版本列表为空、只有一个版本、最旧版本、当前激活版本不在列表中的 UI 状态。

## Risk Points

- `useWritingPageState.ts` 已经较大，新增状态要避免进一步混乱；优先用小型 helper 纯函数降低复杂度。
- 版本详情按需加载需要避免旧请求覆盖新状态；应复用或模仿现有请求顺序保护模式。
- diff 结果可能很长，UI 必须限制容器溢出，不能撑破抽屉。

## Validation Commands

```bash
cd frontend && npm test -- --run
cd frontend && npm run build
```

如测试脚本与 Vitest 参数不兼容，记录实际可运行命令和结果。
