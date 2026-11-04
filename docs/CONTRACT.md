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
