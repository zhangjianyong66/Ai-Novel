# 后端日志规范

## 日志系统

日志由 `backend/app/core/logging.py` 配置：

- 使用 Python `logging.getLogger("ainovel")` 获取 logger。
- 通过 `log_event(logger, level, **fields)` 输出结构化 JSON。
- `configure_logging()` 把 uvicorn、fastapi、httpx、sqlalchemy 等日志接入 loguru。
- 每个请求由 `request_id_and_logging_middleware` 注入 `X-Request-Id`。

参考：`backend/app/main.py`、`backend/tests/test_logging_setup.py`。

## 日志字段

常见字段：

- 请求：`path`、`method`、`status_code`、`latency_ms`、`request_id`
- 事件：`event`、`action`、`reason`
- 错误：`error_code`、`exception_type`、`exception_hash`
- 上游调用：`provider`、`model`、`base_url_host`、`timeout_seconds`、`latency_ms`

`log_event` 会自动补当前 request id。不要手动 JSON dump 日志行。

## 级别约定

- `info`：正常请求、迁移执行、关键后台任务状态。
- `warning`：业务可恢复失败、校验失败、权限失败、dev-only bootstrap 跳过。
- `error`：数据库错误、未处理异常、迁移锁超时、后台任务不可恢复失败。
- `debug`：仅用于临时或低风险诊断；提交前确认不会输出敏感数据。

## 脱敏要求

敏感信息统一由 `redact_secrets_text`、`safe_log_details`、`exception_log_fields` 处理。已覆盖：

- URL query 中的 `key` / `api_key` / `token`
- URL credentials
- OpenAI 样式 key、Google API key
- Bearer token
- `x-llm-api-key`

测试：`backend/tests/test_logging_redaction.py`、`backend/tests/test_secrets_redaction.py`。

## 避免

- 不要记录明文 API Key、Authorization、cookie、完整数据库 URL 凭据。
- 不要把任意 `details` 全量传给日志；使用 `safe_log_details` 白名单。
- 不要开启 httpx/httpcore 请求级 info 日志，Gemini 等 provider 可能把 key 放在 query。
