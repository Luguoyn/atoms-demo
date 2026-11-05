# Atoms Demo — 提交说明文档

> 笔试要求附件：简要说明文档（实现思路与关键取舍 / 当前完成程度 / 如果继续投入时间的扩展与优先级）。

- **在线演示（临时链接）**：https://powered-mailman-kitty-keywords.trycloudflare.com
  - 默认使用服务端配置的模型（**OpenCode Go · DeepSeek V4.1 Flash**）真实生成，打开即可体验「生成→预览→迭代→版本→分享/导出」全流程。
  - v0.2 已包含：快捷键面板（`?`）、消息操作（复制/重试/重新生成/编辑重发）、分类灵感库与「帮我扩写」、代码浏览器、版本 diff、全屏预览、控制台筛选、项目搜索/导入导出、模型预设与质量-速度、用量与缓存命中展示、剩余演示额度显示。
  - 为防止公开链接被滥用，服务端做了轻量保护：每个 IP 每小时 12 次、最多 2 个并发生成；额度用完后可在右上角「模型设置」填自己的 OpenAI 兼容 Key（BYOK）继续使用。
  - 该链接是 cloudflared quick tunnel（本机为服务端），进程停止即失效；正式长期演示见 `docs/DEPLOY.md` 的 Vercel 部署步骤（记得设置 `LLM_*` 环境变量）。
- **源码仓库**：https://github.com/Luguoyn/atoms-demo （GitHub，公开）
- **产品文档**：[docs/PRODUCT.md](./PRODUCT.md)（产品/交互/状态机/SSE 协议/数据模型/缓存实测/测试策略）、[docs/API.md](./API.md)、[docs/FAQ.md](./FAQ.md)
- **本地复现**：`npm install && npm run dev`；不配密钥自动进入 mock 演示模式。

## 提交信息（粘贴到飞书笔试文档第 4 节前请确认）

- 部署的可测试链接：`https://powered-mailman-kitty-keywords.trycloudflare.com`
- 代码链接（GitHub）：`https://github.com/Luguoyn/atoms-demo`
- 说明文档：本文件 + 仓库 `docs/PRODUCT.md`

## 1. 这是什么

**Atoms Demo** 是一个「一句话生成可运行应用」的 AI 应用生成器：用户用自然语言描述想要的产品，服务端 Agent 会分析需求、产出实现计划、编写代码并自动校验/修复，随后在右侧实时渲染出可交互的网页应用；用户可以继续对话迭代，每次生成都会保存为可回滚的版本。所有数据存在浏览器本地（IndexedDB），无需注册；未配置模型密钥时自动进入演示模式，保证任何人都能完整体验流程。

技术栈：Next.js 15（App Router）/ React 19 / TypeScript / Tailwind CSS v4 / SSE 流式事件 / IndexedDB / iframe sandbox 预览。

## 2. 实现思路与关键取舍

### 2.1 生成链路：真 Agent，而不是一次 LLM 调用

```
用户消息 → 计划(plan) → 工具循环(write_file/read_file/finish) → 编译级校验 → 最多 1 轮自动修复 → 完成事件
```

- **事件协议先行**：`AgentEvent` 是一等契约（phase / plan / tool_start / file_delta / file_done / validation / done / error），服务端与前端通过 SSE 对齐，前端按事件渲染「计划卡 + 工具步骤流」，让生成过程可观察、可解释。
- **产物是自包含静态应用**（`index.html` + `styles.css` + `app.js`）：不需要在浏览器里跑构建器，天然沙箱化、可导出、可分享，预览体验也最接近真实产品。
- **服务端校验有可能比模型更可靠**：用 `node:vm` 做编译级 JS 语法检查（不执行）、检查 HTML 骨架与本地引用完整性；发现问题把 issues 回喂给模型修一轮，避免"看起来生成完了但预览白屏"。
- **mock 降级不是摆设**：无密钥时 mock agent 输出完整事件流并生成一个真实可用的示例应用，评测者打开链接即可走完整流程；界面上明确标注"演示模式"，填写自己的 key 后切换为真实生成。

### 2.2 状态与持久化

- 前端只有唯一状态源 `useBuilder()`（projects / messages / files / versions / console），所有写操作幂等、流式更新基于事件 reducer 思路。
- 数据落 IndexedDB：刷新页面项目、会话、版本、预览全部恢复，满足"数据持久化"且不依赖后端数据库——这也让 demo 可以部署在任意 serverless 平台。
- 生成中可中断（AbortController），中断/失败都有明确 UI 状态与重试路径。

### 2.3 预览与扩展能力

- `iframe srcDoc + sandbox` 渲染生成物；注入 console/error 桥，把运行时错误回传到"控制台"面板。
- 版本历史：每次生成一个版本，可一键恢复。
- 分享：把应用文件压缩编码进 URL fragment，链接即应用，无需后端存储。
- 导出：单文件 HTML 或 ZIP（含 README），方便带走。
- 设备切换：桌面/平板/手机视口，验证生成物的响应式质量。

### 2.4 取舍

| 取舍 | 原因 |
|---|---|
| 只生成静态应用（无后端/数据库） | 在 6-8h 内把"生成 → 预览 → 迭代 → 交付"做深，而不是把复杂度花在沙箱构建与托管上；静态应用已能覆盖工具/看板/游戏等多数 Demo 场景 |
| 单次最多 10 步、120s、单文件 200KB | 控制成本与延迟，避免失控长循环；失败时明确报错而不是无限重试 |
| 持久化放浏览器而非数据库 | 免注册、免运维、部署简单；分享用 URL 编码弥补跨设备需求 |
| 无密钥走 mock，而不是要求先配 key | 评测体验优先：打开链接即可看到完整闭环 |

## 3. 当前完成程度（v0.2）

- [x] 自然语言生成可运行应用（服务端 Agent + SSE 流式）
- [x] 实时预览（iframe / 设备切换 / 全屏 / 控制台）
- [x] 多轮迭代（refine 模式：携带当前源码继续改）
- [x] 项目与会话持久化（IndexedDB，刷新恢复）
- [x] 版本历史、回滚与**版本 diff**
- [x] 分享链接（URL 编码）与导出（单文件 HTML / ZIP / 项目 JSON 导入导出）
- [x] 无密钥演示模式 / BYOK 设置 / 服务端密钥模式 + 每 IP 演示额度
- [x] 响应式布局（桌面 / 移动）
- [x] 易用性：快捷键面板（`?`，mod+k 聚焦、Enter 发送、Esc 停止）、消息操作（复制/重试/重新生成/编辑重发）、分类灵感库 +「帮我扩写」、项目搜索/排序/复制/导入导出、Toast 反馈
- [x] 可观测性：SSE `usage` 事件 + UI 展示「输入 / 缓存命中 / 输出 / 推理 tokens」、剩余演示额度、控制台筛选
- [x] 产品文档：`docs/PRODUCT.md`（~52KB：产品/交互/状态机/SSE 协议/数据模型/prompt cache 实测/测试策略/路线图）、`docs/API.md`、`docs/FAQ.md`、`docs/CHANGELOG.md`
- [ ] 登录与多端同步（需求明确写了无需注册，未做）
- [ ] 生成应用接真实后端/数据库（当前生成物为静态应用，扩展方向见下）

## 4. 如果继续投入时间（优先级）

1. **P0 生成质量**：为模型提供「组件库 + 设计规范」上下文与示例检索（few-shot），把生成物视觉水平再抬一档；加入截图回归评测。
2. **P0 稳定性**：把工具调用失败、模型返回非法 JSON、SSE 断流等边界都做成显式重试策略；用真实任务的回归集跑成功率。
3. **P1 能力扩展**：支持多文件项目（React/Vue 工程）与会话内增量 diff（当前是整文件重写）；支持"从模板/截图生成"。
4. **P1 部署与协作**：生成物一键发布到托管（当前是导出/分享链接）；团队空间与评论。
5. **P2 工程化**：接入 Sentry/埋点、端到端 Playwright 测试、模型网关计费与限流（现有限流为单进程内存实现）。

## 5. 如何运行 / 体验

```bash
npm install
cp .env.example .env.local   # 可选：填 LLM_API_KEY 使用真实模型；留空则演示模式
npm run dev                  # http://localhost:3000
```

- 环境变量：`LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY`（必填项）；`MOCK_LLM=1` 强制演示模式；`LLM_CODING_MAX_TOKENS` / `LLM_PLAN_MAX_TOKENS` / `LLM_REASONING_EFFORT` 控制 reasoning 预算与质量-速度；`RATE_LIMIT_PER_HOUR` / `RATE_LIMIT_CONCURRENT` 控制公开演示额度。完整列表见 [README](../README.md#环境变量) 与 [docs/DEPLOY.md](./DEPLOY.md)。
- 也可以在页面右上角「设置」里填自己的 Base URL / 模型 / API Key（只存在浏览器本地），并选择质量-速度档位。
- 快捷键：`?` 打开快捷键面板，`Ctrl/⌘+K` 聚焦输入框，`Enter` 发送，`Esc` 停止生成/关闭浮层。

## 6. 评测维度对照

| 维度 | 本项目的体现 |
|---|---|
| 完成度 | 生成→预览→迭代→版本/差异→分享/导出 全链路可跑；类型检查与构建通过；异常有兜底；产品文档完整（PRODUCT/API/FAQ/CHANGELOG） |
| 工程思维 | 契约（类型/事件协议）先行；校验 + 自修复；mock 降级；usage/缓存/额度可观测；限流与配额；文档化取舍 |
| 用户体验 | Atoms 风格深色界面；流式过程可视化（计划/步骤）；预览即所得；快捷键、消息操作、灵感库、Toast；视频级全屏预览 |
| 创新性 | 无密钥演示模式；分享链接即应用；版本回滚与 diff；生成物控制台；prompt cache 命中可视化 |
| 可交付性 | README + 产品文档 + 部署文档 + 一键在线链接 + 本说明；GitHub 公开仓库 |
