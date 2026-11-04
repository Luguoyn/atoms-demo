# Atoms Demo — 实现方案（PLAN）

> 对应笔试要求：6-8h 完成一个可运行的 Atoms Demo —— 智能体驱动完成代码/应用生成，并以可视化网页展示。
> 仓库根：`C:\aigc\atoms`。契约细节见 [CONTRACT.md](./CONTRACT.md)。

## 1. 一句话方案

**一句自然语言 → 服务端 Agent（规划/写码/校验/自修复）→ 虚拟文件 → 浏览器内实时 iframe 预览 → 继续对话迭代 → 版本历史/分享/导出。** 全部项目数据存浏览器 IndexedDB，无需注册；无模型密钥时自动进入 mock 演示模式（链路完整、可评测）。

## 2. 架构

```
┌────────────────────────────── Browser (Next.js client, App Router) ──────────────────────────────┐
│  ProjectSidebar   ChatPanel(消息/计划/工具步骤/流式)   PreviewPanel(设备框/控制台/版本/分享/导出)  │
│         │                │                                    │                                  │
│         └────── useBuilder() store（唯一状态源）───────────────┘                                  │
│                          │  fetch POST /api/chat (SSE)        │ buildPreviewDocument → iframe srcDoc│
│                          │  IndexedDB 持久化                 │ postMessage 控制台桥               │
└──────────────────────────┼───────────────────────────────────────────────────────────────────────┘
                           ▼
┌────────────────────────── Server (Route Handler) ─────────────────────────────┐
│ /api/chat → runAgent(): provider(OpenAI 兼容/DeepSeek) ⇄ tools(write/read/…)   │
│            → validate(node:vm 编译级) → 1 轮修复 → AgentEvent 流               │
│ 无 key / MOCK_LLM=1 → mock agent（确定性、真流式、高质量示例应用）              │
│ /api/config → { hasServerKey, mockMode, defaultModel }                        │
└───────────────────────────────────────────────────────────────────────────────┘
```

## 3. 关键设计取舍

| 决策 | 选择 | 理由 |
|---|---|---|
| 生成物形态 | 自包含静态应用（`index.html`/`styles.css`/`app.js`） | 可离线预览、可导出、可分享；避免沙箱内跑构建 |
| 预览 | `iframe srcDoc` + sandbox | 与主站隔离、零构建、天然跨应用；注入控制台桥 |
| 持久化 | 浏览器 IndexedDB | 「无需注册」+ 部署到 serverless 也可用；数据随项目走 |
| Agent | 服务端 function-calling 循环 + 编译级校验 + 1 轮自修复 | 真 Agent 流程（计划/工具/验证），且成本与稳定性可控 |
| 无 key 体验 | 自动 mock 模式 | 评测者打开链接即可完整走通；界面上明确标注 |
| 分享 | URL fragment 压缩编码 | 无后端存储即可分享可运行应用，部署到纯前端也成立 |
| 部署 | Vercel/Netlify/Render 一键；本地隧道兜底 | 满足「可测试在线链接」 |

## 4. 团队分工（Agent Teams）

| 角色 | 范围 | 产出 |
|---|---|---|
| Lead | 契约/types、store、设计系统、AppShell、集成/构建/最终验收、部署 | 骨架 + 集成 |
| agent-engineer | `src/lib/agent/**`、`src/app/api/**`、agent 冒烟 | Agent 引擎、SSE、mock、校验 |
| ui-chat | `src/components/chat|projects|settings/**` | 聊天流、计划/步骤渲染、Composer、项目侧栏、设置 |
| ui-preview | `src/components/preview/**`、`src/lib/{preview,share,export}/**` | iframe 预览、设备/控制台/版本/分享/导出 |
| infra-qa | `README.md`、`docs/DEPLOY.md`、`scripts/**` | 文档、公网隧道、冒烟与浏览器 E2E |

纪律：写域互斥（advisory write scopes），共享文件只由 Lead 改；契约变更先找 Lead。

## 5. 验收对照（笔试评估维度）

| 维度 | 落地 |
|---|---|
| 完成度 | 生成→预览→迭代→持久化完整闭环；构建/类型检查通过；SSE 异常/中断兜底 |
| 工程思维 | 契约先行、事件协议、校验+自修复、mock 降级、可部署性设计（见本文档） |
| 用户体验 | Atoms 风格深色 UI、流式输出、计划卡/工具步骤可视化、设备预览、快捷键 |
| 创新性 | 分享链接即应用、版本回退、导出单文件 HTML/ZIP、无 key 演示模式 |
| 可交付性 | README + 部署文档 + 一键在线链接 + 说明文档（取舍/完成度/后续规划） |

## 6. 里程碑

1. ✅ M1 骨架：Next 工程、契约、store、设计系统、AppShell（Lead）
2. ✅ M2 引擎：`/api/chat` SSE + mock + 真实 DeepSeek（agent-engineer）
3. ✅ M3 UI：聊天/预览两侧完成并联调（ui-chat、ui-preview）
4. ✅ M4 集成：类型检查、构建、真实生成 + iframe 预览 + 版本/分享回归（Lead）
5. ✅ M5 交付：生产模式 + 公网隧道、README、E2E 截图、GitHub 仓库（infra-qa + Lead）
