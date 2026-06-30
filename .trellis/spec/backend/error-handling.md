# 后端错误处理

## 统一错误类型

业务错误使用 `backend/app/core/errors.py` 的 `AppError`：

- `AppError.validation(...)` -> 400
- `AppError.unauthorized(...)` -> 401
- `AppError.forbidden(...)` -> 403
- `AppError.not_found(...)` -> 404
- `AppError.conflict(...)` -> 409

`AppError` 的 `str(err)` 固定返回 message，测试见 `backend/tests/test_app_error_str.py`。

## API 响应契约

成功响应使用：

```python
ok_payload(request_id=request.state.request_id, data={...})
```

失败响应由 `backend/app/main.py` 的异常处理器统一包装：

```json
{"ok":false,"error":{"code":"...","message":"...","details":{}},"request_id":"..."}
```

前端 `frontend/src/services/apiClient.ts` 依赖这个契约构造 `ApiError`，不要改变顶层字段名。

## 权限和资源存在性

- 当前用户依赖：`UserIdDep` 和 `AuthenticatedUserIdDep`。
- 项目权限检查集中在 `backend/app/api/deps.py`。
- 跨项目访问失败时，`require_project_access` 对无成员关系返回 404，降低资源存在性泄露。
- 角色顺序是 `viewer < editor < owner`。

## 校验错误

FastAPI/Pydantic 的 `RequestValidationError` 被统一转换为 `VALIDATION_ERROR`，HTTP 状态码是 400。日志和响应只保留 `loc`、`msg`、`type`，避免把原始输入完整打出。

请求 schema 应继承项目已有的 `RequestModel`（见 `backend/app/schemas/base.py`），并用 Pydantic `Field` 描述长度、范围和默认值。

## 上游和未知错误

- `SQLAlchemyError` 统一返回 `DB_ERROR`，HTTP 500。
- 未捕获异常统一返回 `INTERNAL_ERROR`，HTTP 500。
- LLM/外部 provider 错误必须先清洗细节，再进入 `AppError.details` 或日志。参考 `backend/app/llm/upstream_errors.py`、`backend/app/core/logging.py`。

## 避免

- 不要在 endpoint 中返回临时 `{ "error": "..." }` 或裸字符串错误。
- 不要把异常对象、traceback、上游原始响应直接返回给前端。
- 不要用 403 暴露其他项目资源是否存在；跨项目资源默认 fail-closed 为 404。
