/**
 * Deterministic offline agent used when no API key is configured (or MOCK_LLM=1).
 * Emits the exact same SSE event sequence as the real agent, with staged delays and
 * a genuinely polished example app, so the demo flow is fully explorable without a key.
 */
import type { AgentEvent, AppPlan, ChatRequest, FileMap } from "@/types";
import type { RunAgentOptions } from "./options";
import { effectiveMode } from "./prompts";
import { pickTemplate, type AppTemplate } from "./templates";
import { byteSize, formatKb, splitForStreaming } from "./tools";
import { validateApp } from "./validate";

const CORE_FILES = ["index.html", "styles.css", "app.js"] as const;
const CHUNK_TARGET = 480;

interface Palette {
  label: string;
  accent: string;
  strong: string;
  soft: string;
  glow: string;
}

const PALETTE_RULES: Array<{ pattern: RegExp; palette: Palette }> = [
  { pattern: /绿|green/i, palette: { label: "清新绿", accent: "#22c55e", strong: "#16a34a", soft: "rgba(34, 197, 94, 0.14)", glow: "rgba(34, 197, 94, 0.2)" } },
  { pattern: /蓝|blue/i, palette: { label: "天空蓝", accent: "#3b82f6", strong: "#2563eb", soft: "rgba(59, 130, 246, 0.14)", glow: "rgba(59, 130, 246, 0.2)" } },
  { pattern: /紫|violet|purple/i, palette: { label: "浪漫紫", accent: "#8b5cf6", strong: "#7c3aed", soft: "rgba(139, 92, 246, 0.14)", glow: "rgba(139, 92, 246, 0.2)" } },
  { pattern: /橙|橘|orange/i, palette: { label: "暖阳橙", accent: "#f97316", strong: "#ea580c", soft: "rgba(249, 115, 22, 0.14)", glow: "rgba(249, 115, 22, 0.2)" } },
  { pattern: /红|red/i, palette: { label: "珊瑚红", accent: "#ef4444", strong: "#dc2626", soft: "rgba(239, 68, 68, 0.14)", glow: "rgba(239, 68, 68, 0.2)" } },
  { pattern: /粉|pink/i, palette: { label: "樱花粉", accent: "#ec4899", strong: "#db2777", soft: "rgba(236, 72, 153, 0.14)", glow: "rgba(236, 72, 153, 0.2)" } },
  { pattern: /青|cyan|teal|薄荷/i, palette: { label: "薄荷青", accent: "#06b6d4", strong: "#0891b2", soft: "rgba(6, 182, 212, 0.14)", glow: "rgba(6, 182, 212, 0.2)" } },
  { pattern: /黄|amber|金色/i, palette: { label: "鎏金黄", accent: "#f59e0b", strong: "#d97706", soft: "rgba(245, 158, 11, 0.14)", glow: "rgba(245, 158, 11, 0.2)" } },
  { pattern: /黑|灰|black|gray|grey/i, palette: { label: "深邃黑", accent: "#334155", strong: "#1e293b", soft: "rgba(51, 65, 85, 0.14)", glow: "rgba(51, 65, 85, 0.2)" } },
];

const FALLBACK_PALETTES: Palette[] = [
  { label: "薄荷青", accent: "#06b6d4", strong: "#0891b2", soft: "rgba(6, 182, 212, 0.14)", glow: "rgba(6, 182, 212, 0.2)" },
  { label: "浪漫紫", accent: "#8b5cf6", strong: "#7c3aed", soft: "rgba(139, 92, 246, 0.14)", glow: "rgba(139, 92, 246, 0.2)" },
  { label: "天空蓝", accent: "#3b82f6", strong: "#2563eb", soft: "rgba(59, 130, 246, 0.14)", glow: "rgba(59, 130, 246, 0.2)" },
  { label: "暖阳橙", accent: "#f97316", strong: "#ea580c", soft: "rgba(249, 115, 22, 0.14)", glow: "rgba(249, 115, 22, 0.2)" },
];

const FILE_PURPOSES: Record<string, string> = {
  "index.html": "页面结构与内容容器",
  "styles.css": "完整视觉样式与响应式布局",
  "app.js": "交互逻辑与本地数据持久化",
};

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

async function sleep(ms: number, scale: number, signal?: AbortSignal): Promise<void> {
  const duration = Math.max(0, Math.round(ms * scale));
  if (signal?.aborted) throw abortError();
  if (duration === 0) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, duration);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasCssVar(css: string, name: string): boolean {
  return new RegExp(`${escapeRegExp(name)}\\s*:`).test(css);
}

function replaceCssVar(css: string, name: string, value: string): string {
  return css.replace(new RegExp(`(${escapeRegExp(name)}\\s*:\\s*)[^;\\n]+;`, "g"), `$1${value};`);
}

function applyPalette(css: string, palette: Palette): string {
  const replacements: Array<[string, string]> = [
    ["--accent", palette.accent],
    ["--accent-strong", palette.strong],
    ["--accent-soft", palette.soft],
    ["--bg-glow", palette.glow],
  ];
  let next = css;
  let replaced = false;
  for (const [name, value] of replacements) {
    if (hasCssVar(next, name)) {
      next = replaceCssVar(next, name, value);
      replaced = true;
    }
  }
  if (!replaced) {
    next += `\n\n/* 主题色微调 */\n:root {\n  --accent: ${palette.accent};\n  --accent-strong: ${palette.strong};\n  --accent-soft: ${palette.soft};\n  --bg-glow: ${palette.glow};\n}\n`;
  }
  return next;
}

function detectPalette(message: string): Palette | null {
  for (const rule of PALETTE_RULES) {
    if (rule.pattern.test(message)) return rule.palette;
  }
  return null;
}

function rotatePalette(message: string): Palette {
  let hash = 0;
  for (let index = 0; index < message.length; index += 1) {
    hash = (hash * 31 + message.charCodeAt(index)) >>> 0;
  }
  return FALLBACK_PALETTES[hash % FALLBACK_PALETTES.length] ?? FALLBACK_PALETTES[0];
}

function truncate(text: string, max: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

interface RefineResult {
  files: FileMap;
  changedPaths: string[];
  note: string;
}

function applyMockRefinement(request: ChatRequest, template: AppTemplate): RefineResult {
  const files: FileMap = { ...request.files };
  for (const path of CORE_FILES) {
    const current = files[path];
    if (typeof current !== "string" || !current.trim()) files[path] = template.files[path];
  }
  const currentCss = files["styles.css"] ?? template.files["styles.css"];
  const detected = detectPalette(request.message);
  if (detected) {
    files["styles.css"] = applyPalette(currentCss, detected);
    return {
      files,
      changedPaths: ["styles.css"],
      note: `主色已切换为${detected.label}，其余交互与布局保持不变`,
    };
  }
  const rotated = rotatePalette(request.message);
  files["styles.css"] = applyPalette(currentCss, rotated);
  return {
    files,
    changedPaths: ["styles.css"],
    note: `离线演示模式已按请求做主题微调（${rotated.label}）；配置 API Key 后可由模型执行任意改动`,
  };
}

function generatePlan(request: ChatRequest, template: AppTemplate): AppPlan {
  return {
    name: template.name,
    summary: template.summary,
    features: [...template.features],
    files: CORE_FILES.map((path) => ({ path, purpose: FILE_PURPOSES[path] ?? "应用文件" })),
  };
}

function refinePlan(request: ChatRequest, changedPaths: string[], note: string): AppPlan {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(request.files["index.html"] ?? "")?.[1]?.trim();
  const name = title ? title.split(/[·|\-–—]/)[0]?.trim().slice(0, 24) || "我的应用" : "我的应用";
  return {
    name,
    summary: `根据「${truncate(request.message, 28)}」更新界面细节：${note}`,
    features: ["保留现有功能与交互", "更新主题配色与视觉效果", "继续本地保存数据"],
    files: changedPaths.map((path) => ({ path, purpose: path === "styles.css" ? "更新主题色与视觉细节" : FILE_PURPOSES[path] ?? "应用文件" })),
  };
}

function doneSummary(mode: "generate" | "refine", plan: AppPlan, note: string): string {
  if (mode === "refine") {
    return note ? `已更新「${plan.name}」：${note}。` : `已更新「${plan.name}」。`;
  }
  return `已生成「${plan.name}」，包含完整的页面、样式与交互。当前为离线演示模式，配置 API Key 后可生成任意应用。`;
}

export async function* runMockAgent(request: ChatRequest, options: RunAgentOptions = {}): AsyncGenerator<AgentEvent> {
  const scale = typeof options.mockDelayScale === "number" && options.mockDelayScale >= 0 ? options.mockDelayScale : 1;
  const signal = options.signal;
  const mode = effectiveMode(request);
  const template = pickTemplate(request.message);

  yield { type: "phase", phase: "planning", label: "正在理解需求并规划应用" };
  await sleep(650, scale, signal);

  let plan: AppPlan;
  let files: FileMap;
  let writeOrder: string[];
  let note = "";

  if (mode === "refine") {
    const refined = applyMockRefinement(request, template);
    files = refined.files;
    writeOrder = refined.changedPaths;
    note = refined.note;
    plan = refinePlan(request, refined.changedPaths, refined.note);
  } else {
    files = { ...template.files };
    writeOrder = ["styles.css", "app.js", "index.html"];
    plan = generatePlan(request, template);
  }

  yield { type: "plan", plan };
  await sleep(380, scale, signal);
  yield {
    type: "phase",
    phase: "coding",
    label: mode === "refine" ? "正在调整主题与界面细节" : "正在编写样式、交互与页面结构",
  };

  let written = 0;
  let eventId = 0;
  for (const path of writeOrder) {
    if (signal?.aborted) throw abortError();
    const content = files[path];
    if (typeof content !== "string") continue;
    eventId += 1;
    const toolId = `mock-tool-${eventId}`;
    yield { type: "tool_start", id: toolId, tool: "write_file", label: `写入 ${path}` };
    const chunks = splitForStreaming(content, CHUNK_TARGET);
    for (const chunk of chunks) {
      if (signal?.aborted) throw abortError();
      await sleep(42, scale, signal);
      yield { type: "file_delta", path, delta: chunk };
    }
    yield { type: "file_done", path, content };
    yield {
      type: "tool_result",
      id: toolId,
      ok: true,
      summary: `已写入 ${path}（${formatKb(byteSize(content))}）`,
    };
    written += 1;
    await sleep(140, scale, signal);
  }

  yield { type: "phase", phase: "validating", label: "正在校验生成结果" };
  await sleep(620, scale, signal);
  const issues = validateApp(files);
  const ok = !issues.some((issue) => issue.severity === "error");
  yield { type: "validation", ok, issues };

  yield {
    type: "done",
    files,
    plan,
    summary: doneSummary(mode, plan, note),
    stats: { steps: written + 2, mock: true },
  };
}
