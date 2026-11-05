# Changelog

本项目的所有重要变更记录在此文件，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.1] — 2026-11-05

> 主题：**生成稳定性修复**。针对真实模型（reasoning 型）在复杂 prompt（如「帮我做个2048小游戏」）下出现的「工具参数被截断 / 长时间静默 / reasoning-only 硬失败」做定向修复；功能与接口保持向后兼容。

### Fixed

- **输出被截断（`finish_reason="length"`，tool args JSON 不完整）**：不再把非法 JSON 作为失败步骤渲染红叉；loop 自动提高输出预算（默认 24000→32000）重试该轮，工具层仍收到明确错误、模型下一轮补完。
- **reasoning-only 零可见输出**（输出预算被隐藏推理吃满）：识别为截断类错误并自动升预算重试；重试耗尽后若有文件 → partial done，0 文件才返回 error（文案提示提高输出预算 / 降低 reasoning effort）。
- **长时间静默**：每次模型请求前发 `status`（文件名/步骤/输出预算），长 reasoning 每 ~10s 一条「已用时 m:ss …」心跳；前端状态条显示 elapsed + statusHint，长静默 >20s 显示兜底文案，完成后清理。
- **大文件写入**：`write_file` 支持 `mode:"append"` 分段写入，prompt 约束单次可见输出 <~6000 tokens，避免单次 completion 被预算截断。
- `minimal` reasoning 档位映射为 `low`，避免网关在 reasoning 模型上把预算全花在隐藏推理。

### Added

- 新环境变量：`LLM_CODING_MAX_TOKENS_CAP`（默认 32000，8000–32000 clamp）、`LLM_TRUNCATION_RETRIES`（默认 2，0–4 clamp；0 = 关闭自动重试）。
- 默认 `LLM_CODING_MAX_TOKENS` 从 12000 调整为 **24000**（给 reasoning 留头寸）。
- `scripts/truncation-probe.mjs`：截断取证脚本（直接打 `/api/chat`，打印 `finish_reason`/usage/tool args JSON 合法性）。
- `scripts/agent-smoke.mjs` 新增截断重试 / append 分段 / partial done / reasoning-only 用例。

### Changed

- 生成重试次数与预算可在部署侧配置；partial done 的完成文案会注明「输出被截断、可继续对话补完」。
- 真实生成耗时区间上探（含自动重试约 100–150s；此前复杂 2048 用例曾出现 165s 硬失败）。

### Docs

- PRODUCT：§8.3 Token 预算（新 env）、§10.2 超时/心跳、§10.4 失败降级（截断重试/partial done）、§11 测试策略（truncation-probe）；FAQ 新增「输出被截断 / 生成很慢」；DEPLOY/README/.env.example 同步新环境变量。

## [0.2.0] — 2026-11-05

> 主题：**易用性 / 功能性提升 + 详细产品文档**。v0.1 的核心生成链路保持不变，本轮围绕「更好用、更可观测、更可交付」做增强。

### Added — 服务端

- **`GET /api/status`**：返回运行模式、模型、服务端密钥状态、当前 IP 剩余演示额度与重置时间、限流配置、应用版本。
- **SSE `usage` 事件**：生成结束前返回 token 用量（`promptTokens` / `completionTokens` / `cachedTokens` / `reasoningTokens`），解析三种上游字段（`prompt_tokens_details.cached_tokens`、`opencode.tokens.cache_read`、`completion_tokens_details.reasoning_tokens`）。
- **`X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`** 响应头（服务端密钥模式）。
- **`POST /api/prompt/enhance`**：把一句话需求扩写为可投喂生成 Agent 的完整需求（BYOK → 服务端 key → mock 兜底；`PROMPT_ENHANCE_MAX_TOKENS` 默认 2400（800–4000 clamp）、`temperature 0.3`、`PROMPT_ENHANCE_PER_HOUR` 默认 30 次/小时/IP 限流）。
- **限流模块化**：`/api/chat` 的每 IP 配额与并发保护抽成共享模块，与 `/api/status` 共用同一份计数。
- **`reasoningEffort` 请求参数**（`low/medium/high/max`）：优先级高于 `provider.reasoningEffort` 与服务端默认。
- `stream_options.include_usage`：上游不支持时自动降级重试一次（但不影响主流程）。
- **`scripts/cache-probe.mjs`**：真实 provider 的 prompt cache 实测脚本（同一 session 发两次递增前缀请求，打印 cached tokens）。

### Added — 客户端体验

- **快捷键体系**：`?` 打开快捷键面板；`mod+k` 聚焦输入框；`mod+Enter` 发送；`Esc` 停止生成/关闭浮层；`mod+shift+n` 新建应用；`mod+.` 停止生成。
- **统一 Toast 反馈**：分享/复制/导出/保存设置/导入导出/提示词增强等所有成功与失败操作均有反馈。
- **消息操作**：assistant 消息支持复制 / 重新生成 / 查看用量；user 消息支持编辑并重发；错误消息支持重试。
- **项目侧栏增强**：搜索（名称/消息内容）、排序（最近更新/创建时间）、复制项目、导出/导入项目 JSON、删除全部项目。
- **灵感库**：示例 prompt 按分类展示（效率工具/数据看板/小游戏/展示页），支持「换一批」。
- **「帮我扩写」**：Composer 调用 `/api/prompt/enhance` 把一句话需求写回输入框。
- **设置增强**：模型预设（DeepSeek 直连 / OpenCode Go / 自定义）、质量-速度档（reasoningEffort）、服务端状态卡片（模式/模型/剩余额度/限流）、「测试连接」。
- **预览四个 tab**：预览 / 控制台 / **代码** / 版本。
- **代码浏览器**：文件树、源码查看（行号/等宽）、单文件复制/下载、复制全部、下载 ZIP。
- **版本 diff**：版本卡片「对比」→ 文件级新增/删除/修改 + 行级 `+/-` 差异，显示变更统计（纯前端实现，无新依赖）。
- **全屏预览**：覆盖视口沉浸预览，`Esc` 退出，保留设备切换/刷新。
- **控制台增强**：级别筛选（全部/log/warn/error）、错误计数徽标、复制日志、自动滚动开关。
- **用量与额度展示**：预览区显示最近一次生成的「输入 / 缓存命中 / 输出 tokens」；服务端密钥模式显示剩余演示额度。
- **390px 适配**：新增控件在移动端可用不溢出。

### Changed

- `package.json` 版本升至 `0.2.0`。
- 生成流程支持 `reasoningEffort` 覆盖；默认模型配置更新为 **OpenCode Go + DeepSeek V4.1 Flash**（`deepseek-v4.1-flash`），保留 DeepSeek 直连兼容。
- `/api/chat` 的限流计数与 `/api/status` 统一；限流文案更友好（提示 BYOK 与重试时间）。
- 生成结束（含错误恢复）后自动刷新配额状态。

### Fixed

- 校验器外链误报：对 SVG 命名空间等**标识符 URL**（`http://www.w3.org/...`）加白名单，不再误判为外部资源引用。
- 部分上游网关不支持 `stream: true` 时自动解析整包 JSON 响应。
- `settings` 旧数据兼容：缺少 `reasoningEffort` 字段时按默认值加载。

### Docs

- 新增 **`docs/PRODUCT.md`**：产品定位/用户旅程/功能矩阵/交互设计/状态机与错误处理/架构与 SSE 协议/数据模型/模型与成本（含 prompt cache 实测）/配置/性能/测试策略/限制/路线图。
- 新增 **`docs/API.md`**：四个接口的完整参考（请求/响应/SSE 事件/错误码/限流头/curl 示例）。
- 新增 **`docs/CHANGELOG.md`**（本文件）与 **`docs/FAQ.md`**。
- README 功能矩阵、截图、文档索引、快捷键章节同步；DEPLOY 补充新环境变量、额度说明与部署验证。
- `scripts/smoke.mjs` 覆盖新端点（`/api/status`、`/api/prompt/enhance`）与 `usage` 事件、限流头。

## [0.1.0] — 2026-11-04

> 主题：**首个可交付版本** —— AI Agent 驱动的应用生成 + 实时预览完整闭环。

### Added

- **核心生成**：一句话需求 → 服务端 Agent（规划 → 工具写码 → 校验 → 最多 2 轮自动修复）→ 生成 `index.html` / `styles.css` / `app.js` 自包含静态应用。
- **SSE 流式协议**：`phase` / `status` / `plan` / `tool_start` / `file_delta` / `file_done` / `tool_result` / `assistant_delta` / `validation` / `done` / `error`。
- **实时预览**：`buildPreviewDocument` 内联 CSS/JS 后注入 `iframe srcDoc + sandbox`；控制台桥捕获 iframe `console`/运行时错误。
- **多轮迭代**（refine）：携带当前源码继续修改，预览实时更新。
- **版本历史**：每次生成保存快照，支持一键恢复。
- **持久化**：项目/消息/版本/设置存浏览器 IndexedDB，刷新恢复，无需注册。
- **分享 / 导出**：URL fragment 压缩编码分享链接；导出单文件 HTML 或 ZIP。
- **设备预览**：桌面/平板/手机视口切换。
- **mock 演示模式**：无 key 时确定性 mock agent 产出完整事件流与高质量示例应用。
- **BYOK**：设置里填自己的 OpenAI 兼容 Base URL/模型/Key（仅存本地、随请求转发）。
- **模型接入**：OpenAI 兼容 function calling（DeepSeek 默认）；OpenCode Go 一等支持（`x-opencode-session` 会话头、UA、reasoning effort、token 预算）。
- **公开演示保护**：服务端密钥模式下每 IP 每小时配额（默认 12）与并发生成上限（默认 2），超限返回 429。
- **可观测性**：`GET /api/config` 能力探测；`scripts/agent-smoke.mjs` 引擎离线冒烟；`scripts/smoke.mjs` HTTP 冒烟；`scripts/tunnel.ps1` 公网隧道。
- **文档**：README、`docs/CONTRACT.md`、`docs/PLAN.md`、`docs/SUBMISSION.md`、`docs/DEPLOY.md`。
- **部署**：Vercel（首选）/ Netlify / Render / Docker 自托管；cloudflared quick tunnel 临时演示链接。
