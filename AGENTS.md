# 项目协作说明

## 目录结构

- `backend/`：FastAPI 后端，测试位于 `backend/tests/`。
- `frontend/`：React + Vite + TypeScript 前端。
- `tools/`：本地开发与运维辅助脚本。
- `docs/superpowers/plans/`：跨会话延续的 Superpowers 计划文件，适合记录后续逐项分析或执行的任务清单。
- `.trellis/`：Trellis 工作流、任务和项目规范。

## Docker 运行约定

- 推荐使用 `./tools/docker-up.sh` 管理 Docker Compose 启动、构建、日志和停止。
- `./tools/docker-up.sh restart` 会先构建镜像，再执行 `up -d --force-recreate` 强制重建并重启容器，最后显示服务状态；日常一键构建重启优先使用该命令，不需要先 `down`。
- `tools/docker-up.sh` 优先使用 Docker Compose v2 插件命令 `docker compose`。
- 如果本机没有 v2 插件但安装了独立命令 `docker-compose`，脚本会自动回退使用 `docker-compose`。
- `.env.docker` 不存在时，脚本会从 `.env.docker.example` 自动复制一份。
- 如果启动时报 `failed to bind host port 127.0.0.1:6379`，说明宿主机 Redis 端口已被占用；可在 `.env.docker` 中把 `REDIS_PORT` 改为未占用端口（例如 `6380`）。容器内后端和 worker 仍通过 `redis://redis:6379/0` 通信，不受宿主机映射端口影响。
- Linux.do OIDC discovery/token/userinfo 等运行期后端出站请求需要走宿主机代理时，在 `.env.docker` 设置 `OUTBOUND_PROXY_URL=http://host.docker.internal:10808`；`docker-compose.yml` 已为 backend/rq_worker 配置 `host.docker.internal:host-gateway`，容器内不要使用 `127.0.0.1:10808` 访问宿主机代理。
- `SECRET_ENCRYPTION_KEY` 留空时由容器 entrypoint 从 `/data/secrets/secret_encryption_key` 生成/读取并导出给主进程；`docker exec` 启动的新进程不会继承 entrypoint 后续导出的环境变量。排查密钥解密问题时，应显式注入该文件内容，例如 `docker exec -e SECRET_ENCRYPTION_KEY="$(docker exec ai-novel-backend-1 cat /data/secrets/secret_encryption_key)" ...`，避免误判为服务端未配置密钥。

## 公网访问与 frp 代理约定

- 本地 Docker 前端容器监听宿主机 `5173`，前端容器内 nginx 已将 `/api/` 代理到 Compose 服务名 `backend:8000`；公网暴露时优先只穿透 `5173` 一个端口，不单独穿透后端 `8000`。
- `frontend/nginx.conf` 的 `client_max_body_size` 应不低于项目包导入默认上限 50MB；当前设置为 `60m`，避免公网单入口代理时大于 32MB 的项目包在前端 nginx 层被拒绝。
- 公网链路在 ecs2 nginx 终止 HTTPS 后通过 frp 以 HTTP 回到本地，前端容器 nginx 转发 `/api/` 时必须保留上游 `X-Forwarded-Proto`，避免后端把公网 HTTPS 请求误判为 HTTP。
- 本机复用用户级 `frpc.service`（`~/.config/systemd/user/frpc.service`，配置 `~/.frpc/frpc.ini`）连接 ecs2 的 frps；Ai-Novel 公网隧道使用 `type = http`、`local_ip = 127.0.0.1`、`local_port = 5173`、`custom_domains = ainovel.zhangjianyong.top`。
- ecs2 上 `ainovel.zhangjianyong.top` 由 `/usr/local/nginx/conf/conf.d/ainovel.zhangjianyong.top.conf` 提供 HTTPS 入口，反代到本机 frps HTTP vhost `http://127.0.0.1:8080`，再由 frp 转发回本地 `5173`。
- ecs2 的 nginx 是 `/usr/local/nginx/sbin/nginx` 自管进程，不是 `nginx.service`；修改配置后使用 `/usr/local/nginx/sbin/nginx -t` 检查，并用 `/usr/local/nginx/sbin/nginx -s reload` 重载。
- 公网链路当前 ecs2 nginx、frps HTTP vhost、本地前端 nginx 代理读写/响应头等待超时均按长请求配置：ecs2 站点配置和 `frontend/nginx.conf` 的 `/api/` 都设置了 `proxy_read_timeout 3600s`、`proxy_send_timeout 3600s`；ecs2 `/etc/frp/frps.ini` 设置 `vhost_http_timeout = 3600`，避免 frps 默认 60 秒等待响应头超时导致长时间 LLM 请求在公网链路返回 404，而后端稍后实际成功。
- 大模型实际调用上限主要由 LLM preset / task preset 的 `timeout_seconds` 决定，后端 httpx read timeout 使用该值；前端非流式大纲/章节生成会使用 `timeout_seconds * 1000 + 60000` 作为浏览器请求超时，普通 API 默认仍是 120 秒。
- ecs2 证书续签接入现有 `/root/ssl_auto_renew/ssl_auto_renew.sh` 和 `/root/ssl_auto_renew/domains.conf`；新增域名需在 `domains.conf` 中登记域名到 nginx 配置文件的映射。

## Docker 数据存储约定

- Docker Compose 默认把 PostgreSQL 数据库持久化到命名卷 `postgres_data`，容器内路径为 `/var/lib/postgresql/data`；项目、章节、大纲、角色、世界书、术语、知识库元数据、任务记录、用户、LLM 配置等业务表都在该数据库中。
- 后端和 worker 共享命名卷 `app_data`，容器内挂载到 `/data`；默认 `VECTOR_CHROMA_PERSIST_DIR=/data/chroma`，Chroma 向量库数据在该卷内，容器自动生成的密钥会持久化到同一 `/data` 卷中。
- Redis 服务默认没有挂载持久化卷，只保存 RQ 队列和临时运行状态；跨机器同步测试数据通常不需要同步 Redis。
- 非 Docker 本地运行时，默认 `DATABASE_URL=sqlite:///./ainovel.db` 会解析到 `backend/ainovel.db`；未设置 `VECTOR_CHROMA_PERSIST_DIR` 时，Chroma 默认目录为 `backend/.chroma`。
- 两台机器要同步 Docker 测试数据时，至少需要同步 `postgres_data` 和 `app_data` 两个 Docker volume；只同步代码仓库不会带走数据库、向量库和自动生成密钥。

## 测试约定

- 修改 `tools/docker-up.sh` 后，至少运行 `bash tools/test-docker-up.sh` 验证 Compose 命令探测兼容性。
- 后端测试优先在 `backend/` 目录使用 `python -m pytest ...` 运行；当前环境直接执行 `pytest ...` 可能无法解析 `app` 包并报 `ModuleNotFoundError: No module named 'app'`。
- 当前本地环境没有全局 `python` 命令，使用 `python3` 或 `backend/.venv/bin/python`；当前 `backend/.venv` 未安装 `pytest`，`unittest` 风格单测可用 `cd backend && .venv/bin/python -m unittest tests.<module>` 验证。
- 当前全量 `cd backend && python -m pytest tests` 可能先被既有测试环境问题阻塞：`tests/test_gate_runner.py`、`tests/test_prompt_preset_integrity.py`、`tests/test_security_guard_runner.py` 依赖仓库中不存在的 `scripts.run_gate` / `scripts.guards`；忽略这 3 个文件后，当前还可见既有失败 `test_auth_session.py::TestAuthEndpoints::test_register_rejects_reserved_admin_user_id` 和 `test_prompt_task_reachability_registry.py::TestPromptTaskReachabilityRegistry::test_ui_copy_and_e2e_registry_registered`。
- 当前全量 `cd frontend && npm run lint` 已可通过；验证前端改动时优先运行全量 lint，必要时可先对本次触碰文件运行 `npx eslint ...`、`npx prettier --check ...` 和 `node scripts/check-ui-classes.mjs` 定位问题。
- 前端 Vitest 当前配置为 Node 环境（`frontend/vitest.config.ts`），未安装 `jsdom`、`happy-dom` 或 Testing Library；需要覆盖 hook 状态规则时，优先抽取纯函数/状态模型进行单测，除非先明确引入浏览器 DOM 测试环境。

## 前端时间显示约定

- 前端用户可见的后端时间戳、生成标题时间和导出文件名时间应通过 `frontend/src/lib/dateTime.ts` 格式化，显式使用 `Asia/Shanghai`，避免直接展示 UTC ISO 字符串或使用 `toISOString().slice(...)` 导致比北京时间慢 8 小时。
- 排序、缓存 key、本地新旧比较、导出 JSON 元数据等机器可读场景仍保留原始 ISO 或 epoch，不要为了显示格式化而改变业务判断值。

## 写作页移动端 UI 约定

- 章节版本移动端对比中，基准版本选择器应放在抽屉顶部紧凑工具栏内；diff 滚动正文区应直接从差异导航和正文开始，避免在操作按钮与 sticky 差异导航之间插入独立选择卡片造成可见空隙或叠层。移动端 sticky 差异导航必须使用不透明背景、直角边缘，且 compare 滚动区顶部不要留 `padding`，否则正文滚过时会从半透明背景、圆角或顶部内边距处透出。
- 章节版本移动端抽屉应覆盖整个视口，面板使用 `h-dvh` 且移动端不要保留顶部圆角或 `85/86vh` 类高度，否则底部抽屉会在顶部露出写作页工具区，浪费可读区域。
- 章节版本移动端对比模式应默认折叠版本列表、基准选择和操作按钮，只保留目标版本摘要与展开入口，让差异导航和正文尽早出现在首屏；展开后再显示完整控制区，桌面端仍保持常规两栏布局。

## 认证与账户安全约定

- `users.id` 是稳定内部用户 ID 和外键目标，不再作为可修改登录用户名；本地登录用户名使用 `users.login_name`，API 响应同时返回稳定 `id` 和 `login_name`。
- 本地登录、本地注册、管理员创建用户等面向登录用户名的请求字段使用 `login_name`；旧 `user_id` 登录名入参不做兼容映射，应被请求模型拒绝。
- 新建本地用户时内部 `users.id` 由系统生成，`login_name` 单独保存；历史用户通过迁移回填 `login_name = 原 users.id`，不修改历史内部 ID。
- 登录用户名只允许小写字母、数字、下划线和短横线，长度 1 到 64；后端统一 trim 并转小写，中文展示名使用 `display_name`。
- Linux.do OIDC 账号通过 `auth_external_accounts.user_id` 绑定稳定内部 `users.id`；管理员修改 `login_name` 不应影响后续 Linux.do 登录，也不应创建重复用户。
- `admin` 超级管理员禁止禁用、禁止修改登录用户名、禁止撤销管理员权限；普通管理员也不能撤销自己的管理员权限。`admin` 仍允许修改显示名、邮箱和密码。
- 普通登录用户修改自己的本地密码使用后端接口 `POST /api/auth/password/change`，请求体为 `old_password` 和 `new_password`；接口校验旧密码，成功后更新密码哈希和更新时间，不强制当前会话退出。
- 前端自助修改密码入口为 `/account/security`，侧栏显示“账户安全”；表单包含“当前密码 / 新密码 / 确认新密码”，前端先校验新密码至少 8 位且两次输入一致。
- 管理员修改自己的密码也应使用同一个自助入口；管理员用户管理页的 `POST /api/auth/admin/users/{target_user_id}/password/reset` 语义是管理员重置密码，不是普通用户自助改密。
- 第三方登录且没有本地密码的账号当前不支持在账户安全页设置本地密码；如需支持，应单独设计绑定密码和身份确认流程。

## 项目包导入导出约定

- 项目包导入上传大小上限由 `PROJECT_BUNDLE_IMPORT_MAX_BYTES` 配置，未配置或配置为非正数时默认 `52428800` 字节（50MB），后端会把过大的异常配置钳制到 500MB。
- 前端通过 `GET /api/projects/import_bundle/config` 获取项目包导入限制和支持的 `schema_version`，本地预检失败时使用 50MB 兜底。
- 项目包导入服务使用裸外键 ID 批量创建多张表时，不能依赖 SQLAlchemy 自动推断父子表 flush 顺序；PostgreSQL 会严格检查外键。新增导入实体时，父表应先 `db.flush()` 后再创建依赖子表，并在 roundtrip 测试里启用 SQLite `PRAGMA foreign_keys=ON` 覆盖该类问题。
- 项目包属于“可继续写作”迁移协议，导出导入章节时必须保留 `chapter_versions` 历史和 `chapters.active_version_id` 映射；导入时先创建章节，再创建版本，最后回填激活版本，避免外键指向旧项目或未创建版本。
- 项目包导出导入 `StoryMemory` 时必须保留并映射 `scope` 和 `outline_id`；`scope=outline` 应映射到新项目对应大纲，无法映射时降级为 `unassigned` 且清空 `outline_id`，`project`/`unassigned` 不应携带大纲 ID。
- 世界书 `priority` 的当前合法值是 `drop_first`、`optional`、`important`、`must`；历史数据或旧项目包可能含有 `normal`，API 输出、预览和项目包导入导出边界应兼容并规范化为 `important`，避免 Pydantic 响应模型报 `INTERNAL_ERROR`。

## Vector RAG 约定

- Vector RAG 路由运行时优先使用项目的 Vector Embedding 专用配置；如果未单独配置 embedding API Key，会回退到项目绑定的默认 LLM Profile API Key，但不会用默认 LLM Profile 覆盖 Vector Embedding 的 provider/base_url/model。

## LLM 调用参数约定

- 大纲生成、大纲分段补全/修复、大纲 JSON 修复、通用 JSON 修复、Fractal v2 等基于既有 `PreparedLlmCall` 派生的 LLM 调用，应保留模型配置页或任务预设解析后的 `max_tokens`；只覆盖必要的 `temperature` 等采样参数，避免固定小上限截断结构化输出。
- 剧情记忆自动更新 `plot_auto_update` 同样不得用代码内固定小上限覆盖 LLM 配置/任务预设里的 `max_tokens`；若模型返回 `finish_reason=length` 或解析警告包含 `output_truncated`，任务必须失败并保留旧 `StoryMemory`，不能继续应用截断分析结果。
- 章节生成和批量章节生成的 `target_word_count` 只作为提示词里的写作目标，不得用它重新估算或覆盖 LLM 配置/任务预设里的 `max_tokens`；实际调用上限以解析后的 LLM 配置为准。
- 排查实际 LLM 调用模型时，以 `generation_runs` 表为准；该表任务类型字段名是 `type`（例如 `chapter_analyze`、`chapter_rewrite`），不是 `run_type`。任务级模型覆盖配置在 `llm_task_presets.task_key/provider/model` 中，项目默认配置在 `llm_presets.provider/model` 中。
- 排查实际 LLM 提示词时，也以 `generation_runs.prompt_system`、`prompt_user`、`prompt_render_log_json` 为准；代码里的默认 prompt 资源更新后，数据库中已存在的项目 `prompt_presets`/`prompt_blocks` 不会自动刷新，需在 Prompt Studio 重置默认预设/提示块，或调用后端的 reset-to-default 逻辑后再重新生成。

## 大纲生成约定

- 大纲页单次 AI 生成成功后，后端生成接口应立即把最终可用结果保存为新大纲并切换为当前 active outline，避免只存在弹窗内存预览导致刷新或关闭后丢失。
- 大纲自动另存由后端 `/api/projects/{project_id}/outline/generate` 和 `/api/projects/{project_id}/outline/generate-stream` 在最终结果可用后落库，并在响应中返回 `saved_outline`；前端看到 `saved_outline` 时只刷新大纲状态，不再二次调用 `POST /api/projects/{project_id}/outlines`，以避免重复创建。
- 自动另存生成的用户可见标题（例如 `AI 大纲 yyyy-mm-dd HH:MM`）应按 `Asia/Shanghai` 展示时间格式化，不能直接截取 UTC ISO 字符串，否则会比北京时间慢 8 小时。
- 大纲生成接口返回的 `saved_outline` 是后端已落库并已设为 active outline 的权威结果；前端收到后应基于该对象立即同步当前大纲、编辑器内容、基线和下拉列表，再刷新服务端数据校准，不能只依赖普通刷新后“碰巧”切到最新大纲。
- 自动保存只在最终结果存在至少 1 个有效章节且没有 `parse_error` 时发生；若仅有 `warnings` 仍保存，但前端应提示“已保存，但有生成警告”。
- 自动保存失败或生成结果不可自动保存时，前端必须保留生成预览，并提供“重试保存为新大纲”和“复制结果”等恢复路径。
- 流式生成过程中的部分章节预览只用于展示，不应中途落库；只有最终结果完整成功后保存一次。
- 前端大纲非流式生成 `POST /api/projects/{project_id}/outline/generate` 不应使用通用 `apiClient` 120 秒默认超时；应读取当前 LLM preset 的 `timeout_seconds` 并增加响应处理余量。否则请求可能在后端 LLM 调用成功并自动保存后被浏览器中止，导致界面误报响应失败。
- 大纲生成自动另存不自动创建章节骨架；章节骨架仍由用户显式点击“从大纲创建章节骨架”触发。
- 历史 `generation_runs` / `run_id` 恢复应设计独立入口，不复用大纲生成弹窗的自动另存主流程。

## 世界书自动更新约定

- 世界书页面的“手动触发”定义为补跑最新已完成章节的章节级 `worldbook_auto_update`，不作为项目级从大纲/世界观重建世界书入口。
- 手动触发必须基于 `status=done` 的章节正文；没有已完成章节时前端应阻止触发，后端接口也应返回 `details.reason=no_done_chapter`，避免创建 `worldbook:project:*` 空跑任务。
- 项目级世界书重建/提取如果未来需要，应设计独立入口和 prompt 策略，不复用当前章节增量更新按钮语义。

## 章节自动更新约定

- 章节分析不以“没有建议”为定稿标准；定稿标准是“没有阻断定稿问题”。阻断问题包括章节大纲目标未完成、关键因果不成立、人物行为与人设冲突、前文事实/时间线/世界观冲突、后续章节依赖信息缺失、明显硬错误或格式损坏。
- 章节分析输出应明确给出 `finalization.verdict`（`ready`/`needs_revision`/`blocked`）、章节目标完成度、最多 3 条 `blocking_issues`、可选优化、润色建议、上一轮问题追踪和后续写作资产；普通文风润色、节奏增强、后续章节建议和全书规划想法不应阻止当前章节定稿。
- 写作页手动章节分析只允许基于已保存章节内容运行；有未保存修改时前端应阻止，后端也应拒绝携带 `draft_title`/`draft_plan`/`draft_summary`/`draft_content_md` 的分析请求。
- 手动章节分析解析成功后应持久化为该章最近一次 `plot_analysis`，记录 `generation_run_id`、章节正文 hash、`active_version_id` 和应用状态；刷新后点击分析弹窗应从后端恢复，正文变化后旧分析标记为过期且禁止重写/重试应用。
- 手动章节分析成功后自动应用到剧情记忆，同时章节分析弹窗保留常驻“保存到记忆库”按钮，用于把已恢复/已分析结果中的钩子、伏笔、情节点重新写入剧情记忆；应用失败时保留分析结果并提供重试入口，提取 0 条剧情记忆视为成功空结果。
- 章节分析字段按用途分层：`finalization`、`blocking_issues`、`optional_improvements`、`polish_suggestions` 是质量评审层，不直接注入后续章节生成；`chapter_summary`、`hooks`、`foreshadows`、`plot_points`、`character_states` 是章节事实层，可沉淀为受管 `StoryMemory`。
- 章节分析 `followup_assets` 只有标准白名单类型会自动沉淀：`continuity_fact` 写入 `StoryMemory.memory_type=continuity_fact` 并进入普通 `story_memory`；`future_payoff` 写入未回收伏笔型 `StoryMemory.memory_type=foreshadow,is_foreshadow=1`；`next_chapter_requirement` 写入短生命周期 `StoryMemory.memory_type=next_requirement`，由后端设置 `metadata.target_chapter_number=当前章节号+1` 和 `metadata.lifecycle=next_chapter_only`。
- `next_requirement` 不进入普通 `story_memory` 或 story_memory 向量索引，只在章节生成记忆注入开启时通过专用 `NextChapterRequirements` 区块注入目标章节；不会自动续期，若下一章仍未满足，应由下一章分析重新生成资产。
- 写作页定稿仍由作者最终决定；未分析或最近分析仍有阻断问题时前端只提示确认，不硬性禁止定稿。
- “按建议重写”默认只应用章节分析里的 `blocking_issues`；`optional_improvements`、`polish_suggestions`、`followup_assets`、`planning_notes` 属于作者可选项或后续写作资产，不应默认传给重写模型要求改正文。
- 写作页/章节接口的 `POST /api/chapters/{chapter_id}/trigger_auto_updates` 可由已保存章节或无未保存修改的章节显式触发；章节为草稿时只创建 `vector_rebuild`、`search_rebuild`，章节为 `status=done` 时创建 `vector_rebuild`、`search_rebuild` 和完整章节自动更新链。
- 写作页“记忆状态”必须来自后端持久状态摘要 `GET /api/chapters/{chapter_id}/memory_update_status`，不能只用前端瞬时请求状态推断；状态包括 `unavailable`、`pending`、`updating`、`updated`、`failed`。已更新且章节内容未变化时显示“已更新”，不把“更新记忆”作为主按钮；显式“重新更新记忆”通过 `POST /api/chapters/{chapter_id}/trigger_auto_updates` 的 `force=true` 创建新任务，默认触发仍保持幂等。
- `PUT /api/chapters/{chapter_id}` 普通保存不创建任何 `ProjectTask`，包括 `vector_rebuild`、`search_rebuild` 和各类内容自动更新；只有显式调用 `trigger_auto_updates` 才触发后台更新任务。
- 章节 AI 生成、流式生成最终结果、章节 AI 优化/改写拿到完整正文后，应由后端立即保存为 `chapter_versions` 新版本并激活，同步写回 `chapters.content_md` 和 `chapters.active_version_id`，避免前端网络中断导致结果丢失。
- 章节正文版本只管理 `content_md`，不回滚标题、计划、摘要或状态；AI 覆盖前如果当前正文没有匹配的激活版本，应懒创建 `manual_snapshot`，当前正文已等于激活版本时不重复创建快照。
- 版本激活与普通正文保存一样只标记 vector dirty，不自动创建 `ProjectTask`；`done` 章节不能直接激活历史版本，必须先通过状态接口回退到 `drafting`。
- 写作页切换章节历史版本必须先预览再激活；有未保存修改时禁止激活历史版本，生成/优化接口响应中的 `saved_version` / `active_version` 表示后端已保存并激活，前端应刷新章节详情而不是继续提示“确认后保存”。
- 写作页章节版本比较的段落 diff 可以将相似删除/新增段落合并为 changed 块，但配对和渲染必须保持旧版与新版各自的原文段落顺序；不要用纯“最高相似度优先”的非单调贪心配对导致任一侧段落倒序。
- `PATCH /api/chapters/{chapter_id}/status` 是章节状态修改的唯一入口，请求体包含 `status` 和 `expected_status`；合法流转为 `planned -> drafting`、`drafting -> planned`、`drafting -> done`、`done -> drafting`。状态修改只改状态、标记 vector dirty，不创建任何 `ProjectTask`。
- `PUT /api/chapters/{chapter_id}` 只保存标题、计划、正文和摘要；请求体只要包含 `status` 就返回 `details.reason=chapter_status_update_requires_status_endpoint`。已定稿章节仍默认只读，直接通过 `PUT` 修改内容返回 `details.reason=chapter_done_readonly`。
- 前端写作页状态修改必须使用状态徽标和合法动作按钮，不能使用状态下拉框或把 `status` 放入保存 payload；有未保存内容修改时应先保存，`done -> drafting` 必须二次确认。
- 任务中心展示 `ProjectTask.kind` 时应显示中文任务类型并保留原码值，例如“世界书自动更新（worldbook_auto_update）”，未知 kind 原样显示码值。
- 前端章节非流式生成 `POST /api/chapters/{chapter_id}/generate` 不应使用通用 `apiClient` 120 秒默认超时；应读取当前 LLM preset 的 `timeout_seconds` 并增加响应处理余量。否则请求可能在后端 LLM 调用成功前被浏览器中止，nginx 记录为 499，编辑器也不会收到生成内容。
- 前端所有同步等待 LLM 完整结果的 JSON POST（例如章节分析/改写、记忆提议、Fractal v2 重建、LLM 连接测试）都应使用 `frontend/src/lib/llmRequestTimeout.ts` 的 `buildLlmJsonRequestInit` 或同等 helper，把浏览器请求超时设为 `timeout_seconds * 1000 + 60000`；只创建后台任务的接口和 SSE 流式接口不套用该固定超时。

## StoryMemory 与伏笔生命周期约定

- 结构化记忆章节提议进入 `memory_change_sets` 前必须走服务层统一规范化，不能只依赖 prompt：小说人物 `entity_type` 统一为 `character`，`person`/`people`/`human`/`人物`/`角色` 都视为同义；`relation_type`、`event_type`、`evidence.source_type` 统一为小写 snake_case，ID/名称/source_id 去首尾空白，`attributes` 只保留 JSON object、去空 key、字符串值 trim。
- `memory_update_v1` 默认资源提示词必须提供 `existing_entities_json`，包含同项目未删除实体的 `id/entity_type/name/summary_md` 精简列表；服务层仍是最终边界，旧项目 prompt preset 未重置时也必须规范化后再保存 change_set item。
- 历史同名 `person`/`character` 结构化实体清理使用 `backend/scripts/normalize_memory_entities.py --project-id <id>` 先 dry-run；只有确认计划后才加 `--apply`。清理逻辑应优先保留 `character`，更新 `relations` 和 `evidence(source_type='entity')` 引用，软删除重复实体并标记索引脏。
- 结构化记忆 `memory_change_sets` 的 `relations.from_entity_id/to_entity_id` 必须在 propose 阶段解析到同项目未删除的 `entities.id`，或解析到同一变更集内新建实体的 `target_id` / `after.name`；遇到无法解析的引用（例如模型自造拼音、英文 slug）应拒绝整个变更集并返回 `VALIDATION_ERROR`，不要允许生成稍后 apply 才触发外键错误的 change_set，也不要部分应用其余条目。
- 章节记忆提议 `POST /api/chapters/{chapter_id}/memory/propose` 必须拒绝明显绑定其他章节的结构化条目：`events.chapter_id`、`foreshadows.chapter_id/resolved_at_chapter_id`、`evidence.source_type=chapter` 的 `source_id` 只能为空或等于路径章节 ID；前端切换章节时也必须清空并失效旧提议，避免把上一章 `MemoryChangeSetItem` 重新提交到当前章节。
- `story_memories.scope` 的合法值为 `outline`、`project`、`unassigned`；`scope=outline` 必须带同项目 `outline_id`，`project`/`unassigned` 不应带 `outline_id`。
- 历史或无法判断来源的 `chapter_id=NULL` StoryMemory 应归为 `unassigned`，默认不参与章节生成注入；只有 `scope=project` 或 `scope=outline AND outline_id=当前章节大纲` 可以进入 StoryMemory/semantic_history/foreshadow/vector_rag 注入。
- 删除 StoryMemory 时先定点删除派生索引，再删除源记录：`search_documents(source_type='story_memory', source_id=id)` 与 `vector_chunks(source='story_memory', source_id=id)`；单条/批量删除不触发全量 `search_rebuild` 或 `vector_rebuild`。
- 修改 StoryMemory 内容时不能保留旧向量 chunk；应删除该记忆旧 `vector_chunks` 并标记 vector dirty，搜索索引用单条 upsert 同步。
- 修改 StoryMemory 作用域或大纲归属时，应同步 `search_documents.locator_json` 和 `vector_chunks.metadata_json` 中的 `scope/outline_id`，避免搜索/RAG 排障视图与生成注入规则不一致。
- StoryMemory 派生索引同步服务在同一写事务内判断 `vector_chunks` 等表是否存在时，不要使用 SQLAlchemy `inspect(bind).has_table(...)`；SQLite 测试环境中它可能干扰已 flush 未 commit 的 StoryMemory 作用域更新。应使用当前 Session 执行普通 SQL 表探测。
- 伏笔时间线页面使用 `GET /api/projects/{project_id}/story_memories/foreshadows/open_loops`，数据来源是 `story_memories` 表中 `is_foreshadow=1` 且未回收的记录，不是结构化记忆表 `foreshadows`。
- `StoryMemory.chapter_id` 是章节派生记忆的来源字段；删除大纲、覆盖重建章节、删除单章时，应先删除命中这些 `chapter_id` 的 `StoryMemory`，避免旧章节伏笔变成无来源 open loop 继续展示。
- 用户手动创建或历史遗留的 `chapter_id=NULL` StoryMemory 不应默认进入伏笔时间线；伏笔时间线只展示仍有关联章节来源的未回收伏笔。

## Trellis 任务约定

- 当前 `.trellis/scripts/task.py list` 支持 `--mine` / `-m` 查看当前开发者任务，支持 `--status` / `-s` 按状态过滤；不支持 `--assignee` 参数。
