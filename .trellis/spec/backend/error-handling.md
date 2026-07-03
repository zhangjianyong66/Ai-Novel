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

## 生成子步骤解析失败

### 1. Scope / Trigger

- 适用于章节生成、规划、润色、优化等 LLM 子步骤的结构化输出契约解析失败。
- 如果后续步骤依赖该子步骤的结构化结果，解析失败必须 fail-fast，不能用空结果继续执行。

### 2. Signatures

- 独立规划接口：`POST /api/chapters/{chapter_id}/plan`
- 章节生成接口：`POST /api/chapters/{chapter_id}/generate`
- 流式章节生成接口：`POST /api/chapters/{chapter_id}/generate-stream`

### 3. Contracts

- 非流式接口使用 `AppError`，由全局异常处理器返回统一错误响应。
- 流式接口使用 `sse_error(...)` 后立即 `sse_done()` 并 `return`。
- 规划解析失败统一使用 `code="PLAN_PARSE_ERROR"`，`details.reason="plan_parse_failed"`，并在 `details.parse_error` 中保留底层解析器错误码和 message。

### 4. Validation & Error Matrix

- `plan_chapter` 返回 `parse_error != None` -> `PLAN_PARSE_ERROR` / HTTP 400。
- 流式 `plan_first=true` 中规划解析失败 -> SSE `event:error`，不再发送章节正文 token，不再继续渲染章节提示词。
- 非流式 `plan_first=true` 中规划解析失败 -> `AppError`，不调用正文生成、润色或优化步骤。

### 5. Good/Base/Bad Cases

- Good：`<plan>...</plan>` 完整输出，注入规划后继续生成正文。
- Base：规划输出为空或缺失完整标签，返回 `PLAN_PARSE_ERROR`，用户可调整模型输出上限或提示词后重试。
- Bad：捕获解析失败后继续生成正文，导致用户误以为规划已生效。

### 6. Tests Required

- 测试独立规划接口在 `parse_error` 时抛出 `AppError`。
- 测试非流式 `plan_first` 在 `parse_error` 时不调用正文生成。
- 测试流式 `plan_first` 在 `parse_error` 时发送失败 SSE，且错误文案不能暗示继续生成。

### 7. Wrong vs Correct

#### Wrong

```python
if plan_parse_error is not None:
    data["plan_parse_error"] = plan_parse_error
# 继续生成正文
```

#### Correct

```python
if plan_parse_error is not None:
    raise AppError(code="PLAN_PARSE_ERROR", message="规划解析失败", status_code=400, details={...})
```

## 避免

- 不要在 endpoint 中返回临时 `{ "error": "..." }` 或裸字符串错误。
- 不要把异常对象、traceback、上游原始响应直接返回给前端。
- 不要用 403 暴露其他项目资源是否存在；跨项目资源默认 fail-closed 为 404。
