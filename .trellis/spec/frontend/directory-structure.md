# 前端目录结构

## 项目布局

```text
frontend/
├── public/                  # 静态资源
├── scripts/                 # 检查脚本，例如 UI class 检查
├── src/
│   ├── components/          # 可复用组件
│   │   ├── layout/          # AppShell、AuthGuard、项目 guard
│   │   ├── ui/              # Modal、Toast、Badge、Drawer 等基础 UI
│   │   └── <feature>/       # 业务域组件
│   ├── contexts/            # Auth、Projects 等 React Context
│   ├── hooks/               # 跨页面复用 hooks
│   ├── lib/                 # 纯工具、路由、动画、请求竞态 guard
│   ├── pages/               # 路由页面，按页面名 PascalCase
│   ├── services/            # API client、SSE、领域 API、浏览器存储
│   ├── types.ts             # 跨页面共享 API/domain 类型
│   ├── App.tsx              # Router 和 Provider 树
│   └── index.css            # Tailwind base/components 和主题 token
├── vite.config.ts
└── package.json
```

参考：`frontend/src/App.tsx`、`frontend/src/index.css`、`frontend/src/services/apiClient.ts`。

## 放置规则

- 新页面放在 `src/pages/`，并在 `src/App.tsx` 使用 `lazy` + `importWithChunkRetry` 注册路由。
- 页面内拆出的业务组件放在 `src/components/<feature>/`，跨功能基础控件放在 `src/components/ui/`。
- 领域 API 封装放在 `src/services/<domain>Api.ts`，不要在页面里重复拼 fetch。
- 跨页面共享类型放在 `src/types.ts`；只服务单个 API 文件的类型可以就近定义在对应 service 中。
- 可复用状态逻辑放在 `src/hooks/use*.ts(x)`；纯函数和小工具放在 `src/lib/`。
- Context 分两类文件：Provider 实现在 `*Context.tsx`，类型和 `createContext` 可放在同名小写文件，例如 `contexts/auth.ts`。

## 命名约定

- React 组件和页面使用 PascalCase 文件名，例如 `DashboardPage.tsx`、`Modal.tsx`。
- hooks 使用 `useXxx.ts` 或 `useXxx.tsx`。
- service/lib 普通模块使用 camelCase 或领域名，例如 `apiClient.ts`、`chapterStore.ts`。
- 测试文件靠近被测模块，命名 `*.test.ts` 或 `*.test.tsx`。

## 避免

- 不要把页面级超大逻辑继续堆在单文件里；已有 `pages/outline`、`pages/writing` 等目录可作为拆分方向。
- 不要在组件里直接硬编码后端 URL，统一走 `/api` 和 service 层。
- 不要新增第二套全局状态库；当前项目没有 Redux/Zustand/React Query。
