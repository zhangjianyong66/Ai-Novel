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
