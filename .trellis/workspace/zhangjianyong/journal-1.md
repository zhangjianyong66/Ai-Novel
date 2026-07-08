# Journal - zhangjianyong (Part 1)

> AI development session journal
> Started: 2026-06-30

---



## Session 1: 补全 Trellis 项目规范

**Date**: 2026-06-30
**Task**: 补全 Trellis 项目规范
**Branch**: `main`

### Summary

初始化 Trellis 工作流文件，补全 backend/frontend 基础项目规范，并归档 bootstrap guidelines 任务。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `08731ac` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: 修复 Docker Compose v1 回退

**Date**: 2026-07-01
**Task**: 修复 Docker Compose v1 回退
**Branch**: `main`

### Summary

为 tools/docker-up.sh 增加 docker-compose 独立命令回退，补充回归测试并完成验证。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `8b18229` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: 完成 Trellis 入门任务

**Date**: 2026-07-01
**Task**: 完成 Trellis 入门任务
**Branch**: `main`

### Summary

恢复并完成 joiner onboarding 任务；核对项目 Trellis 工作流、规范索引、任务 CLI 用法和活跃任务状态；归档 00-join-zhangjianyong。

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: 大纲生成偏好保存

**Date**: 2026-07-01
**Task**: 大纲生成偏好保存
**Branch**: `main`

### Summary

实现 AI 大纲生成基调和节奏候选项，支持自由输入并将历史偏好按用户和项目保存到后端数据库。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `b114cbb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: AI 生成完成通知

**Date**: 2026-07-01
**Task**: AI 生成完成通知
**Branch**: `main`

### Summary

新增用户级通知设置、飞书 Webhook 发送、浏览器通知入口，并接入生成记录链路与相关测试。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `51c105e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 6: AI生成用户指令历史

**Date**: 2026-07-02
**Task**: AI生成用户指令历史
**Branch**: `main`

### Summary

为单章AI生成增加用户指令历史保存、默认指令下拉选项、后端持久化接口与迁移，并补充前后端测试。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `924ecf6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 7: 完成项目包导入导出

**Date**: 2026-07-02
**Task**: 完成项目包导入导出
**Branch**: `main`

### Summary

实现 project_bundle_v1 项目包导入导出 MVP：后端补齐可继续写作数据范围、导入大小配置与路由校验；前端新增首页导入卡片、本地预检摘要、导出页项目包下载入口；补充测试、环境示例和项目包规范。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `bd0138f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 8: 清理残留伏笔

**Date**: 2026-07-02
**Task**: 清理残留伏笔
**Branch**: `main`

### Summary

修复删除大纲/章节后章节派生 StoryMemory 伏笔残留；伏笔时间线过滤无章节来源记录；补充回归测试与后端规范。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `9d7f2c2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 9: 调整章节一键保存触发更新

**Date**: 2026-07-02
**Task**: 调整章节一键保存触发更新
**Branch**: `main`

### Summary

调整写作页一键保存并触发更新：已保存章节也可触发；草稿只补跑 vector/search；定稿触发完整章节自动更新链，并同步测试与规范。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c6793b5` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 10: 修复定稿章节回退草稿保存失败

**Date**: 2026-07-02
**Task**: 修复定稿章节回退草稿保存失败
**Branch**: `main`

### Summary

修复写作页已定稿章节回退草稿后保存仍提交完整 payload 导致 chapter_done_readonly 的问题，补充前端回归测试和章节保存契约规范。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `920e00c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 11: 拆分章节状态修改动作

**Date**: 2026-07-02
**Task**: 拆分章节状态修改动作
**Branch**: `main`

### Summary

新增章节状态独立 PATCH 接口和状态机，禁止 PUT 修改 status；写作页改为状态徽标与合法动作按钮，并同步测试和章节自动更新规范。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `335012c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 12: 优化章节状态工作流交互

**Date**: 2026-07-03
**Task**: 优化章节状态工作流交互
**Branch**: `main`

### Summary

完成写作页章节状态工作流 UI、计划中保存正文自动转草稿、定稿/退回/记忆更新入口与测试验证。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `ac3fc48` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 13: 修复章节规划失败处理

**Date**: 2026-07-03
**Task**: 修复章节规划失败处理
**Branch**: `main`

### Summary

修复 plan_first 模式下规划解析失败仍继续生成的问题，规划步骤保留模型配置 max_tokens，并补充回归测试与后端错误处理规范。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `bc67604` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 14: 章节 AI 正文版本化

**Date**: 2026-07-05
**Task**: 章节 AI 正文版本化
**Branch**: `main`

### Summary

为章节 AI 生成、流式生成和章节改写增加后端即时保存的正文版本；新增版本 API 和写作页历史版本预览/激活流程，避免网络不稳定导致 AI 结果丢失。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `7a6afee` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 15: 章节版本差异对比

**Date**: 2026-07-05
**Task**: 章节版本差异对比
**Branch**: `main`

### Summary

实现章节版本通用差异对比，支持版本抽屉选择基准版本与写作页快捷对比上一个版本，并补充 diff 单元测试和前端验证记录。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `580ba4f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 16: 修复大纲生成后切换

**Date**: 2026-07-05
**Task**: 修复大纲生成后切换
**Branch**: `main`

### Summary

修复 AI 生成大纲后前端未自动切换到后端已保存的新大纲，补充 saved_outline 同步约定和回归测试。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `b6f50e6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 17: 前端 LLM 请求超时统一修复

**Date**: 2026-07-06
**Task**: 前端 LLM 请求超时统一修复
**Branch**: `main`

### Summary

统一前端同步等待 LLM 请求的浏览器超时，覆盖章节分析改写、记忆提议、Fractal v2 和 LLM 连接测试，并补充项目规范。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `e0a1301` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 18: 登录用户修改密码

**Date**: 2026-07-06
**Task**: 登录用户修改密码
**Branch**: `main`

### Summary

新增账户安全页和当前登录用户自助修改密码流程，补充前端服务、校验、路由和项目规范记录。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `8af1777` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 19: 完成剧情记忆作用域治理

**Date**: 2026-07-06
**Task**: 完成剧情记忆作用域治理
**Branch**: `main`

### Summary

补齐剧情记忆作用域治理验证，修复 StoryMemory 派生索引同步中表探测干扰事务的问题，新增迁移和 Vector RAG 作用域测试，并归档任务。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `b588226` | (see git log) |
| `0edcf15` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 20: 用户管理登录名与管理员权限

**Date**: 2026-07-06
**Task**: 用户管理登录名与管理员权限
**Branch**: `main`

### Summary

新增稳定内部用户 ID 与可修改 login_name 分离模型，更新本地登录/注册/管理员用户管理接口和前端页面，补充迁移、OIDC 绑定、管理员保护与请求 schema 测试。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2ff4a2e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 21: 修复项目包核心状态迁移

**Date**: 2026-07-06
**Task**: 修复项目包核心状态迁移
**Branch**: `main`

### Summary

补全项目包导入导出的章节版本历史、激活版本映射和 StoryMemory 作用域/大纲归属；增加 roundtrip 与旧包兼容测试，并同步项目包规范。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `a1f9777` | (see git log) |
| `49002ac` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 22: 章节版本比对差异跳转

**Date**: 2026-07-06
**Task**: 章节版本比对差异跳转
**Branch**: `main`

### Summary

为章节版本比对增加上一个/下一个差异循环跳转、当前位置提示和当前差异高亮，并补充组件渲染测试；前端 lint、相关 Vitest 和 build 均已验证通过。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `f5c66b9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 23: 章节分析定稿规则

**Date**: 2026-07-07
**Task**: 章节分析定稿规则
**Branch**: `main`

### Summary

为章节分析增加定稿结论、阻断定稿问题分级、按建议重写过滤规则和写作页定稿确认；更新项目协作说明并补充前后端测试。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `aab104e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 24: 章节分析后续资产注入

**Date**: 2026-07-07
**Task**: 章节分析后续资产注入
**Branch**: `main`

### Summary

实现章节分析 followup_assets 的选择性沉淀与后续章节专用记忆区块，补充后端注入逻辑、前端预览展示、prompt contract、测试和项目规范。验证通过后端相关 unittest 与前端 lint。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `0d25291` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 25: 前端移动端兼容优化

**Date**: 2026-07-08
**Task**: 前端移动端兼容优化
**Branch**: `main`

### Summary

优化前端移动端兼容布局：补齐 AppShell、Drawer、Modal、MarkdownEditor、Dashboard、Writing、Outline、Prompts 的窄屏宽度、换行和滚动约束；更新前端组件规范并完成 lint、build、test 验证。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `ed8c5f9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 26: 完成章节分析结果持久化

**Date**: 2026-07-08
**Task**: 完成章节分析结果持久化
**Branch**: `main`

### Summary

完成章节分析结果持久化与自动应用剧情记忆收尾验证：确认分析快照可恢复、过期判断、0 记忆空成功、截断保护和后续写作资产注入契约；运行相关后端单测、前端 lint 与 Vitest 后归档任务。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `15efd42` | (see git log) |
| `d556bbf` | (see git log) |
| `0d25291` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 27: 完成前端移动端核心布局优化

**Date**: 2026-07-08
**Task**: 完成前端移动端核心布局优化
**Branch**: `main`

### Summary

优化移动端核心创作路径布局：调整写作工具条、章节状态区、抽屉/弹窗 padding、阅读/预览工具条和向导底栏；完成 frontend lint、build、test 验证。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `3f8d642` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 28: 修复移动端章节版本对比空隙

**Date**: 2026-07-08
**Task**: 修复移动端章节版本对比空隙
**Branch**: `main`

### Summary

修复章节版本移动端对比布局：将基准选择器并入顶部工具栏，移除操作栏与 sticky 差异导航之间的滚动区夹层；补充回归测试、前端规范和项目说明，并通过相关测试、lint、build。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4b315ad` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 29: 修复移动端版本对比贴合空隙

**Date**: 2026-07-08
**Task**: 修复移动端版本对比贴合空隙
**Branch**: `main`

### Summary

定位章节版本移动端对比残留空隙来自 compare 滚动区顶部 padding 与半透明圆角 sticky 导航；改为顶部无 padding、不透明直角 sticky 导航，并补充回归测试与项目规范说明。验证相关测试、lint、build 均通过。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `ad443b8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 30: 修复章节版本差异跳转回退

**Date**: 2026-07-08
**Task**: 修复章节版本差异跳转回退
**Branch**: `main`

### Summary

修复章节版本对比中程序化跳转被滚动同步回退的问题，新增导航状态回归测试并完成前端验证。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4a8d971` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
