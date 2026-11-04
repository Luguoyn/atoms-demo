/**
 * POST /api/chat — runs the server-side agent and streams `AgentEvent`s as SSE.
 * The upstream provider call is aborted when the client disconnects.
 */
import { NextResponse } from "next/server";

import { runAgent } from "@/lib/agent";
import { MAX_FILE_BYTES } from "@/lib/agent/tools";
import type { AgentEvent, ChatRequest, ChatTurn, FileMap, ProviderOverride } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Agent budget defaults to 300s (AGENT_BUDGET_MS overrides); keep this >= that value.
export const maxDuration = 300;

const MAX_MESSAGE_CHARS = 8_000;
const MAX_PROJECT_ID_CHARS = 120;
const MAX_HISTORY_TURNS = 20;
const MAX_HISTORY_CONTENT_CHARS = 4_000;
const MAX_FILES = 24;
const MAX_TOTAL_FILE_CHARS = 600_000;

const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

class BadRequestError extends Error {}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function parseFiles(raw: unknown): FileMap {
  if (raw === undefined || raw === null) return {};
  const record = asRecord(raw);
  if (!record) throw new BadRequestError("files 必须是对象。");
  const entries = Object.entries(record);
  if (entries.length > MAX_FILES) throw new BadRequestError(`files 数量超过上限（${MAX_FILES}）。`);
  const files: FileMap = {};
  let totalChars = 0;
  for (const [path, content] of entries) {
    if (path === "__proto__" || path === "constructor" || path === "prototype") continue;
    if (typeof content !== "string") throw new BadRequestError(`files.${path} 必须是字符串。`);
    if (content.length > MAX_FILE_BYTES) throw new BadRequestError(`文件 ${path} 超过大小上限。`);
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_FILE_CHARS) throw new BadRequestError("files 总体积过大。");
    files[path] = content;
  }
  return files;
}

function parseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const history: ChatTurn[] = [];
  for (const item of raw.slice(-MAX_HISTORY_TURNS)) {
    const record = asRecord(item);
    if (!record) continue;
    const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
    const content = typeof record.content === "string" ? record.content.trim().slice(0, MAX_HISTORY_CONTENT_CHARS) : "";
    if (!role || !content) continue;
    history.push({ role, content });
  }
  return history;
}

function parseProvider(raw: unknown): ProviderOverride | undefined {
  if (raw === undefined || raw === null) return undefined;
  const record = asRecord(raw);
  if (!record) throw new BadRequestError("provider 必须是对象。");
  const provider: ProviderOverride = {};
  if (typeof record.baseUrl === "string" && record.baseUrl.trim()) {
    const baseUrl = record.baseUrl.trim().slice(0, 300);
    if (!/^https?:\/\//i.test(baseUrl)) throw new BadRequestError("provider.baseUrl 必须以 http(s):// 开头。");
    provider.baseUrl = baseUrl;
  }
  if (typeof record.apiKey === "string" && record.apiKey.trim()) {
    provider.apiKey = record.apiKey.trim().slice(0, 500);
  }
  if (typeof record.model === "string" && record.model.trim()) {
    provider.model = record.model.trim().slice(0, 120);
  }
  return Object.keys(provider).length > 0 ? provider : undefined;
}

function parseChatRequest(body: unknown): ChatRequest {
  const record = asRecord(body);
  if (!record) throw new BadRequestError("请求体必须是 JSON 对象。");

  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (!message) throw new BadRequestError("message 不能为空。");
  if (message.length > MAX_MESSAGE_CHARS) throw new BadRequestError(`message 过长（上限 ${MAX_MESSAGE_CHARS} 字）。`);

  const projectId =
    typeof record.projectId === "string" && record.projectId.trim()
      ? record.projectId.trim().slice(0, MAX_PROJECT_ID_CHARS)
      : "anonymous";

  const files = parseFiles(record.files);
  const history = parseHistory(record.history);
  const mode: ChatRequest["mode"] = record.mode === "refine" ? "refine" : "generate";
  const provider = parseProvider(record.provider);

  return {
    projectId,
    message,
    files,
    history,
    mode,
    ...(provider ? { provider } : {}),
  };
}

/* ----------------------- public demo guard rails (in-memory) --------------- */
/**
 * When the deployment uses the server's own key (a public demo), a tiny in-memory
 * limiter protects it from accidental or abusive spend. Per-process only, which is
 * exactly what the single-instance tunneled demo needs; serverless platforms would
 * need a shared store for a strict global limit.
 */
const QUOTA_WINDOW_MS = 60 * 60 * 1000;
const IP_LIMIT = readPositiveInt("RATE_LIMIT_PER_HOUR", 12);
const MAX_CONCURRENT = readPositiveInt("RATE_LIMIT_CONCURRENT", 2);
const ipHits = new Map<string, { count: number; resetAt: number }>();
let activeGenerations = 0;

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.trunc(value);
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

function consumeQuota(ip: string):
  | { ok: true }
  | { ok: false; retryAfterSec: number; reason: string } {
  const now = Date.now();
  const bucket = ipHits.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    ipHits.set(ip, { count: 1, resetAt: now + QUOTA_WINDOW_MS });
    if (ipHits.size > 5000) {
      for (const [key, value] of ipHits) {
        if (value.resetAt <= now) ipHits.delete(key);
      }
    }
    return { ok: true };
  }
  if (bucket.count >= IP_LIMIT) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      reason: `这个 IP 本小时的演示生成额度已用完（上限 ${IP_LIMIT} 次/小时），请稍后再试；也可以在右上角「模型设置」里填写自己的 API Key 继续使用。`,
    };
  }
  bucket.count += 1;
  return { ok: true };
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("请求体必须是合法 JSON。", 400);
  }

  let chatRequest: ChatRequest;
  try {
    chatRequest = parseChatRequest(body);
  } catch (error) {
    if (error instanceof BadRequestError) return jsonError(error.message, 400);
    return jsonError("请求体格式不正确。", 400);
  }

  // Guard rails only apply to generations that spend the server's key; BYOK users
  // pay with their own key and are not throttled by the demo quota.
  const usesServerKey = !chatRequest.provider?.apiKey;
  let slotAcquired = false;
  let slotReleased = false;
  const releaseSlot = (): void => {
    if (!slotAcquired || slotReleased) return;
    slotReleased = true;
    activeGenerations = Math.max(0, activeGenerations - 1);
  };
  if (usesServerKey) {
    const quota = consumeQuota(clientIp(request));
    if (!quota.ok) {
      return NextResponse.json(
        { error: quota.reason },
        {
          status: 429,
          headers: { "Cache-Control": "no-store", "Retry-After": String(quota.retryAfterSec) },
        },
      );
    }
    if (activeGenerations >= MAX_CONCURRENT) {
      return NextResponse.json(
        {
          error: `当前同时在生成的人较多（并发上限 ${MAX_CONCURRENT}），请等几秒再试；也可以在右上角「模型设置」里填写自己的 API Key 继续使用。`,
        },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "10" } },
      );
    }
    activeGenerations += 1;
    slotAcquired = true;
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const onClientAbort = (): void => {
    abortController.abort();
  };
  if (request.signal.aborted) {
    abortController.abort();
  } else {
    request.signal.addEventListener("abort", onClientAbort, { once: true });
  }

  let streamClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent): void => {
        if (streamClosed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of runAgent(chatRequest, { signal: abortController.signal })) {
          if (abortController.signal.aborted) break;
          send(event);
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          const message = error instanceof Error ? error.message : "生成失败，请重试。";
          try {
            send({ type: "error", message: message.slice(0, 400), retryable: true });
          } catch {
            // The client may already be gone; nothing else to send.
          }
        }
      } finally {
        streamClosed = true;
        releaseSlot();
        request.signal.removeEventListener("abort", onClientAbort);
        try {
          controller.close();
        } catch {
          // Stream was already cancelled by the client.
        }
      }
    },
    cancel() {
      streamClosed = true;
      releaseSlot();
      abortController.abort();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
