/**
 * Prompts and context builders for the Atoms app-building agent.
 * Instructions are written in English for model reliability; all generated UI copy
 * must be Simplified Chinese.
 */
import type { AppPlan, ChatRequest, FileMap } from "@/types";
import type { ChatMessage } from "./provider";
import { byteSize, formatKb } from "./tools";

const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 1_200;
const MAX_FILE_CHARS_IN_PROMPT = 60_000;
const MAX_TOTAL_PROMPT_FILE_CHARS = 150_000;

const CORE_FILE_PLANS: AppPlan["files"] = [
  { path: "index.html", purpose: "页面结构与内容容器" },
  { path: "styles.css", purpose: "完整视觉样式与响应式布局" },
  { path: "app.js", purpose: "交互逻辑与本地数据持久化" },
];

export const SYSTEM_PROMPT = `You are Atoms, an elite product engineer that turns a natural-language request into one small, polished, fully working web app.

## Deliverable
- Build ONE self-contained static app made of exactly three files: index.html, styles.css, app.js.
- Write each file with the write_file tool using its COMPLETE final content. write_file replaces the whole file, so never send partial content, diffs or placeholders like "..." or "rest of code unchanged".
- index.html must be a complete document: <!DOCTYPE html>, <html lang="zh-CN">, <meta charset="utf-8">, <meta name="viewport" content="width=device-width, initial-scale=1">, a meaningful <title>, a <link rel="stylesheet" href="styles.css"> in <head>, and <script src="app.js" defer></script> right before </body>.
- app.js must be a plain classic script: no import/export, no modules, no build step, no external libraries.
- Absolutely no external resources or network calls: no CDN, no web fonts, no remote images, no fetch/XHR/WebSocket, no http(s) URLs in any file. Use inline SVG, CSS shapes or emoji for icons. The app must work fully offline.
- Every user-facing string must be natural Simplified Chinese (按钮、标题、空状态、提示文案都要中文).
- Only if the user explicitly asks for docs, you may also write README.md; it is not rendered, the app lives in the three files above.

## Quality bar (this is a design-savvy demo, not a wireframe)
- Visually polished: cohesive palette driven by CSS custom properties on :root, soft gradients/glass surfaces, generous whitespace, rounded cards, clear hierarchy, intentional hover/active/focus states, smooth 150-250ms transitions, and a prefers-reduced-motion fallback.
- Responsive from 390px mobile to a desktop viewport: no horizontal scrolling, no clipped controls, touch targets at least 40px tall.
- Real functionality: genuine state management, event listeners, immediate DOM updates, keyboard support (Enter/Space/Escape where natural), empty states, disabled states and success feedback. No dead buttons.
- Persist meaningful state in localStorage under one versioned key (e.g. "atoms-app-v1") wrapped in try/catch, so the app still works if storage is blocked. Restore it safely on load and guard against corrupt JSON.
- Zero console errors or warnings on load and during interactions. Never rely on alert/prompt/confirm for core UX; build proper UI instead.
- Build DOM with textContent or createElement when rendering user input; avoid injecting raw user strings into innerHTML.
- Be economical. Keep every file under ~15 KB: concise CSS (one stylesheet, no duplicated rules), no huge data arrays, no decorative comments. Aim for roughly 6,000-8,000 output tokens across the three files.
- If a feature would make app.js exceed ~15 KB, simplify the feature or keep small helpers inline in index.html; never create extra JS files.

## Workflow with tools
1. Call write_file exactly ONCE per file, with the complete final content. Write styles.css first, then app.js, then index.html.
2. Do NOT rewrite a file you already wrote. Do NOT call read_file on files you just wrote. Only rewrite a specific file when the server validation explicitly reports a problem in that file.
3. In refine requests: preserve every working feature unless the user asks to remove it, and rewrite only the files that actually need to change.
4. Keep assistant messages to one or two short Chinese sentences; never paste code in chat.
5. After the third file is written, immediately call finish(summary, app_name). Do not review, re-read or "polish" afterwards — validation is done server-side.`;

export const PLANNER_PROMPT = `You are the planning step of Atoms, an AI app builder. Think about the requested app and produce a concise plan.

Respond with ONLY one valid JSON object (no markdown fences, no commentary, no trailing commas) using exactly this schema:
{
  "name": "短中文应用名，最多 12 个字",
  "summary": "一句话中文产品介绍，最多 40 个字",
  "features": ["3-5 条中文功能点，每条最多 20 字"],
  "files": [
    { "path": "index.html", "purpose": "中文用途说明" },
    { "path": "styles.css", "purpose": "中文用途说明" },
    { "path": "app.js", "purpose": "中文用途说明" }
  ]
}
The app must be a polished, self-contained static web app with Chinese UI, real interactions and localStorage persistence. For refinement requests, list only the files that need to change (usually styles.css and/or app.js, sometimes index.html).`;

function clampText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function effectiveMode(request: ChatRequest): "generate" | "refine" {
  return Object.keys(request.files ?? {}).length > 0 ? "refine" : "generate";
}

function formatHistory(history: ChatRequest["history"]): ChatMessage[] {
  if (!Array.isArray(history) || history.length === 0) return [];
  return history
    .filter((turn) => turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string")
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn.role,
      content: turn.content.replace(/\s+/g, " ").trim().slice(0, MAX_HISTORY_CHARS),
    }))
    .filter((turn) => turn.content.length > 0);
}

function currentAppDigest(files: FileMap): string {
  const paths = Object.keys(files);
  if (paths.length === 0) return "";
  const lines: string[] = [`当前文件：${paths.map((path) => `${path}（${formatKb(byteSize(files[path] ?? ""))}）`).join("、")}`];
  const html = files["index.html"] ?? "";
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  if (title) lines.push(`当前标题：${title}`);
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (bodyText) lines.push(`当前页面文案摘要：${bodyText.slice(0, 300)}`);
  return lines.join("\n");
}

export function buildPlanMessages(request: ChatRequest): ChatMessage[] {
  const mode = effectiveMode(request);
  const sections: string[] = [];
  sections.push(`用户请求：${request.message}`);
  sections.push(`模式：${mode === "refine" ? "在现有应用上迭代（refine）" : "从零生成新应用（generate）"}`);
  const digest = currentAppDigest(request.files ?? {});
  if (digest) sections.push(digest);
  const history = formatHistory(request.history);
  if (history.length > 0) {
    sections.push(
      `最近对话：\n${history.map((turn) => `${turn.role === "user" ? "用户" : "助手"}：${turn.content}`).join("\n")}`,
    );
  }
  return [
    { role: "system", content: PLANNER_PROMPT },
    { role: "user", content: sections.join("\n\n") },
  ];
}

function renderFilesForPrompt(files: FileMap): string {
  const chunks: string[] = [];
  let budget = MAX_TOTAL_PROMPT_FILE_CHARS;
  for (const [path, content] of Object.entries(files)) {
    if (budget <= 0) break;
    const limit = Math.min(MAX_FILE_CHARS_IN_PROMPT, budget);
    const raw = typeof content === "string" ? content : "";
    const clipped = raw.length > limit ? `${raw.slice(0, limit)}\n/* [内容过长已截断，请基于以上内容重写完整文件] */` : raw;
    chunks.push(`=== ${path} ===\n${clipped}`);
    budget -= Math.min(raw.length, limit);
  }
  return chunks.join("\n\n");
}

function planBlock(plan: AppPlan): string {
  return JSON.stringify(
    { name: plan.name, summary: plan.summary, features: plan.features, files: plan.files },
    null,
    2,
  );
}

export function buildCodingMessages(request: ChatRequest, plan: AppPlan, files: FileMap): ChatMessage[] {
  const mode = effectiveMode(request);
  const sections: string[] = [];
  sections.push(`<user_request>\n${request.message}\n</user_request>`);
  sections.push(`<approved_plan>\n${planBlock(plan)}\n</approved_plan>`);

  if (mode === "refine") {
    sections.push(
      `<current_files>\n${renderFilesForPrompt(files)}\n</current_files>\n\n` +
        "这是用户当前正在查看的应用。请根据 <user_request> 迭代它：用 write_file 重写受影响文件的完整内容；全部完成后调用 finish。",
    );
  } else {
    sections.push(
      "这是一个全新应用，还没有任何文件。请创建 index.html、styles.css、app.js 三个完整文件，全部写完后调用 finish。",
    );
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...formatHistory(request.history),
    { role: "user", content: sections.join("\n\n") },
  ];
}

export function buildRepairInstruction(issuesText: string, files: FileMap, targetFiles: string[]): string {
  const targets = targetFiles.filter((path) => typeof files[path] === "string");
  const effectiveTargets = targets.length > 0 ? targets : Object.keys(files);
  const rendered = effectiveTargets
    .map((path) => {
      const content = files[path] ?? "";
      const clipped = content.length > MAX_FILE_CHARS_IN_PROMPT
        ? `${content.slice(0, MAX_FILE_CHARS_IN_PROMPT)}\n/* [内容过长已截断] */`
        : content;
      return `=== ${path} ===\n${clipped}`;
    })
    .join("\n\n");
  return [
    "服务端校验没有通过。问题只涉及这些文件：" + effectiveTargets.join("、"),
    "请只重写上述文件，用 write_file 提交每个文件的【完整内容】；其他文件一律不要改动。",
    "修复后立即调用 finish。不要整轮重写，也不要重新读取刚写的文件。",
    "",
    "校验问题：",
    issuesText,
    "",
    "需要修复的文件当前内容：",
    rendered,
  ].join("\n");
}

export function buildNudgeInstruction(files: FileMap): string {
  const missing = ["index.html", "styles.css", "app.js"].filter((path) => typeof files[path] !== "string" || !files[path].trim());
  const parts = ["请继续完成任务。"];
  if (missing.length > 0) parts.push(`还缺少文件：${missing.join("、")}，请用 write_file 写入完整内容。`);
  parts.push("全部写出后调用 finish。不要在聊天里贴代码。");
  return parts.join("\n");
}

const DEFAULT_FEATURES = ["核心功能与真实交互", "现代化响应式界面", "本地数据持久化"];

export function synthesizePlan(request: ChatRequest): AppPlan {
  const mode = effectiveMode(request);
  const message = request.message.replace(/\s+/g, " ").trim();
  const quoted = /[「“"']([^」”"']{2,20})[」”"']/.exec(message)?.[1]?.trim();
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(request.files?.["index.html"] ?? "")?.[1]?.trim();
  const name = clampText(quoted || titleMatch || "我的小应用", 24) || "我的小应用";
  const summary =
    clampText(message, 60) || (mode === "refine" ? `根据新需求更新「${name}」` : `一个简洁好用的${name}`);
  return {
    name,
    summary,
    features: [...DEFAULT_FEATURES],
    files: CORE_FILE_PLANS.map((file) => ({ ...file })),
  };
}

/** Parse the planner response (tolerant to markdown fences / surrounding text). */
export function parsePlanResponse(raw: string, request: ChatRequest): AppPlan {
  const fallback = synthesizePlan(request);
  const text = raw.trim();
  if (!text) return fallback;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    const relaxed = text
      .slice(start, end + 1)
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\u201c\u201d]/g, '"');
    try {
      parsed = JSON.parse(relaxed);
    } catch {
      return fallback;
    }
  }
  if (!isRecord(parsed)) return fallback;

  const name = clampText(parsed.name, 24) || fallback.name;
  const summary = clampText(parsed.summary, 80) || fallback.summary;
  const rawFeatures: unknown[] = Array.isArray(parsed.features) ? parsed.features : [];
  const features = rawFeatures
    .map((feature) => clampText(feature, 30))
    .filter((feature) => feature.length > 0)
    .slice(0, 6);
  while (features.length < 3) {
    const next = DEFAULT_FEATURES[features.length];
    if (!next || features.includes(next)) break;
    features.push(next);
  }

  const rawFiles: unknown[] = Array.isArray(parsed.files) ? parsed.files : [];
  const files: AppPlan["files"] = [];
  const seen = new Set<string>();
  for (const item of rawFiles) {
    if (!isRecord(item)) continue;
    const path = clampText(item.path, 40);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    files.push({ path, purpose: clampText(item.purpose, 40) || "应用文件" });
  }
  for (const core of CORE_FILE_PLANS) {
    if (!seen.has(core.path)) files.push({ ...core });
  }

  return { name, summary, features: features.length > 0 ? features : [...DEFAULT_FEATURES], files: files.slice(0, 6) };
}
