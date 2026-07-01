# 修复 Docker Compose v1 回退

## 背景

`tools/docker-up.sh` 用于本地 Docker Compose 启动、构建和日志管理。部分开发环境没有 Docker Compose v2 插件命令 `docker compose`，但安装了独立命令 `docker-compose`。脚本应在这种环境下继续可用。

## 需求

- 当 `docker compose version` 不可用，但 `docker-compose version` 可用时，脚本应自动使用 `docker-compose`。
- 保持现有 Docker Compose v2 插件优先级不变。
- 保持代理构建流程可用，并确保临时 compose override 文件在函数返回后清理。
- 增加可重复运行的回归测试，覆盖 v2 插件不可用时的 v1 回退行为。
- 更新项目级说明，记录 `tools/docker-up.sh` 的 Compose v1 回退约定和测试命令。

## 非目标

- 不调整 Docker Compose 文件结构。
- 不改变容器服务、端口或环境变量语义。
- 不引入额外测试框架。

## 验收标准

- `bash tools/test-docker-up.sh` 通过。
- `bash -n tools/docker-up.sh tools/test-docker-up.sh` 通过。
- `tools/docker-up.sh` 在 v2 插件可用时仍优先使用 `docker compose`。
- `tools/docker-up.sh` 在 v2 插件不可用但 `docker-compose` 可用时输出并使用 `docker-compose`。
