/**
 * `POST /api/prompt/enhance` core logic: rewrite a one-line app idea into an
 * implementation-ready brief for the build agent.
 *
 * Resolution order: request BYOK override -> server env key -> deterministic mock.
 * Kept free of Next.js imports so the offline smoke test can exercise it directly.
 */
import type { PromptEnhanceRequest, PromptEnhanceResponse } from "@/types";

import { normalizeReasoningEffort, resolveProvider } from "./config";
import { streamChatCompletion, type ChatMessage } from "./provider";

const MAX_INPUT_CHARS = 2_000;
// Reasoning models (e.g. deepseek-v4.1-flash) spend part of the budget on hidden
// reasoning before the visible JSON, so 600 tokens is not enough (real-world 502).
const DEFAULT_MAX_OUTPUT_TOKENS = 2_400;
const DEFAULT_TIMEOUT_MS = 55_000;

function maxOutputTokens(): number {
  const raw = Number(process.env.PROMPT_ENHANCE_MAX_TOKENS);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.min(4_000, Math.max(800, Math.trunc(raw)));
}

export const ENHANCE_SYSTEM_PROMPT = `You are the prompt engineer of Atoms, an AI app builder. Rewrite the user's one-line app idea into a complete, implementation-ready product brief that another coding agent can build directly.

Rules:
- Keep the user's language (Chinese input -> Chinese output).
- Be concrete: target user, core features, page structure, data model/fields, interactions, empty/error states, visual direction, responsive behavior, and acceptance criteria.
- Do not invent external services; the result must be buildable as one self-contained static web app.
- Output ONLY compact JSON with exactly these keys:
  {"enhanced":"<the rewritten prompt, 150-260 Chinese characters or equivalent>","tips":["<short actionable tip>","<short actionable tip>","<short actionable tip>"]}
- No markdown fences, no commentary, no extra keys.`;

/** Deterministic fallback used when no API key is configured (demo mode). */
export function buildMockEnhancement(message: string): PromptEnhanceResponse {
  const goal = message.replace(/\s+/g, " ").trim().slice(0, 160) || "一个实用的小工具";
  const enhanced = [
    `请开发一个可直接运行的单页 Web 应用，核心需求：${goal}。`,
    "",
    "功能与页面：",
    "1. 主流程：围绕核心需求实现完整可用的操作闭环，包含空状态、进行中状态与完成反馈。",
    "2. 页面结构：顶部品牌/标题区 + 主内容区 + 操作结果区，中文界面，信息层级清晰。",
    "3. 数据与交互：关键数据使用 localStorage 持久化，刷新后不丢失；按钮、表单与键盘操作都有即时反馈。",
    "",
    "视觉与体验：",
    "4. 风格现代克制：统一的色彩变量、圆角卡片、柔和阴影或渐变，留白充足；390px 手机与桌面端均可用。",
    "5. 过渡动画 150-250ms，尊重 prefers-reduced-motion；不使用 alert，所有反馈在页面内完成。",
    "",
    "技术约束：纯静态 HTML/CSS/JavaScript，无外部依赖与网络请求，所有资源内联，无需构建工具。",
    "",
    "验收标准：首屏无控制台报错；核心操作 3 步内完成；刷新后数据仍在；桌面与手机布局无横向滚动。",
  ].join("\n");
  return {
    enhanced,
    tips: [
      "补充目标用户和使用场景，生成结果会更贴合真实需求",
      "列出必须包含的字段或数据（如金额、日期、分类），可减少返工",
      "想要特定视觉风格时，可以指定主色或参考产品",
    ],
    mock: true,
  };
}

const DEFAULT_TIPS = [
  "补充目标用户和使用场景，生成结果会更贴合真实需求",
  "说明必须包含的字段或操作流程，可减少返工",
  "在意视觉风格时可以指定主色或参考产品",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeTips(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TIPS];
  const tips = raw
    .map((tip) => clampText(tip, 80))
    .filter((tip) => tip.length > 0)
    .slice(0, 3);
  while (tips.length < 2) {
    const next = DEFAULT_TIPS[tips.length];
    if (!next || tips.includes(next)) break;
    tips.push(next);
  }
  return tips;
}

/** Tolerant parser for the model's JSON answer (falls back to the raw text). */
export function parseEnhancementResponse(raw: string, originalMessage: string): PromptEnhanceResponse {
  const text = raw.trim();
  let parsed: unknown;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      parsed = null;
    }
  }

  if (isRecord(parsed)) {
    const enhanced = clampText(parsed.enhanced, 4_000);
    if (enhanced.length >= 20) {
      return { enhanced, tips: normalizeTips(parsed.tips), mock: false };
    }
  }

  // Fallback: treat the raw completion as the enhanced prompt.
  if (text.length >= 20) {
    return { enhanced: text.slice(0, 4_000), tips: [...DEFAULT_TIPS], mock: false };
  }
  const fallback = buildMockEnhancement(originalMessage);
  return { ...fallback, mock: false };
}

export interface RunEnhanceOptions {
  signal?: AbortSignal;
  /** Stable session id forwarded to session-aware gateways. */
  sessionId?: string;
  timeoutMs?: number;
}

/**
 * Expand a user prompt. Throws `ProviderError` when a configured provider fails
 * (the route maps that to a user-safe JSON error); no key -> deterministic mock.
 */
export async function runPromptEnhancement(
  request: PromptEnhanceRequest,
  options: RunEnhanceOptions = {},
): Promise<PromptEnhanceResponse> {
  const message = typeof request.message === "string" ? request.message.trim().slice(0, MAX_INPUT_CHARS) : "";
  if (!message) throw new Error("message 不能为空");

  const provider = resolveProvider(request.provider);
  if (!provider) return buildMockEnhancement(message);

  const reasoningEffort =
    normalizeReasoningEffort(request.reasoningEffort) ??
    normalizeReasoningEffort(request.provider?.reasoningEffort) ??
    // Reasoning models are much slower/costlier at the server's default effort; a
    // prompt rewrite is a small task, so default to the cheapest useful effort.
    "low";

  const messages: ChatMessage[] = [
    { role: "system", content: ENHANCE_SYSTEM_PROMPT },
    { role: "user", content: message },
  ];

  let raw = "";
  for await (const delta of streamChatCompletion({
    provider,
    messages,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    idleTimeoutMs: 30_000,
    temperature: 0.3,
    maxTokens: maxOutputTokens(),
    reasoningEffort,
    sessionId: options.sessionId,
  })) {
    if (delta.content) raw += delta.content;
  }

  return parseEnhancementResponse(raw, message);
}
