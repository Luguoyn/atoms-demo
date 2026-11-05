/**
 * Agent main loop: plan -> tool-call coding loop -> compile-level validation ->
 * one automatic repair round -> done. Emits `AgentEvent`s consumed by the SSE route.
 */
import type { AgentEvent, AppPlan, ChatRequest, FileMap, GenerationUsage, ReasoningEffort, ValidationIssue } from "@/types";
import { normalizeReasoningEffort, readEnvMilliseconds, resolveProvider, type ResolvedProvider } from "./config";
import { runMockAgent } from "./mock";
import type { RunAgentOptions } from "./options";
import {
  ProviderError,
  ToolCallAccumulator,
  streamChatCompletion,
  type ChatMessage,
  type TokenUsage,
} from "./provider";
import {
  buildCodingMessages,
  buildNudgeInstruction,
  buildPlanMessages,
  buildRepairInstruction,
  effectiveMode,
  parsePlanResponse,
  synthesizePlan,
} from "./prompts";
import {
  MAX_FILE_BYTES,
  TOOL_DEFINITIONS,
  byteSize,
  formatKb,
  parseToolArguments,
  sanitizeFilePath,
  splitForStreaming,
} from "./tools";
import { formatValidationIssues, hasValidationErrors, validateApp } from "./validate";

const DEFAULT_TOTAL_BUDGET_MS = 300_000;
const DEFAULT_TURN_TIMEOUT_MS = 180_000;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_PLAN_TIMEOUT_MS = 60_000;
const MAX_TOOL_TURNS = 10;
const MAX_REPAIR_TURNS = 2;
const MAX_ASSISTANT_TEXT = 6_000;
const STREAM_CHUNK_PAUSE_MS = 6;

interface RunState {
  files: FileMap;
  seq: number;
  steps: number;
  toolTurns: number;
  finished: boolean;
  finishSummary: string;
  finishAppName: string;
}

interface TurnContext {
  provider: ResolvedProvider;
  state: RunState;
  signal?: AbortSignal;
  deadline: number;
  turnTimeoutMs: number;
  idleTimeoutMs: number;
  now: () => number;
  /** Stable conversation id forwarded to session-aware gateways (e.g. OpenCode Go). */
  sessionId?: string;
  /** Per-request reasoning budget forwarded to the provider. */
  reasoningEffort?: ReasoningEffort;
}

/** Bounded integer env reader used for per-call token budgets. */
function readEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(raw)));
}

interface TurnResult {
  text: string;
  toolCalls: number;
  finished: boolean;
  usage: TokenUsage | null;
}

/** Accumulate token/cache accounting across every completion of one agent run. */
interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

function createUsageTotals(): UsageTotals {
  return { promptTokens: 0, completionTokens: 0, cachedTokens: 0, reasoningTokens: 0, totalTokens: 0 };
}

function mergeTokenUsage(current: TokenUsage | null, next: TokenUsage): TokenUsage {
  if (!current) return { ...next };
  return {
    promptTokens: current.promptTokens + next.promptTokens,
    completionTokens: current.completionTokens + next.completionTokens,
    cachedTokens: current.cachedTokens + next.cachedTokens,
    reasoningTokens: current.reasoningTokens + next.reasoningTokens,
    totalTokens: current.totalTokens + next.totalTokens,
  };
}

function addUsage(totals: UsageTotals, usage: TokenUsage | null): void {
  if (!usage) return;
  totals.promptTokens += usage.promptTokens;
  totals.completionTokens += usage.completionTokens;
  totals.cachedTokens += usage.cachedTokens;
  totals.reasoningTokens += usage.reasoningTokens;
  totals.totalTokens += usage.totalTokens;
}

function toGenerationUsage(model: string, totals: UsageTotals): GenerationUsage {
  return {
    model,
    promptTokens: totals.promptTokens,
    completionTokens: totals.completionTokens,
    cachedTokens: totals.cachedTokens,
    ...(totals.reasoningTokens > 0 ? { reasoningTokens: totals.reasoningTokens } : {}),
    totalTokens: totals.totalTokens || totals.promptTokens + totals.completionTokens,
  };
}

function abortError(): ProviderError {
  return new ProviderError("aborted", "已取消生成", { retryable: false });
}

function isAbortLike(error: unknown): boolean {
  if (error instanceof ProviderError) return error.kind === "aborted";
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function truncate(text: string, max: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function normalizeClientFiles(files: FileMap | undefined): FileMap {
  const out: FileMap = {};
  if (!files || typeof files !== "object") return out;
  for (const [path, content] of Object.entries(files)) {
    const cleanPath = sanitizeFilePath(path);
    if (!cleanPath || typeof content !== "string" || byteSize(content) > MAX_FILE_BYTES) continue;
    out[cleanPath] = content;
  }
  return out;
}

function hasRequiredFiles(files: FileMap): boolean {
  return ["index.html", "styles.css", "app.js"].every((path) => typeof files[path] === "string" && files[path].trim().length > 0);
}

function toolMessage(toolCallId: string, payload: Record<string, unknown>): ChatMessage {
  return { role: "tool", tool_call_id: toolCallId, content: JSON.stringify(payload) };
}

function toolError(toolCallId: string, message: string): ChatMessage {
  return toolMessage(toolCallId, { ok: false, error: message });
}

interface PlanResult {
  plan: AppPlan;
  usage: TokenUsage | null;
}

async function collectPlan(
  provider: ResolvedProvider,
  request: ChatRequest,
  signal: AbortSignal | undefined,
  timeoutMs: number,
  sessionId?: string,
  reasoningEffort?: ReasoningEffort,
): Promise<PlanResult> {
  const messages = buildPlanMessages(request);
  let raw = "";
  let usage: TokenUsage | null = null;
  for await (const delta of streamChatCompletion({
    provider,
    messages,
    signal,
    timeoutMs,
    temperature: 0.45,
    // Reasoning models spend part of this budget on hidden reasoning tokens.
    maxTokens: readEnvInt("LLM_PLAN_MAX_TOKENS", 3_000, 500, 16_000),
    reasoningEffort,
    sessionId,
  })) {
    if (delta.content) raw += delta.content;
    if (delta.usage) usage = mergeTokenUsage(usage, delta.usage);
  }
  return { plan: parsePlanResponse(raw, request), usage };
}

/** One model turn: stream text + tool calls, execute them, append tool messages. */
async function* runToolTurn(messages: ChatMessage[], ctx: TurnContext): AsyncGenerator<AgentEvent, TurnResult> {
  const remaining = Math.max(5_000, ctx.deadline - ctx.now());
  const timeoutMs = Math.min(ctx.turnTimeoutMs, remaining);
  const accumulator = new ToolCallAccumulator();
  let text = "";
  let lastPingAt = ctx.now();
  let usage: TokenUsage | null = null;

  for await (const delta of streamChatCompletion({
    provider: ctx.provider,
    messages,
    tools: TOOL_DEFINITIONS,
    signal: ctx.signal,
    timeoutMs,
    idleTimeoutMs: Math.min(ctx.idleTimeoutMs, timeoutMs),
    temperature: 0.35,
    maxTokens: readEnvInt("LLM_CODING_MAX_TOKENS", 12_000, 1_000, 32_000),
    reasoningEffort: ctx.reasoningEffort,
    sessionId: ctx.sessionId,
  })) {
    if (delta.usage) usage = mergeTokenUsage(usage, delta.usage);
    if (delta.content) {
      text += delta.content;
      if (text.length <= MAX_ASSISTANT_TEXT) {
        yield { type: "assistant_delta", delta: delta.content };
      }
    }
    if (delta.toolCalls) accumulator.push(delta.toolCalls);
    const nowMs = ctx.now();
    if (nowMs - lastPingAt >= 15_000) {
      lastPingAt = nowMs;
      yield { type: "status", message: "正在生成代码…" };
    }
  }

  const calls = accumulator.snapshot();
  for (const call of calls) {
    if (!call.id) call.id = `call_${ctx.state.seq++}`;
  }
  messages.push({
    role: "assistant",
    content: text.length > 0 ? text : "",
    ...(calls.length > 0 ? { tool_calls: calls } : {}),
  });
  if (calls.length === 0) {
    return { text, toolCalls: 0, finished: false, usage };
  }

  const handled = new Set<string>();
  let finished = false;

  for (const call of calls) {
    if (ctx.signal?.aborted) throw abortError();
    const toolName = call.function.name;
    const toolId = call.id;
    const parsed = parseToolArguments(call.function.arguments);

    if (toolName === "finish") {
      yield { type: "tool_start", id: toolId, tool: "finish", label: "完成构建" };
      if (!parsed.ok) {
        handled.add(toolId);
        yield { type: "tool_result", id: toolId, ok: false, summary: parsed.error };
        messages.push(toolError(toolId, parsed.error));
        continue;
      }
      const summary = typeof parsed.value.summary === "string" ? parsed.value.summary.trim().slice(0, 200) : "";
      const appName = typeof parsed.value.app_name === "string" ? parsed.value.app_name.trim().slice(0, 24) : "";
      ctx.state.finished = true;
      if (summary) ctx.state.finishSummary = summary;
      if (appName) ctx.state.finishAppName = appName;
      handled.add(toolId);
      yield { type: "tool_result", id: toolId, ok: true, summary: summary || "构建完成" };
      messages.push(toolMessage(toolId, { ok: true, summary: "已记录完成信号" }));
      finished = true;
      break;
    }

    if (toolName === "write_file") {
      const attemptedPath = parsed.ok && typeof parsed.value.path === "string" ? sanitizeFilePath(parsed.value.path) : null;
      yield { type: "tool_start", id: toolId, tool: "write_file", label: `写入 ${attemptedPath ?? "文件"}` };
      if (!parsed.ok) {
        handled.add(toolId);
        yield { type: "tool_result", id: toolId, ok: false, summary: parsed.error };
        messages.push(toolError(toolId, parsed.error));
        continue;
      }
      if (!attemptedPath) {
        const message = `路径不合法，只允许写入 index.html / styles.css / app.js / README.md / favicon.svg。`;
        handled.add(toolId);
        yield { type: "tool_result", id: toolId, ok: false, summary: message };
        messages.push(toolError(toolId, message));
        continue;
      }
      const content = parsed.value.content;
      if (typeof content !== "string") {
        const message = "write_file 缺少字符串类型的 content 参数，请提供完整文件内容。";
        handled.add(toolId);
        yield { type: "tool_result", id: toolId, ok: false, summary: message };
        messages.push(toolError(toolId, message));
        continue;
      }
      const size = byteSize(content);
      if (size > MAX_FILE_BYTES) {
        const message = `文件过大（${formatKb(size)}），单文件上限 ${formatKb(MAX_FILE_BYTES)}，请精简内容后重写。`;
        handled.add(toolId);
        yield { type: "tool_result", id: toolId, ok: false, summary: message };
        messages.push(toolError(toolId, message));
        continue;
      }
      const chunks = splitForStreaming(content);
      for (const chunk of chunks) {
        if (ctx.signal?.aborted) throw abortError();
        yield { type: "file_delta", path: attemptedPath, delta: chunk };
        await pause(STREAM_CHUNK_PAUSE_MS);
      }
      yield { type: "file_done", path: attemptedPath, content };
      ctx.state.files[attemptedPath] = content;
      handled.add(toolId);
      const summary = `已写入 ${attemptedPath}（${formatKb(size)}）`;
      yield { type: "tool_result", id: toolId, ok: true, summary };
      messages.push(toolMessage(toolId, { ok: true, path: attemptedPath, bytes: size }));
      continue;
    }

    if (toolName === "read_file") {
      const attemptedPath = parsed.ok && typeof parsed.value.path === "string" ? sanitizeFilePath(parsed.value.path) : null;
      yield { type: "tool_start", id: toolId, tool: "read_file", label: `读取 ${attemptedPath ?? "文件"}` };
      if (!parsed.ok) {
        handled.add(toolId);
        yield { type: "tool_result", id: toolId, ok: false, summary: parsed.error };
        messages.push(toolError(toolId, parsed.error));
        continue;
      }
      if (!attemptedPath) {
        const message = "路径不合法，只允许访问应用内的白名单文件。";
        handled.add(toolId);
        yield { type: "tool_result", id: toolId, ok: false, summary: message };
        messages.push(toolError(toolId, message));
        continue;
      }
      const content = ctx.state.files[attemptedPath];
      if (content === undefined) {
        const message = `文件不存在：${attemptedPath}`;
        handled.add(toolId);
        yield { type: "tool_result", id: toolId, ok: false, summary: message };
        messages.push(toolError(toolId, message));
        continue;
      }
      handled.add(toolId);
      const summary = `已读取 ${attemptedPath}（${formatKb(byteSize(content))}）`;
      yield { type: "tool_result", id: toolId, ok: true, summary };
      messages.push(toolMessage(toolId, { ok: true, path: attemptedPath, content: content.slice(0, 120_000) }));
      continue;
    }

    if (toolName === "list_files") {
      yield { type: "tool_start", id: toolId, tool: "list_files", label: "查看文件列表" };
      const entries = Object.keys(ctx.state.files).map((path) => ({
        path,
        bytes: byteSize(ctx.state.files[path] ?? ""),
      }));
      handled.add(toolId);
      yield {
        type: "tool_result",
        id: toolId,
        ok: true,
        summary: entries.length > 0 ? entries.map((entry) => entry.path).join("、") : "暂无文件",
      };
      messages.push(toolMessage(toolId, { ok: true, files: entries }));
      continue;
    }

    if (toolName === "delete_file") {
      const attemptedPath = parsed.ok && typeof parsed.value.path === "string" ? sanitizeFilePath(parsed.value.path) : null;
      yield { type: "tool_start", id: toolId, tool: "delete_file", label: `删除 ${attemptedPath ?? "文件"}` };
      if (!parsed.ok || !attemptedPath) {
        const message = parsed.ok ? "路径不合法，无法删除。" : parsed.error;
        handled.add(toolId);
        yield { type: "tool_result", id: toolId, ok: false, summary: message };
        messages.push(toolError(toolId, message));
        continue;
      }
      if (ctx.state.files[attemptedPath] === undefined) {
        const message = `文件不存在：${attemptedPath}`;
        handled.add(toolId);
        yield { type: "tool_result", id: toolId, ok: false, summary: message };
        messages.push(toolError(toolId, message));
        continue;
      }
      delete ctx.state.files[attemptedPath];
      handled.add(toolId);
      yield { type: "tool_result", id: toolId, ok: true, summary: `已删除 ${attemptedPath}` };
      messages.push(toolMessage(toolId, { ok: true, path: attemptedPath }));
      continue;
    }

    // Unknown tool: reply with an error so the model can course-correct next turn.
    const message = `未知工具：${toolName || "（空）"}。可用工具：write_file / read_file / list_files / delete_file / finish。`;
    handled.add(toolId);
    messages.push(toolError(toolId, message));
  }

  for (const call of calls) {
    if (!handled.has(call.id)) messages.push(toolError(call.id, "该工具调用已被跳过。"));
  }

  return { text, toolCalls: calls.length, finished, usage };
}

function friendlyError(error: unknown, provider: ResolvedProvider): { message: string; retryable: boolean } {
  if (error instanceof ProviderError) {
    const keyHint = provider.source === "byok" ? "请检查设置中的 API Key 与接口地址。" : "请检查服务端 LLM_API_KEY 配置。";
    switch (error.kind) {
      case "auth":
        return { message: `${error.message}。${keyHint}`, retryable: false };
      case "rate_limit":
        return { message: `${error.message}。请稍等片刻后重试。`, retryable: true };
      case "bad_request":
        return { message: `${error.message}。请检查模型名称与接口地址。`, retryable: false };
      case "timeout":
        return { message: `${error.message}。可以简化需求后重试。`, retryable: true };
      case "config":
        return { message: error.message, retryable: false };
      case "network":
        return { message: `${error.message}。请检查网络后重试。`, retryable: true };
      case "aborted":
        return { message: "已取消生成。", retryable: false };
      default:
        return { message: error.message, retryable: error.retryable };
    }
  }
  const detail = error instanceof Error ? error.message : String(error);
  return { message: `生成失败：${truncate(detail, 300)}`, retryable: true };
}

function buildDoneSummary(
  mode: "generate" | "refine",
  plan: AppPlan,
  state: RunState,
  issues: ValidationIssue[],
): string {
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const parts: string[] = [];
  if (state.finishSummary) parts.push(state.finishSummary);
  else parts.push(mode === "refine" ? `已更新「${plan.name}」` : `已生成「${plan.name}」`);
  parts.push(`共 ${Object.keys(state.files).length} 个文件`);
  if (!state.finished) parts.push("达到本轮步数/时间上限，已交付当前结果");
  if (errorCount > 0) parts.push(`自动修复后仍有 ${errorCount} 个校验问题，可继续对话让我修复`);
  return truncate(parts.join("；"), 300);
}

/**
 * Run the agent for one chat turn. Yields `AgentEvent`s in the order required by
 * `docs/CONTRACT.md`, falling back to the deterministic mock agent when no key exists.
 */
export async function* runAgent(request: ChatRequest, options: RunAgentOptions = {}): AsyncGenerator<AgentEvent> {
  if (!request || typeof request.message !== "string" || !request.message.trim()) {
    yield { type: "error", message: "请求缺少有效的需求描述。", retryable: false };
    return;
  }

  // `MOCK_LLM=1` only disables the server-owned key; a BYOK key from the request
  // still resolves a real provider (see resolveProvider).
  const provider = options.forceMock ? null : resolveProvider(request.provider);
  if (!provider) {
    yield* runMockAgent(request, options);
    return;
  }

  const now = options.now ?? (() => Date.now());
  const totalBudgetMs = readEnvMilliseconds("AGENT_BUDGET_MS", DEFAULT_TOTAL_BUDGET_MS, 30_000, 900_000);
  const turnTimeoutMs = readEnvMilliseconds(
    "LLM_REQUEST_TIMEOUT_MS",
    DEFAULT_TURN_TIMEOUT_MS,
    15_000,
    600_000,
  );
  const idleTimeoutMs = readEnvMilliseconds("LLM_IDLE_TIMEOUT_MS", DEFAULT_IDLE_TIMEOUT_MS, 10_000, 300_000);
  const planTimeoutMs = Math.min(turnTimeoutMs, DEFAULT_PLAN_TIMEOUT_MS);
  const deadline = now() + totalBudgetMs;
  const mode = effectiveMode(request);
  const state: RunState = {
    files: mode === "refine" ? normalizeClientFiles(request.files) : {},
    seq: 0,
    steps: 0,
    toolTurns: 0,
    finished: false,
    finishSummary: "",
    finishAppName: "",
  };
  let plan: AppPlan | null = null;
  // Conversation-stable id used by session-aware gateways for routing / prompt caching.
  const sessionId =
    (request.projectId || "atoms-session").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 96) ||
    "atoms-session";
  const reasoningEffort =
    normalizeReasoningEffort(request.reasoningEffort) ??
    normalizeReasoningEffort(request.provider?.reasoningEffort);
  const usageTotals = createUsageTotals();

  try {
    yield { type: "phase", phase: "planning", label: "正在理解需求并规划应用" };
    const planResult = await collectPlan(
      provider,
      request,
      options.signal,
      Math.max(8_000, Math.min(planTimeoutMs, deadline - now())),
      sessionId,
      reasoningEffort,
    );
    plan = planResult.plan;
    addUsage(usageTotals, planResult.usage);
    state.steps += 1;
    yield { type: "plan", plan };

    yield {
      type: "phase",
      phase: "coding",
      label: mode === "refine" ? "正在按新需求调整应用" : "正在编写代码",
    };

    const messages = buildCodingMessages(request, plan, state.files);
    const ctx: TurnContext = {
      provider,
      state,
      signal: options.signal,
      deadline,
      turnTimeoutMs,
      idleTimeoutMs,
      now,
      sessionId,
      reasoningEffort,
    };

    while (state.toolTurns < MAX_TOOL_TURNS && !state.finished) {
      if (options.signal?.aborted) throw abortError();
      if (now() >= deadline) {
        yield { type: "status", message: "已达到本轮生成时间上限，将交付当前结果" };
        break;
      }
      state.toolTurns += 1;
      state.steps += 1;
      const turn = yield* runToolTurn(messages, ctx);
      addUsage(usageTotals, turn.usage);
      if (turn.finished) break;
      if (turn.toolCalls === 0) {
        if (hasRequiredFiles(state.files)) break;
        messages.push({ role: "user", content: buildNudgeInstruction(state.files) });
      }
    }

    if (Object.keys(state.files).length === 0) {
      yield { type: "error", message: "模型没有写出任何文件，请重试。", retryable: true };
      return;
    }
    if (!state.finished && state.toolTurns >= MAX_TOOL_TURNS) {
      yield { type: "status", message: "已达成本轮步数上限，基于当前文件继续校验" };
    }

    yield { type: "phase", phase: "validating", label: "正在校验生成结果" };
    let issues = validateApp(state.files);
    yield { type: "validation", ok: !hasValidationErrors(issues), issues };

    if (hasValidationErrors(issues)) {
      yield { type: "phase", phase: "fixing", label: "正在自动修复校验问题" };
      const errorIssues = issues.filter((issue) => issue.severity === "error");
      const affectedFiles = [...new Set(errorIssues.map((issue) => issue.file))].filter(
        (path) => typeof state.files[path] === "string",
      );
      const repairTargets = affectedFiles.length > 0 ? affectedFiles : Object.keys(state.files);
      messages.push({
        role: "user",
        content: buildRepairInstruction(formatValidationIssues(issues, 8), state.files, repairTargets),
      });
      for (let repair = 0; repair < MAX_REPAIR_TURNS && state.toolTurns < MAX_TOOL_TURNS; repair += 1) {
        if (options.signal?.aborted) throw abortError();
        if (now() >= deadline) break;
        state.toolTurns += 1;
        state.steps += 1;
        const repairTurn = yield* runToolTurn(messages, ctx);
        addUsage(usageTotals, repairTurn.usage);
        if (repairTurn.finished || repairTurn.toolCalls === 0) break;
      }
      issues = validateApp(state.files);
      yield { type: "validation", ok: !hasValidationErrors(issues), issues };
      const errorCount = issues.filter((issue) => issue.severity === "error").length;
      if (errorCount > 0) {
        yield { type: "status", message: `自动修复后仍有 ${errorCount} 个校验问题，可继续对话让我修复` };
      }
    }

    const basePlan = plan ?? synthesizePlan(request);
    const finalPlan: AppPlan = state.finishAppName ? { ...basePlan, name: state.finishAppName } : basePlan;
    yield { type: "usage", usage: toGenerationUsage(provider.model, usageTotals) };
    yield {
      type: "done",
      files: state.files,
      plan: finalPlan,
      summary: buildDoneSummary(mode, finalPlan, state, issues),
      stats: { steps: state.steps, mock: false },
    };
  } catch (error) {
    if (options.signal?.aborted || isAbortLike(error)) return;
    const fileCount = Object.keys(state.files).length;

    // Partial success: if any file was already produced, deliver a usable version
    // instead of failing the whole run (budget/timeout/upstream interruption).
    if (fileCount > 0 && plan) {
      const issues = validateApp(state.files);
      yield { type: "validation", ok: !hasValidationErrors(issues), issues };
      const budgetLike = error instanceof ProviderError && error.kind === "timeout";
      const reason = budgetLike ? "生成时间预算用尽" : "生成过程中断";
      yield { type: "status", message: `${reason}，先交付当前可用版本` };
      const errorCount = issues.filter((issue) => issue.severity === "error").length;
      const extra = errorCount > 0 ? `；当前有 ${errorCount} 个校验问题` : "";
      const finalPlan: AppPlan = state.finishAppName ? { ...plan, name: state.finishAppName } : plan;
      yield { type: "usage", usage: toGenerationUsage(provider.model, usageTotals) };
      yield {
        type: "done",
        files: state.files,
        plan: finalPlan,
        summary: `已生成可用版本（${reason}，部分细节可能未完成）${extra}。可以继续对话让我补完剩余细节。`,
        stats: { steps: state.steps, mock: false },
      };
      return;
    }

    const friendly = friendlyError(error, provider);
    yield { type: "error", message: friendly.message, retryable: friendly.retryable };
  }
}
