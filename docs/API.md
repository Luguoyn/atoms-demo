# Atoms Demo API 参考（v0.2）

> 服务端为 Next.js Route Handlers（Node runtime），**无状态**、无鉴权（公开演示）。所有响应均为 JSON（`/api/chat` 为 SSE 流）。
> 类型定义见 [`src/types.ts`](../src/types.ts)；产品/架构说明见 [PRODUCT.md](./PRODUCT.md)。

- Base URL（本地）：`http://localhost:3000`
- 约定：请求/响应 `Content-Type: application/json; charset=utf-8`；错误响应体统一为 `{ "error": "人类可读的错误信息" }`，并带 `Cache-Control: no-store`。
- 版本：路由返回的 `version` 字段来自 `package.json`（当前 `0.2.0`）。

| 方法 | 路径 | 说明 | 可能状态码 |
|---|---|---|---|
| GET | `/api/config` | 能力探测（是否有服务端 key / 是否 mock / 默认模型） | 200 |
| GET | `/api/status` | 服务端状态、模式、配额与限流信息 | 200 |
| POST | `/api/chat` | **SSE** 流式生成（核心接口） | 200 / 400 / 429 / 500 |
| POST | `/api/prompt/enhance` | 一句话需求扩写为可投喂 Agent 的完整需求 | 200 / 400 / 429 / 500 |

---

## 1. GET /api/config

能力探测，**不返回任何密钥**，只返回布尔能力位。客户端启动时调用一次。

### 响应 `ServerConfig`

```json
{
  "hasServerKey": true,
  "mockMode": false,
  "defaultModel": "deepseek-v4.1-flash"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `hasServerKey` | boolean | 服务端是否配置了可用的 `LLM_API_KEY` |
| `mockMode` | boolean | 是否走 mock（无 key 或 `MOCK_LLM=1`） |
| `defaultModel` | string | 默认模型名 |

### curl

```bash
curl -s http://localhost:3000/api/config
```

---

## 2. GET /api/status

服务端状态 + 当前调用方的演示配额。设置弹窗与预览区额度展示使用。

### 响应 `ServerStatus`

```json
{
  "mode": "server-key",
  "model": "deepseek-v4.1-flash",
  "hasServerKey": true,
  "mockForced": false,
  "serverKeyReason": "ok",
  "quota": { "limitPerHour": 12, "remaining": 11, "resetAt": 1762300000000 },
  "rateLimits": { "perHour": 12, "concurrent": 2 },
  "version": "0.2.0"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `mode` | `"server-key" \| "byok" \| "mock"` | 当前模式。BYOK 需要客户端在请求里带 key，因此本接口按「无 BYOK 上下文」返回服务端视角的模式（`server-key` 或 `mock`） |
| `model` | string | 默认模型名 |
| `hasServerKey` | boolean | 是否有服务端密钥 |
| `mockForced` | boolean | 是否 `MOCK_LLM=1` 强制 mock |
| `serverKeyReason` | `"ok" \| "no-key" \| "mock-forced"` | 服务端不用的原因 |
| `quota` | `{ limitPerHour, remaining, resetAt } \| null` | 当前 IP 的剩余演示额度；`resetAt` 为 Unix ms。非服务端密钥模式为 `null` |
| `rateLimits` | `{ perHour, concurrent }` | 服务端限流配置（与 `/api/chat` 同一来源） |
| `version` | string | 应用版本（来自 `package.json`） |

> 配额按请求 IP 统计（`cf-connecting-ip` → `x-forwarded-for` → `x-real-ip` → 本地）；内存实现，进程重启清零。

### curl

```bash
curl -s http://localhost:3000/api/status
```

---

## 3. POST /api/chat（SSE）

服务端 Agent 主入口：接收一次生成/迭代请求，返回 **Server-Sent Events** 流。

### 请求头

| 头 | 值 | 必需 |
|---|---|---|
| `Content-Type` | `application/json` | ✅ |
| `Accept` | `text/event-stream` | 建议 |

### 请求体 `ChatRequest`

```json
{
  "projectId": "proj_abc123",
  "message": "做一个番茄钟：开始/暂停/重置，支持任务清单和本地持久化",
  "files": {},
  "history": [
    { "role": "user", "content": "上一轮需求" },
    { "role": "assistant", "content": "上一轮回复" }
  ],
  "mode": "generate",
  "reasoningEffort": "low",
  "provider": {
    "baseUrl": "https://api.deepseek.com",
    "model": "deepseek-chat",
    "apiKey": "sk-..."
  }
}
```

| 字段 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `projectId` | string | 建议 | 项目 ID（最长 120 字符）；缺省 `anonymous`。用于日志/限流与 prompt cache session 派生 |
| `message` | string | ✅ | 用户需求（trim 后非空，最长 8000 字符） |
| `files` | `Record<string,string>` | 建议 | 当前应用源码；首次生成传 `{}`，迭代（refine）传现有文件（≤24 个，单文件 ≤200KB，总量 ≤600KB 字符） |
| `history` | `ChatTurn[]` | 否 | 历史对话（最多 20 轮，每条 ≤4000 字符），oldest first |
| `mode` | `"generate" \| "refine"` | 否 | `files` 为空时 `generate`，迭代用 `refine`；缺省 `generate` |
| `reasoningEffort` | `"low" \| "medium" \| "high" \| "max"` | 否 | 质量-速度档位，**优先于** `provider.reasoningEffort` 与服务端默认。服务端 `LLM_REASONING_EFFORT=minimal` 会被映射为 `low`（`minimal` 在 reasoning 模型上可能吃满预算、零可见输出） |
| `provider` | `ProviderOverride` | 否 | BYOK：`{ baseUrl?, model?, apiKey?, reasoningEffort? }`。仅本次请求使用，不落盘 |

### 响应

- 状态码：`200`（流开始后若中途失败，以 `error` 事件结束而不是改状态码）
- 响应头：

```
content-type: text/event-stream; charset=utf-8
cache-control: no-cache, no-transform
connection: keep-alive
x-accel-buffering: no
x-ratelimit-limit: 12          # 仅服务端密钥模式
x-ratelimit-remaining: 11
x-ratelimit-reset: 1762300000  # Unix 秒
```

- 流格式：每个事件 `data: <json>\n\n`（JSON 为单行，无 `event:` 字段）

### 事件序列（正常生成）

```
phase(planning) → plan → phase(coding)
  → [file] tool_start(write_file) → file_delta* → file_done → tool_result
  → phase(validating) → validation
  → [可选 phase(fixing) → tool_start/file_delta/file_done/tool_result → validation]
  → usage → done
```

失败时：`error`（流随后结束）。客户端断开会中止上游请求。

### 事件类型（`AgentEvent`）

| type | 载荷 | 说明 |
|---|---|---|
| `phase` | `{ phase: "planning"\|"coding"\|"validating"\|"fixing"\|"done", label: string }` | 阶段切换，`label` 可直接展示 |
| `status` | `{ message: string }` | 补充进度提示；每次模型请求前一条（含文件名/步骤/预算），长 reasoning 每 ~10s 一条「已用时 m:ss …」心跳 |
| `plan` | `{ plan: AppPlan }` | 实现计划（`name/summary/features/files[]`） |
| `tool_start` | `{ id, tool, label }` | 工具调用开始（`tool` 为 `write_file`/`read_file`/`list_files`/`delete_file`/`finish`） |
| `file_delta` | `{ path, delta }` | 文件内容流式片段 |
| `file_done` | `{ path, content }` | 单文件完成（完整内容） |
| `tool_result` | `{ id, ok, summary }` | 工具调用结束 |
| `assistant_delta` | `{ delta }` | 助手自然语言输出片段 |
| `usage` | `{ usage: GenerationUsage }` | **在 `done` 之前**发送的 token 用量（含缓存命中） |
| `validation` | `{ ok, issues: ValidationIssue[] }` | 校验结果（`issues[].severity: "error"\|"warning"`） |
| `done` | `{ files, plan?, summary, stats: { steps, mock } }` | 生成完成，`files` 为最终产物 |
| `error` | `{ message, retryable? }` | 失败（鉴权/网络/超时/校验不可用等） |

`GenerationUsage`：

```json
{
  "model": "deepseek-v4.1-flash",
  "promptTokens": 18234,
  "completionTokens": 4210,
  "cachedTokens": 12800,
  "reasoningTokens": 512,
  "totalTokens": 22956
}
```

> 上游没给到的字段填 `0`（`reasoningTokens`/`totalTokens` 可缺省）；mock 模式按产物估算、`cachedTokens=0`。

### 错误响应（JSON，非 SSE）

| 状态码 | 场景 | 响应体示例 | 响应头 |
|---|---|---|---|
| `400` | 请求体非法 JSON / message 为空 / 过长 / files 超限 | `{"error":"message 不能为空。"}` | `Cache-Control: no-store` |
| `429` | 本 IP 每小时演示额度用尽 | `{"error":"这个 IP 本小时的演示生成额度已用完（上限 12 次/小时）…"}` | `Retry-After: <秒>` |
| `429` | 并发生成数超限 | `{"error":"当前同时在生成的人较多（并发上限 2）…"}` | `Retry-After: 10` |
| `500` | 未预期异常（极少；流式错误走 `error` 事件） | `{"error":"生成失败，请重试。"}` | — |

> 429 只对**使用服务端密钥**的请求生效；BYOK（请求体 `provider.apiKey`）不计配额、不受并发限制。

### curl 示例

```bash
# 生成（mock 或服务端密钥模式）
curl -N -s -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{
    "projectId": "demo",
    "message": "做一个极简待办清单，支持添加/完成/删除和本地持久化",
    "files": {},
    "history": [],
    "mode": "generate"
  }'

# 迭代（refine）：把当前文件传回去
curl -N -s -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "projectId": "demo",
    "message": "把主色改成绿色，并加一个深色模式",
    "files": { "index.html": "…", "styles.css": "…", "app.js": "…" },
    "history": [{ "role": "user", "content": "做一个极简待办清单" }],
    "mode": "refine",
    "reasoningEffort": "low"
  }'

# BYOK（自带 key，不消耗演示额度）
curl -N -s -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "projectId": "byok",
    "message": "做一个记账本",
    "files": {},
    "history": [],
    "mode": "generate",
    "provider": { "baseUrl": "https://api.deepseek.com", "model": "deepseek-chat", "apiKey": "sk-你的key" }
  }'
```

---

## 4. POST /api/prompt/enhance

把用户的一句话需求扩写成**可直接投喂生成 Agent 的完整需求**（保留用户语言），并给出 2–3 条写作 tips。

- Provider 解析顺序：BYOK → 服务端 key → mock（mock 返回确定性模板增强结果，响应 `mock: true`）。
- 增强不消耗生成配额，但受每 IP 独立限流（默认 **30 次/小时**，`PROMPT_ENHANCE_PER_HOUR`）。
- `max_tokens ≤ 600`、`temperature = 0.3`。

### 请求体 `PromptEnhanceRequest`

```json
{
  "message": "做一个番茄钟",
  "provider": { "apiKey": "sk-...", "baseUrl": "https://api.deepseek.com", "model": "deepseek-chat" },
  "reasoningEffort": "low"
}
```

| 字段 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `message` | string | ✅ | 原始需求（trim 后非空） |
| `provider` | `ProviderOverride` | 否 | BYOK 覆盖（同上） |
| `reasoningEffort` | `ReasoningEffort` | 否 | 质量档 |

### 响应 `PromptEnhanceResponse`

```json
{
  "enhanced": "做一个简洁的番茄钟专注计时器：25 分钟专注 + 5 分钟休息自动切换；支持开始/暂停/重置；今日完成数与专注总时长统计；任务清单可添加、勾选完成；数据保存在 localStorage；深色主题、移动端响应式、中文界面。",
  "tips": [
    "明确核心交互（开始/暂停/重置）",
    "说明数据持久化方式（localStorage）",
    "补充视觉风格与移动端要求"
  ],
  "mock": false
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `enhanced` | string | 增强后的完整需求（可直接作为 `/api/chat` 的 `message`） |
| `tips` | string[] | 2–3 条改进建议 |
| `mock` | boolean | 是否 mock 生成 |

### 错误

| 状态码 | 场景 | 响应体 | 响应头 |
|---|---|---|---|
| `400` | message 为空 / 过长（>2000 字）/ 请求体非法 | `{"error":"message 不能为空。"}` | `Cache-Control: no-store` |
| `429` | 增强请求过于频繁（默认 30 次/小时/IP） | `{"error":"提示词扩写次数已达上限（30 次/小时），请稍后再试。"}` | `Retry-After`、`X-RateLimit-Reset` |
| `502` | 模型服务鉴权失败 / 上游错误 | `{"error":"模型服务鉴权失败（HTTP 401）…请检查模型设置中的 API Key。"}` | `Cache-Control: no-store` |
| `504` | 模型响应超时 | `{"error":"提示词扩写超时，请稍后重试。"}` | `Cache-Control: no-store` |
| `500` | 其他未预期异常 | `{"error":"提示词扩写失败，请稍后重试。"}` | `Cache-Control: no-store` |

> 增强失败是**非致命**的：客户端保留用户原文并 toast 提示，不影响后续生成。

### curl

```bash
curl -s -X POST http://localhost:3000/api/prompt/enhance \
  -H 'Content-Type: application/json' \
  -d '{"message":"做一个番茄钟"}'
```

---

## 5. 错误码与限流约定（速查）

| 状态码 | 含义 | 客户端建议 |
|---|---|---|
| 200 | 成功（`/api/chat` 为流式 200） | 解析 SSE |
| 400 | 请求参数错误 | 修正输入（消息过长/文件过大/JSON 非法） |
| 429 | 限流 / 配额用尽 | 读 `Retry-After` 等待；提示用户 BYOK 或稍后再试 |
| 500 | 服务端异常 | 可重试；记录错误信息 |
| 流内 `error` 事件 | 生成失败（鉴权/网络/超时/校验不可用） | 展示文案 + 重试按钮；`retryable` 为 true 时可重试 |

**限流口径**

| 限制 | 默认 | 环境变量 | 响应头/字段 |
|---|---|---|---|
| 服务端密钥生成次数 | 12 次/小时/IP | `RATE_LIMIT_PER_HOUR` | `X-RateLimit-Limit/Remaining/Reset`、`/api/status.quota` |
| 并发生成数 | 2 | `RATE_LIMIT_CONCURRENT` | 429 + `Retry-After: 10` |
| 提示词增强 | 30 次/小时/IP | `PROMPT_ENHANCE_PER_HOUR` | 429 + `Retry-After`、`X-RateLimit-Reset` |

> 限流只在 **`mode === "server-key"`**（请求未带 BYOK key 且服务端有 key）时生效；mock 与 BYOK 请求不受配额与并发限制。

> 客户端 IP 识别顺序：`cf-connecting-ip` → `x-forwarded-for`（第一个） → `x-real-ip` → `local`。

**安全说明**

- 服务端不会在响应、日志、错误信息中输出 API key（provider 层统一脱敏为 `sk-***`）。
- BYOK 的 key 仅在本次请求内存中使用；本服务不落盘、不缓存。
- `/api/config`、`/api/status` 不包含任何密钥信息。
