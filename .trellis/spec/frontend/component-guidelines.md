# 前端组件规范

## 基础模式

- 组件以函数组件为主，props 通常直接在参数中声明对象类型。
- 多类名组合使用 `clsx`，参考 `src/components/ui/Modal.tsx`、`Badge.tsx`。
- 动画使用 `framer-motion`，并尊重 `useReducedMotion`，参考 `Modal.tsx`、`ToastProvider.tsx`。
- 图标使用 `lucide-react`，不要手写重复 SVG 图标。

## 样式约定

项目使用 Tailwind + `src/index.css` 中的组件类和主题变量：

- 按钮：`btn`、`btn-sm`、`btn-primary`、`btn-secondary`、`btn-ghost`、`btn-danger`、`btn-icon`
- 表单：`input`、`textarea`、`select` 以及 minimal/underline 变体
- 焦点/交互：`ui-focus-ring`、`ui-transition`、`ui-pressable`
- 颜色 token：`canvas`、`surface`、`ink`、`subtext`、`accent`、`success`、`warning`、`danger`、`info`、`border`

优先使用这些 token，不要随意新增硬编码 `amber/red/sky` 等颜色。`index.css` 已明确提示迁移到 `warning/danger/info`。

## UI 组合

- 全局提示使用 `ToastProvider` 和 `useToast()`，错误提示应带 request id。
- 确认动作使用 `ConfirmProvider`，不要用裸 `window.confirm`。
- 弹窗使用 `Modal` / `Drawer` / `Overlay`，注意 `aria-modal`、`aria-label` 或 `aria-labelledby`。
- 请求 ID 展示使用 `RequestIdBadge`。

## 可访问性

- 图标按钮必须有 `aria-label` 或 `title`，参考 Toast 关闭按钮。
- 弹窗必须声明 dialog 语义和可读 label。
- 状态提示区域使用 `aria-live`，参考 `ToastProvider`。
- 动画必须支持 reduced motion。

## 避免

- 不要用内联 style 替代现有主题 token，除非是动态计算且无法表达为 class。
- 不要新增与 `btn`/`input` 平行的按钮和输入框体系。
- 不要让长文本挤破容器；使用 `min-w-0`、`break-words`、`whitespace-pre-wrap` 等现有模式。
