/**
 * Minimal OpenAI-compatible chat-completions client with streaming support.
 * Handles incremental `tool_calls` deltas (DeepSeek style), timeouts, cancellation
 * and user-safe error classification. API keys are redacted from every message.
 */
import type { ReasoningEffort } from "@/types";

import { normalizeReasoningEffort, type ResolvedProvider } from "./config";

export type ProviderErrorKind =
  | "auth"
  | "rate_limit"
  | "bad_request"
  | "network"
  | "timeout"
  | "truncated"
  | "aborted"
  | "upstream"
  | "config";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
  readonly status?: number;
  /** Token accounting for the failed completion, when the upstream reported it. */
  readonly usage?: TokenUsage;

  constructor(
    kind: ProviderErrorKind,
    message: string,
    options: { retryable?: boolean; status?: number; usage?: TokenUsage } = {},
  ) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.retryable =
      options.retryable ??
      (kind === "network" ||
        kind === "timeout" ||
        kind === "truncated" ||
        kind === "rate_limit" ||
        kind === "upstream");
    this.status = options.status;
    this.usage = options.usage;
  }
}

export interface ToolCallPayload {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCallPayload[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  arguments?: string;
}

/** Token accounting parsed from one completion (all fields default to 0). */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface ChatCompletionDelta {
  content?: string;
  toolCalls?: ToolCallDelta[];
  finishReason?: string | null;
  usage?: TokenUsage;
  /**
   * True when the completion hit the output budget (`finish_reason="length"` or
   * `completion_tokens >= max_tokens`). Tool-call arguments in such a turn are
   * likely truncated; the loop uses this to retry with a larger budget / append.
   */
  truncated?: boolean;
}

export interface StreamChatOptions {
  provider: ResolvedProvider;
  messages: ChatMessage[];
  tools?: unknown[];
  signal?: AbortSignal;
  /** Total time budget for this single completion (ms). */
  timeoutMs?: number;
  /** Abort when no stream chunk arrives for this long (ms). Resets on every chunk. */
  idleTimeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  /** Per-request reasoning budget (overrides `LLM_REASONING_EFFORT`). */
  reasoningEffort?: ReasoningEffort;
  /**
   * Stable identifier of the conversation, forwarded to gateways that route by
   * session (e.g. OpenCode Go expects `x-opencode-session` for prompt caching).
   */
  sessionId?: string;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 8_000;
const CLIENT_USER_AGENT =
  process.env.LLM_USER_AGENT?.trim() ||
  "atoms-demo/0.1 (coding-agent; +https://github.com/Luguoyn/atoms-demo)";

/** Optional `LLM_EXTRA_HEADERS` JSON, e.g. `{"x-api-key":"...","x-org":"acme"}`. */
let cachedExtraHeaders: Record<string, string> | null | undefined;
function extraHeaders(): Record<string, string> {
  if (cachedExtraHeaders !== undefined) return cachedExtraHeaders ?? {};
  const raw = process.env.LLM_EXTRA_HEADERS?.trim();
  if (!raw) {
    cachedExtraHeaders = null;
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "string" && /^[A-Za-z0-9-]+$/.test(name)) headers[name] = value;
    }
    cachedExtraHeaders = headers;
    return headers;
  } catch {
    cachedExtraHeaders = null;
    return {};
  }
}

function readEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(raw)));
}

/**
 * Request headers shared by all OpenAI-compatible gateways, plus the OpenCode Go
 * convention: identify the client and echo a stable conversation session id.
 */
function buildRequestHeaders(provider: ResolvedProvider, sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    Authorization: `Bearer ${provider.apiKey}`,
    "User-Agent": CLIENT_USER_AGENT,
    ...extraHeaders(),
  };
  let host = "";
  try {
    host = new URL(provider.baseUrl).hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (host.endsWith("opencode.ai")) {
    const session = (sessionId ?? "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 96);
    headers["x-opencode-session"] = session || `atoms-${Date.now().toString(36)}`;
  }
  return headers;
}

interface WireToolCall {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface WireMessage {
  content?: string | null;
  tool_calls?: WireToolCall[];
}

interface WireChoice {
  delta?: WireMessage;
  message?: WireMessage;
  finish_reason?: string | null;
}

interface WireUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
  /** OpenCode Go style nested usage. */
  opencode?: { tokens?: { cache_read?: number } };
  /** Anthropic-style cache field some gateways expose. */
  cache_read_input_tokens?: number;
}

interface WireChunk {
  choices?: WireChoice[];
  usage?: WireUsage;
  error?: { message?: string; type?: string; code?: string | number };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Parse usage from any of the known OpenAI-compatible shapes; null when absent. */
function parseWireUsage(raw: unknown): TokenUsage | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const usage = raw as WireUsage;
  const promptTokens = numberOrZero(usage.prompt_tokens);
  const completionTokens = numberOrZero(usage.completion_tokens);
  const totalTokens = numberOrZero(usage.total_tokens);
  // Three cache-token sources seen in the wild; first non-zero wins.
  const cachedTokens =
    numberOrZero(usage.prompt_tokens_details?.cached_tokens) ||
    numberOrZero(usage.opencode?.tokens?.cache_read) ||
    numberOrZero(usage.cache_read_input_tokens);
  const reasoningTokens = numberOrZero(usage.completion_tokens_details?.reasoning_tokens);
  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0 && cachedTokens === 0 && reasoningTokens === 0) {
    return null;
  }
  return {
    promptTokens,
    completionTokens,
    cachedTokens,
    reasoningTokens,
    totalTokens: totalTokens || promptTokens + completionTokens,
  };
}

/**
 * Some OpenAI-compatible gateways reject `stream_options`; remember the outcome
 * process-wide and transparently retry once without it (only one extra request).
 */
let streamOptionsMode: "unknown" | "supported" | "unsupported" = "unknown";

export function getStreamOptionsSupport(): "unknown" | "supported" | "unsupported" {
  return streamOptionsMode;
}

/** Test hook: forget the negotiated `stream_options` capability. */
export function resetStreamOptionsSupport(): void {
  streamOptionsMode = "unknown";
}

export function resolveChatEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/chat/completions`;
}

function redact(message: string, secret?: string): string {
  let out = message;
  if (secret && secret.length >= 4) out = out.split(secret).join("***");
  return out.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***").slice(0, 600);
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

interface TimeoutState {
  totalExpired: boolean;
  idleExpired: boolean;
}

function transportError(
  error: unknown,
  timeoutState: TimeoutState,
  totalTimeoutMs: number,
  idleTimeoutMs: number,
  outerSignal?: AbortSignal,
  secret?: string,
): ProviderError {
  if (outerSignal?.aborted) return new ProviderError("aborted", "已取消生成", { retryable: false });
  if (timeoutState.totalExpired) {
    return new ProviderError(
      "timeout",
      `模型响应超过 ${Math.round(totalTimeoutMs / 1000)} 秒上限，已中止本次生成`,
      { retryable: true },
    );
  }
  if (timeoutState.idleExpired) {
    return new ProviderError(
      "timeout",
      `模型超过 ${Math.round(idleTimeoutMs / 1000)} 秒没有输出新内容，判定为空闲超时`,
      { retryable: true },
    );
  }
  if (isAbortError(error)) return new ProviderError("aborted", "已取消生成", { retryable: false });
  const detail = error instanceof Error ? error.message : String(error);
  return new ProviderError("network", redact(`无法连接模型服务：${detail}`, secret), { retryable: true });
}

function responseError(status: number, rawBody: string, secret?: string): ProviderError {
  let detail = "";
  try {
    const parsed = JSON.parse(rawBody) as { error?: { message?: string } };
    detail = typeof parsed.error?.message === "string" ? parsed.error.message : "";
  } catch {
    detail = rawBody;
  }
  detail = redact(detail.replace(/\s+/g, " ").trim(), secret).slice(0, 300);
  const suffix = detail ? `：${detail}` : "";

  if (status === 401 || status === 403) {
    return new ProviderError("auth", `模型服务鉴权失败（HTTP ${status}）${suffix}`, { retryable: false, status });
  }
  if (status === 402) {
    return new ProviderError("auth", `模型账户余额不足或额度受限（HTTP 402）${suffix}`, { retryable: false, status });
  }
  if (status === 429) {
    return new ProviderError("rate_limit", `模型服务限流（HTTP 429），请稍后重试${suffix}`, { retryable: true, status });
  }
  if (status === 404) {
    return new ProviderError("bad_request", `模型或接口不存在（HTTP 404），请检查 LLM_BASE_URL / LLM_MODEL${suffix}`, {
      retryable: false,
      status,
    });
  }
  if (status === 400 || status === 422) {
    return new ProviderError("bad_request", `模型请求被拒绝（HTTP ${status}）${suffix}`, { retryable: false, status });
  }
  return new ProviderError("upstream", `模型服务暂时不可用（HTTP ${status}）${suffix}`, {
    retryable: status >= 500,
    status,
  });
}

function convertToolCalls(rawCalls: WireToolCall[] | undefined): ToolCallDelta[] | undefined {
  if (!Array.isArray(rawCalls) || rawCalls.length === 0) return undefined;
  const calls: ToolCallDelta[] = [];
  for (const rawCall of rawCalls) {
    if (!rawCall || typeof rawCall !== "object") continue;
    const index = typeof rawCall.index === "number" && rawCall.index >= 0 ? rawCall.index : calls.length;
    const call: ToolCallDelta = { index };
    if (typeof rawCall.id === "string" && rawCall.id) call.id = rawCall.id;
    const name = rawCall.function?.name;
    if (typeof name === "string" && name) call.name = name;
    const args = rawCall.function?.arguments;
    if (typeof args === "string" && args) call.arguments = args;
    calls.push(call);
  }
  return calls.length > 0 ? calls : undefined;
}

function deltaFromMessage(message: WireMessage | undefined, finishReason?: string | null, fallbackIndex = 0): ChatCompletionDelta {
  const delta: ChatCompletionDelta = {};
  if (typeof message?.content === "string" && message.content.length > 0) delta.content = message.content;
  const calls = convertToolCalls(message?.tool_calls);
  if (calls) delta.toolCalls = calls.map((call, index) => ({ ...call, index: Number.isFinite(call.index) ? call.index : fallbackIndex + index }));
  if (typeof finishReason === "string") delta.finishReason = finishReason;
  return delta;
}

/**
 * Stream a chat completion. Yields text / tool-call deltas as they arrive.
 * Throws `ProviderError` for all failure modes.
 */
export async function* streamChatCompletion(options: StreamChatOptions): AsyncGenerator<ChatCompletionDelta> {
  const { provider, messages, tools, signal } = options;
  if (signal?.aborted) throw new ProviderError("aborted", "已取消生成", { retryable: false });
  if (!provider.apiKey) throw new ProviderError("config", "缺少 API Key", { retryable: false });

  const endpoint = resolveChatEndpoint(provider.baseUrl);
  try {
    new URL(endpoint);
  } catch {
    throw new ProviderError("config", "LLM_BASE_URL 不是合法的接口地址", { retryable: false });
  }

  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 10_000), 600_000);
  const idleTimeoutMs = Math.min(
    Math.max(options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS, 10_000),
    timeoutMs,
  );
  const controller = new AbortController();
  const timeoutState: TimeoutState = { totalExpired: false, idleExpired: false };

  const totalTimer = setTimeout(() => {
    timeoutState.totalExpired = true;
    controller.abort();
  }, timeoutMs);

  // Idle timeout: reset on every chunk so a long-but-progressing generation is not
  // mistaken for a stuck one. Also guards the time-to-first-byte.
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const armIdleTimer = (): void => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timeoutState.idleExpired = true;
      controller.abort();
    }, idleTimeoutMs);
  };
  armIdleTimer();

  const onOuterAbort = (): void => controller.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const tokenBudget = options.maxTokens ?? readEnvInt("LLM_MAX_TOKENS", DEFAULT_MAX_TOKENS, 256, 32_000);
    const payload: Record<string, unknown> = {
      model: provider.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.4,
      max_tokens: tokenBudget,
    };
    // Reasoning models: lower effort is noticeably faster for codegen tasks.
    // Per-request effort wins over the server default; only sent when configured so
    // strict gateways never see an unknown field. NOTE: `minimal` is a trap on
    // reasoning models (it can burn the whole output budget on hidden reasoning),
    // so it is mapped to `low` instead of being forwarded.
    const requestedEffort = normalizeReasoningEffort(options.reasoningEffort);
    const envReasoning = (process.env.LLM_REASONING_EFFORT ?? "").trim().toLowerCase();
    const envReasoningEffort = envReasoning === "minimal" ? "low" : normalizeReasoningEffort(envReasoning);
    const reasoningEffort = requestedEffort ?? envReasoningEffort;
    if (reasoningEffort) payload.reasoning_effort = reasoningEffort;
    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }

    let useStreamOptions = streamOptionsMode !== "unsupported";
    let response: Response | null = null;
    let responseErrorBody = "";
    let responseStatus = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (useStreamOptions) {
        payload.stream_options = { include_usage: true };
      } else {
        delete payload.stream_options;
      }
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: buildRequestHeaders(provider, options.sessionId),
          body: JSON.stringify(payload),
          signal: controller.signal,
          cache: "no-store",
        });
      } catch (error) {
        throw transportError(error, timeoutState, timeoutMs, idleTimeoutMs, signal, provider.apiKey);
      }

      if (response.ok) {
        if (useStreamOptions) streamOptionsMode = "supported";
        break;
      }

      responseStatus = response.status;
      responseErrorBody = await response.text().catch(() => "");
      const rejectedStreamOptions =
        useStreamOptions &&
        (response.status === 400 || response.status === 422) &&
        /stream_options|include_usage|unknown (?:parameter|field|argument)|unsupported/i.test(responseErrorBody);
      if (!rejectedStreamOptions || attempt === 1) {
        throw responseError(response.status, responseErrorBody, provider.apiKey);
      }
      streamOptionsMode = "unsupported";
      useStreamOptions = false;
    }
    if (!response || !response.ok) {
      throw responseError(responseStatus || 500, responseErrorBody, provider.apiKey);
    }
    if (!response.body) {
      throw new ProviderError("upstream", "模型服务没有返回可读取的响应", { retryable: true });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let rawText = "";
    let sawPayload = false;
    let streamDone = false;
    let finishReasonSeen: string | null = null;
    let truncationSeen = false;
    // Holder object: assigned inside the line parser closure, read after the stream.
    const usageTracker: { latest: TokenUsage | null } = { latest: null };

    const handleLine = (line: string): ChatCompletionDelta | null => {
      const trimmed = line.replace(/\r$/, "").trim();
      if (!trimmed || trimmed.startsWith(":")) return null;
      if (!trimmed.startsWith("data:")) return null;
      const data = trimmed.slice(5).trim();
      if (!data) return null;
      if (data === "[DONE]") {
        streamDone = true;
        return null;
      }
      let chunk: WireChunk;
      try {
        chunk = JSON.parse(data) as WireChunk;
      } catch {
        return null;
      }
      if (chunk.error) {
        throw new ProviderError(
          "upstream",
          redact(chunk.error.message ?? "模型服务返回了错误", provider.apiKey),
          { retryable: true },
        );
      }

      const delta: ChatCompletionDelta = {};
      const choice = chunk.choices?.[0];
      if (choice) {
        const fromChoice = deltaFromMessage(choice.delta ?? choice.message, choice.finish_reason);
        if (fromChoice.content !== undefined) delta.content = fromChoice.content;
        if (fromChoice.toolCalls !== undefined) delta.toolCalls = fromChoice.toolCalls;
        if (fromChoice.finishReason !== undefined) {
          delta.finishReason = fromChoice.finishReason;
          finishReasonSeen = fromChoice.finishReason ?? null;
          if (fromChoice.finishReason === "length") {
            delta.truncated = true;
            truncationSeen = true;
          }
        }
      }
      // The final usage chunk usually has an empty `choices` array; keep reading
      // until [DONE] so cache/token accounting is never dropped.
      const usage = parseWireUsage(chunk.usage);
      if (usage) {
        usageTracker.latest = usage;
        delta.usage = usage;
        // Some gateways omit finish_reason but still hit the output ceiling.
        if (usage.completionTokens >= tokenBudget) {
          delta.truncated = true;
          truncationSeen = true;
        }
      }

      if (delta.content !== undefined || delta.toolCalls !== undefined) sawPayload = true;
      if (
        delta.content === undefined &&
        delta.toolCalls === undefined &&
        delta.finishReason === undefined &&
        delta.usage === undefined &&
        delta.truncated === undefined
      ) {
        return null;
      }
      return delta;
    };

    try {
      while (!streamDone) {
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await reader.read();
        } catch (error) {
          throw transportError(error, timeoutState, timeoutMs, idleTimeoutMs, signal, provider.apiKey);
        }
        if (result.done) break;
        armIdleTimer();
        const text = decoder.decode(result.value, { stream: true });
        buffer += text;
        if (rawText.length < 2_000_000) rawText += text;
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");
          const delta = handleLine(line);
          if (delta) yield delta;
          if (streamDone) break;
        }
      }

      if (!sawPayload) {
        // Some OpenAI-compatible gateways ignore `stream: true` and return one JSON body.
        const fallback = parseNonStreamingBody(rawText, provider.apiKey);
        if (fallback) {
          sawPayload = fallback.content !== undefined || fallback.toolCalls !== undefined;
          if (fallback.usage !== undefined || fallback.content !== undefined || fallback.toolCalls !== undefined) {
            yield fallback;
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // The upstream body may already be closed; nothing to clean up.
      }
    }

    if (!sawPayload) {
      // Reasoning models can burn the whole output budget on hidden reasoning and
      // return no visible content. Surface that clearly instead of a generic retry.
      const lastUsage = usageTracker.latest;
      const truncated =
        truncationSeen ||
        finishReasonSeen === "length" ||
        Boolean(lastUsage && lastUsage.completionTokens >= tokenBudget);
      if (truncated) {
        const reasoningShare =
          lastUsage && lastUsage.completionTokens > 0
            ? Math.round((lastUsage.reasoningTokens / lastUsage.completionTokens) * 100)
            : 0;
        throw new ProviderError(
          "truncated",
          `模型输出被截断并达到上限（finish_reason=${finishReasonSeen ?? "length"}，completion_tokens=${lastUsage?.completionTokens ?? tokenBudget}/${tokenBudget}，reasoning_tokens=${lastUsage?.reasoningTokens ?? 0}，约占 ${reasoningShare}%）。请提高输出预算，或精简内容/分段写入（write_file mode:"append"）。`,
          { retryable: true, usage: lastUsage ?? undefined },
        );
      }
      if (lastUsage && (lastUsage.reasoningTokens > 0 || lastUsage.completionTokens > 0)) {
        // Reasoning-only completion (no visible output): same remedy as truncation —
        // raise the output budget and retry. Classified as `truncated` so the loop's
        // targeted retry handles it instead of failing the run.
        throw new ProviderError(
          "truncated",
          `模型只返回了推理内容（reasoning_tokens=${lastUsage.reasoningTokens}，completion_tokens=${lastUsage.completionTokens}），没有可见输出；请提高输出预算（max_tokens）或降低 reasoning effort。`,
          { retryable: true, usage: lastUsage },
        );
      }
      throw new ProviderError("upstream", "模型没有返回任何内容，请重试", { retryable: true });
    }
  } finally {
    clearTimeout(totalTimer);
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    signal?.removeEventListener("abort", onOuterAbort);
    if (!controller.signal.aborted) controller.abort();
  }
}

/** Best-effort support for gateways that return a single JSON completion despite stream:true. */
function parseNonStreamingBody(rawText: string, secret?: string): ChatCompletionDelta | null {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as WireChunk;
    if (parsed.error) {
      throw new ProviderError("upstream", redact(parsed.error.message ?? "模型服务返回了错误", secret), {
        retryable: true,
      });
    }
    const choice = parsed.choices?.[0];
    const delta: ChatCompletionDelta = choice
      ? deltaFromMessage(choice.message ?? choice.delta, choice.finish_reason)
      : {};
    const usage = parseWireUsage(parsed.usage);
    if (usage) delta.usage = usage;
    if (
      delta.content === undefined &&
      delta.toolCalls === undefined &&
      delta.finishReason === undefined &&
      delta.usage === undefined
    ) {
      return null;
    }
    return delta;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    return null;
  }
}

/** Accumulator that merges streamed `tool_calls` deltas into complete calls. */
export class ToolCallAccumulator {
  private readonly calls = new Map<number, { id: string; name: string; arguments: string }>();

  push(deltas: ToolCallDelta[]): void {
    for (const delta of deltas) {
      const current = this.calls.get(delta.index) ?? { id: "", name: "", arguments: "" };
      if (delta.id && !current.id) current.id = delta.id;
      if (delta.name && !current.name) current.name = delta.name;
      if (delta.arguments) current.arguments += delta.arguments;
      this.calls.set(delta.index, current);
    }
  }

  snapshot(): ToolCallPayload[] {
    return [...this.calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, call], position) => ({
        // The loop assigns ids when the provider omitted them; `index_position`
        // keeps the payload shape valid for the (unusual) missing-id case.
        id: call.id || `call_${index}_${position}`,
        type: "function" as const,
        function: { name: call.name, arguments: call.arguments },
      }));
  }

  get size(): number {
    return this.calls.size;
  }
}
