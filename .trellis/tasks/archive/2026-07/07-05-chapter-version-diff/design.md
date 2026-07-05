# 章节版本差异对比设计

## Architecture

本任务保持后端 API 不变，在前端新增通用版本差异能力。

- `frontend/src/lib/` 新增纯函数差异模块，负责正文归一化、段落切分、段落匹配和段落内 token diff。
- `frontend/src/components/writing/` 新增或拆分对比展示组件，供章节版本抽屉和写作页快捷入口复用。
- `frontend/src/pages/writing/useWritingPageState.ts` 负责加载版本列表、选择默认对比版本、维护对比模式状态。
- `frontend/src/components/writing/ChapterVersionsDrawer.tsx` 保留原有版本预览与激活能力，并增加对比控制和对比视图。
- `frontend/src/pages/writing/WritingPageSections.tsx` 在写作页工具区增加“与上一个版本比较”按钮。

## Data Flow

### 版本抽屉入口

1. 用户打开版本抽屉，现有逻辑加载版本列表并默认选中最新版本。
2. 用户选中目标版本。
3. 点击“对比上一个版本”时，前端按当前 `versions` 数组找到目标版本索引 `i`，基准版本为 `versions[i + 1]`。
4. 如果基准版本详情尚未加载，通过现有 `fetchChapterVersionDetail(chapterId, versionId)` 拉取。
5. 将基准版本正文和目标版本正文传入 diff 模块，右侧渲染左右对照差异。
6. 用户也可以通过基准版本下拉框选择其他版本，差异随选择更新。

### 写作页快捷入口

1. 快捷按钮依赖当前章节的 `active_version_id` 和版本列表。
2. 点击后若版本列表尚未加载，先调用现有版本列表接口。
3. 找到当前激活版本在列表中的索引 `i`，基准版本为 `versions[i + 1]`。
4. 拉取两个版本详情并打开版本对比视图。
5. 若存在未保存修改、无激活版本或无更早版本，按钮不可用并显示原因。

## Diff Contract

差异模块输入：

- `baseContent: string`
- `targetContent: string`

输出面向 UI 的结构化 blocks：

- `type: "equal" | "changed" | "added" | "removed"`
- `baseText?: string`
- `targetText?: string`
- `baseTokens?: DiffToken[]`
- `targetTokens?: DiffToken[]`

正文归一化规则：

- 保留 Markdown 标记本身参与比较。
- 去除行尾空格。
- 将三个及以上连续空行折叠为两个空行，降低空白噪音。
- 保留段落边界，用空行和单行换行辅助切分。

段落内 token diff：

- 中文按连续汉字、英文/数字、空白、标点分 token。
- 对变化段落运行 token 级 LCS 或等价算法，标记新增/删除/相同 token。
- UI 渲染时对删除 token 使用 danger 样式，对新增 token 使用 success 样式，相同 token 使用普通文字。

## UI Design

章节版本抽屉右侧保留“预览 / 对比”两种阅读状态。

- 默认仍展示选中版本预览，避免改变现有使用习惯。
- 顶部增加“对比上一个版本”按钮和“基准版本”选择控件。
- 进入对比后展示左右两栏：左侧“基准版本”，右侧“目标版本”。
- 移动端用单列上下展示，先基准后目标。
- 最旧版本或没有可选基准版本时，按钮禁用并显示提示。

写作页按钮：

- 文案为“与上一个版本比较”。
- 放在现有写作页版本/保存相关工具区附近。
- 使用 `btn btn-secondary` 和 lucide 对比/历史类图标。
- 禁用原因通过 `title` 和旁侧小字提示表达。

## Compatibility

- 不修改后端 schema、数据库模型或接口。
- 不改变 `ChapterVersionSummary`、`ChapterVersionDetail` 的既有字段。
- 对比视图只读，不调用激活版本接口，不写入章节正文。
- 版本来源只用于展示标签，不参与对比选择逻辑。

## Testing

- 为 diff 纯函数增加单元测试，覆盖中文句内修改、Markdown 标记变化、行尾空格忽略、连续空行折叠。
- 前端构建通过 `cd frontend && npm run build` 验证。
- 如项目现有测试环境可用，运行相关前端测试。

## Rollback

若 UI 风险超出预期，可保留 diff 纯函数和版本详情加载逻辑，先仅在版本抽屉中隐藏对比入口；不影响现有版本预览和激活能力。
