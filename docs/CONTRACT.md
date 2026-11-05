# Atoms Demo — Build Contract (v1)

> Read this before writing any code. Owner: **Lead**. If something here blocks you, message the Lead instead of guessing.
> Working dir: `C:\aigc\atoms` (Windows, PowerShell, Node 24, npm already installed — **do not run `npm install`**).

## 1. Product

**Atoms Demo** is an AI app builder: the user types a natural-language idea, a server-side agent plans the app, writes the code (virtual files: `index.html` + `styles.css` + `app.js`), validates it, and the result is rendered live in a browser-style preview panel. The user can then keep chatting to iterate; every build becomes a restorable version. All projects/messages/versions persist in the browser (IndexedDB), so reloading the page keeps everything. No sign-up.

Required behaviors from the written-test brief: real interaction, data persistence, core flow + at least one extension (we ship: version history/restore, share link, export ZIP/HTML, device toggle, console capture), testable online link, usable (not a PoC).

## 2. Stack & environment

- Next.js **15.5.29** (App Router, `src/` dir), React **19.1.0**, TypeScript strict, Tailwind CSS **v4** (`@import "tailwindcss"` in `src/app/globals.css`, no `tailwind.config`).
- No extra npm dependencies without Lead approval (allowed: `idb-keyval`, `fflate` — already installed).
- Node 24; dev server `npm run dev` → http://localhost:3000. Type check `npm run typecheck`. Build `npm run build`.
- `.env.local` already contains a working DeepSeek-compatible key (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`). **Never print, copy or commit the key.** `.env*` is gitignored.

## 3. Repo layout & ownership (write scopes — stay inside yours!)

```
src/app/layout.tsx, page.tsx, globals.css        Lead
src/app/api/chat/route.ts                        agent-engineer
src/app/api/config/route.ts                      agent-engineer
src/lib/agent/**                                 agent-engineer
src/lib/preview/**                               ui-preview
src/lib/share/**, src/lib/export/**              ui-preview
src/components/preview/**                        ui-preview
src/components/chat/**                           ui-chat
src/components/projects/** (ProjectSidebar)      ui-chat
src/components/settings/** (SettingsDialog)      ui-chat
src/components/ui/** (Button, Modal, Badge,
  Spinner, Logo, index.ts)                       Lead
src/components/layout/AppShell.tsx, TopBar.tsx   Lead
src/lib/store.tsx (BuilderProvider/useBuilder)   Lead
src/lib/idb.ts, src/lib/utils.ts                 Lead
src/types.ts                                     Lead (read-only for teammates)
scripts/**, docs/DEPLOY.md, README.md,
  vercel.json, .env.example                      infra-qa
docs/CONTRACT.md, docs/PLAN.md                   Lead
```
Never edit files outside your scope; if a shared file needs a change, message the Lead. Do not run `npm install`, do not edit `package.json` (infra-qa may edit README/docs only).

## 4. Server API contracts

### `GET /api/config`
```ts
ServerConfig = { hasServerKey: boolean; mockMode: boolean; defaultModel: string }
```

### `POST /api/chat` — request `ChatRequest` (see `src/types.ts`), response `text/event-stream`
Each event is written as `data: ${JSON.stringify(event)}\n\n` (`AgentEvent` in `src/types.ts`). Must set headers:
`Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.

Event order for a normal run:
`phase(planning)` → `plan` → `phase(coding)` → for each file: `tool_start(write_file)` → `file_delta`* → `file_done` → `tool_result` → `phase(validating)` → `validation` → (optional `phase(fixing)`, `tool_start`/`file_delta`/`file_done`, `validation`) → `done`.
On failure: `error` (then the stream ends).

Provider resolution: request `provider` override (BYOK) → env `LLM_*` → if neither has a key, **fall back to the built-in mock agent** (`mode: "mock"`, deterministic, still emits the full event sequence with realistic staged delays). `MOCK_LLM=1` forces mock. The agent:
- system prompt: you are Atoms' app-building agent; produce **one polished, self-contained static app** (`index.html`, `styles.css`, `app.js`, optionally `README.md` is NOT rendered) with inline assets only, no CDN/network calls, Chinese UI copy, mobile responsive, real interactions and `localStorage` persistence inside the generated app.
- tool loop via OpenAI-compatible function calling; max 10 steps / max ~120s (whichever first); files must be written with `write_file`; finish with `finish`.
- server-side validation of produced files (JS syntax via `node:vm` compile, HTML has `<html>`/`<body>`, referenced local files exist, size limits ~200KB/file). If issues: emit `validation` and run one repair round (unless mock).
- refine mode: `files` carries the current app; prompt contains the current file contents; agent must edit/rewrite files to satisfy the new request.
- cancel: abort when client disconnects (`request.signal`).

## 5. Client store (Lead implements; UI consumes)

```ts
import { useBuilder } from "@/lib/store";

const {
  ready, projects, activeProject, busy, phase, phaseLabel, error,
  serverConfig, settings, consoleEntries, serverMode,
  createProject, selectProject, deleteProject, renameProject,
  sendMessage, stopGeneration, restoreVersion,
  saveSettings, dismissError, clearConsole, pushConsole, importShare,
} = useBuilder();
```
- `activeProject.files` is the current app source (`FileMap`); `activeProject.messages` includes streaming assistant message with `steps`, `plan`, `content`; `activeProject.versions` newest last.
- `sendMessage(text)` streams `/api/chat`, updates state, persists to IndexedDB, creates a version on `done`.
- `pushConsole(entry)` / `clearConsole()` feed the preview console panel.
- `importShare(files, name?)` imports a shared app as a new project (used by share links on load).
- `serverMode`: `"server-key"` (use server key), `"byok"` (user key entered), `"mock"` (no key anywhere → demo mode).

## 6. Component boundaries

- `src/components/layout/AppShell.tsx` (Lead) — responsive 3-column shell: ProjectSidebar | ChatPanel | PreviewPanel; top bar; mobile toggle. Teammates export exactly:
  - ui-chat: `ChatPanel` (`src/components/chat/ChatPanel.tsx`), `ProjectSidebar` (`src/components/projects/ProjectSidebar.tsx`), `SettingsDialog` (`src/components/settings/SettingsDialog.tsx`).
  - ui-preview: `PreviewPanel` (`src/components/preview/PreviewPanel.tsx`).
- Components are self-contained: get data from `useBuilder()`, no props required (except small internal components). No global CSS files besides `src/app/globals.css`; per-component modules are allowed only under your own scope.
- Preview panel implementation: `buildPreviewDocument(files)` (`src/lib/preview/bundler.ts`) inlines `styles.css`/`app.js` into `index.html`, injects a console bridge (`window.parent.postMessage({source:"atoms-preview",...})`) and renders in `<iframe srcDoc sandbox="allow-scripts allow-forms allow-modals allow-popups" />`. Errors/console from iframe go to `pushConsole`.
- Share: `#share=<base64url(deflate(JSON))>` encoded/decoded in `src/lib/share/shareLink.ts`; on mount, if present, call `importShare`.
- Export: `src/lib/export/exportApp.ts` — `downloadHtml(files)`, `downloadZip(files, name)` using `fflate`.

## 7. Design system (globals.css tokens, defined by Lead)

Dark AI-product aesthetic: near-black background with subtle violet radial glow, glass panels, 1px translucent borders, violet→cyan gradient accents.
Semantic Tailwind v4 colors: `bg-bg`, `bg-surface`, `bg-surface2`, `border-line`, `text-fg`, `text-muted`, `text-accent`, `bg-accent`, `text-ok|warn|err`. Radii `rounded-[--radius-xl]` avoid: use `rounded-2xl`.
Shared classes in `globals.css`: `.panel`, `.panel-soft`, `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-icon`, `.input`, `.badge`, `.gradient-text`, `.glow`, `.scroll-thin`, `.divider`.
Typography: system-ui stack (`--font-sans`); code `--font-mono`. Sentence-case UI copy in Chinese. Motion: 150-250ms ease-out; respect `prefers-reduced-motion`.

## 8. Quality bar (acceptance)

1. `npm run typecheck` clean; `npm run build` succeeds; dev server weathers a real generation.
2. First generation from a sample prompt produces a complete app and a working iframe preview (no blank screen, no external network).
3. Iteration ("把主色改成绿色") updates preview; version list grows; restore works.
4. Reload keeps projects/messages/versions (IndexedDB); project switching works.
5. No crashes on abort/error; error surfaces as a red system message with retry hint.
6. All UI states (empty/welcome, generating, error, no-key mock) look intentional.
7. Responsive ≥1280 and ~390px wide.

## 9. Team protocol

1. `team_task_list` → `team_task_get` → `team_task_update` (action `claim`, current revision) before starting your task.
2. Report progress only at milestones (Lead will review the diff and run checks). Use `send_message` with target `lead` when: your task is complete, you're blocked, or you changed anything outside your scope.
3. Keep code committed-ready: no `console.log` in client code, no `any` unless justified, comments only where logic is non-obvious.
4. Default browser automation port for QA: CDP `http://127.0.0.1:9222` (`agent-browser --cdp 9222 ...`).

---

# CONTRACT v2 — 增强轮（易用性 / 功能 / 产品文档）

> 本轮目标：在 v1 基础上做**易用性与交互提升**、**功能性提升**、**详细产品文档**。所有 v1 契约继续有效，下面是增量。共享契约（`src/types.ts`、store、Toast、hotkeys）由 Lead 先落地，队友只消费不改。

## 10. 新增/变更的服务端 API（agent-engineer）

### `GET /api/status` → `ServerStatus`（见 `src/types.ts`）
- `mode`: `"server-key" | "byok" | "mock"`；`model`；`hasServerKey`；`mockForced`；`serverKeyReason`；`version`（取 `package.json` version，本轮升到 `0.2.0`）。
- `quota`: 按请求 IP 计算的服务端密钥剩余次数（`limitPerHour`/`remaining`/`resetAt`）；BYOK 或 mock 模式下 `null`。
- `rateLimits`: `{ perHour, concurrent }`（与 `/api/chat` 实现共用同一来源）。
- 需要把现有 chat route 里的内存限流器抽成可复用模块（例如 `src/lib/agent/ratelimit.ts`），`/api/chat` 与 `/api/status` 共用，避免两套计数。

### `POST /api/chat` 增量
- 请求体新增可选 `reasoningEffort`（`"low"|"medium"|"high"|"max"`），与 `provider.reasoningEffort` 等效，优先请求体字段。
- SSE 在 `done` 之前新增 `usage` 事件：`{ type:"usage", usage: GenerationUsage }`。Provider 需带 `stream_options: { include_usage: true }` 解析最后一条 usage（解析 `prompt_tokens_details.cached_tokens` / `opencode.tokens.cache_read` / `completion_tokens_details.reasoning_tokens` 三种来源；拿不到就填 0）。mock 也要发 usage（按产物估算，`cachedTokens: 0`）。
- 响应头新增：`X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`（仅服务端密钥模式有意义，BYOK 可省略）。
- 429 现有 JSON 错误体保留。

### `POST /api/prompt/enhance` → `PromptEnhanceResponse`
- 入参 `PromptEnhanceRequest`：把用户的一句话需求扩写成更适合代码生成 Agent 的完整需求（保留用户语言；输出一个直接可用的增强 prompt + 2-3 条 tips）。
- 使用同一 provider 解析（BYOK override 优先，其次服务端 key，最后 mock 返回模板化增强结果）；`max_tokens` 小（≤600），temperature 0.3，不参与生成配额但受每 IP 简单限流（如 30 次/小时）。
- mock 时 `mock: true`，返回确定性增强文案。

### 缓存（重要，用户特别问过）
- 保持 `x-opencode-session` 稳定（同一 project 会话内不变）。
- 在 `docs/PRODUCT.md`（infra-qa）记录实测：同一 session 下第二次请求（更长前缀）的 `cachedTokens` 数值；说明命中前提（稳定 session、相同前缀、前缀足够长）、对成本/时延的影响。
- 提供 `scripts/cache-probe.mjs`：对真实 provider 发两次递增请求并打印 `cachedTokens`，供复跑验证（不打印 key）。

## 11. Client store（Lead 实现，UI 消费）

```ts
const {
  // v1 …
  serverStatus,            // ServerStatus | null
  refreshStatus,           // () => Promise<void>
  lastUsage,               // GenerationUsage | null（最近一次生成的用量/缓存）
  settings,                // 现在包含 reasoningEffort: ReasoningEffort | ""
  saveSettings,            // 传完整 ProviderSettings（含 reasoningEffort）
  // v2 新增
  retryLast,               // () => void：重发最后一条用户消息（新建一轮）
  regenerateFrom,          // (messageId: string) => void：重跑该 assistant 消息对应的需求
  editAndResend,           // (messageId: string, newText: string) => void：改用户消息并重发
  duplicateProject,        // (id: string) => Promise<Project | null>
  deleteAllProjects,       // () => void
  exportProjectJSON,       // (id: string) => string（pretty JSON）
  importProjectJSON,       // (json: string) => Promise<Project | null>
  enhancePrompt,           // (text: string) => Promise<string | null>
} = useBuilder();
```
- `sendMessage(text)` 请求中带 `reasoningEffort: settings.reasoningEffort || undefined`。
- 收到 `usage` 事件：写 `activeProject.messages[assistantId].usage` 与 `lastUsage`。
- 每次生成结束（含错误恢复）后调用 `refreshStatus()` 刷新配额。
- 数据持久化仍走 IndexedDB（settings 里新增字段需兼容旧数据：缺省 `""`）。

## 12. 交互基础设施（Lead 实现，UI 消费）

```ts
// src/components/ui/Toast.tsx （从 @/components/ui 导出）
<ToastProvider>{children}</ToastProvider>
const { toast, dismiss } = useToast();
toast("已复制分享链接");
toast({ title: "导出完成", description: "atoms-demo.zip", tone: "success", durationMs: 2600 });
// tone: "info" | "success" | "error"；同时最多 3 条，自动消失，可手动关闭

// src/lib/hotkeys.ts
useHotkey("mod+k", handler, { enabled?, preventDefault? }); // "mod" = Ctrl/Cmd
export const SHORTCUTS: { keys: string; label: string }[];  // UI 与文档共用
```
- AppShell 全局快捷键（Lead）：`?` 打开快捷键面板、`Esc` 关闭浮层、`mod+k` 聚焦输入框（通过 `window.dispatchEvent(new CustomEvent("atoms:focus-composer"))`，Composer 监听后 focus）。
- Composer（ui-chat）：`Enter` 发送、`Shift+Enter` 换行、`Cmd/Ctrl+Enter` 发送、生成中 `Esc` 停止。

## 13. 本轮组件边界

- ui-chat 新导出：`ShortcutsDialog({ open, onClose })`（`src/components/chat/ShortcutsDialog.tsx`），内容用 `SHORTCUTS` 渲染；其余组件 props 不变。
- ui-preview：`PreviewPanel` 保持无 props；新增「代码」tab、版本 diff、全屏预览、控制台增强都在其 scope 内完成。
- 所有 toast 统一走 `useToast()`；不要各自实现浮层。
- 不要新增第三方依赖。

## 14. v2 验收标准

1. `npm run typecheck` 与 `npm run build` 通过；真实生成仍可用（OpenCode Go）。
2. 易用性：快捷键面板（`?`）可用；`mod+k` 聚焦输入框；消息可复制/重试/重新生成/编辑重发；项目可搜索；灵感库分类；所有成功/失败操作有 toast 反馈；390px 与 1280px 均可操作。
3. 功能：`/api/status` 返回配额与模式；界面展示剩余额度（服务端密钥模式）；`/api/prompt/enhance` 在欢迎页「帮我扩写」可用；代码 tab 可查看/复制/下载 3 个生成文件；版本 diff 能看出文件级差异；全屏预览可用；`usage`（含 cache 命中）在 UI 可见。
4. 文档：`docs/PRODUCT.md`（产品/交互/状态机/API/数据模型/缓存实测/测试策略/限制/路线图）、`docs/API.md`、`docs/CHANGELOG.md` 完成；README 索引与功能表同步。
5. 冒烟与 E2E：`scripts/smoke.mjs` 适配新事件/端点；浏览器 E2E 走通「生成→代码 tab→版本 diff→全屏→重试→搜索→快捷键」。	
