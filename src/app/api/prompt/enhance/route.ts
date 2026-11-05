/**
 * POST /api/prompt/enhance — expands a one-line app idea into an implementation
 * ready brief for the build agent.
 *
 * Provider order: BYOK override -> server key -> deterministic mock.
 * Not counted against the generation quota, but limited per IP separately.
 */
import { NextResponse } from "next/server";

import { normalizeReasoningEffort } from "@/lib/agent/config";
import { runPromptEnhancement } from "@/lib/agent/enhance";
import { ProviderError } from "@/lib/agent/provider";
import { consumePromptEnhanceQuota, getClientIdentity } from "@/lib/agent/ratelimit";
import type {
  PromptEnhanceRequest,
  PromptEnhanceResponse,
  ProviderOverride,
  ReasoningEffort,
} from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_INPUT_CHARS = 2_000;

class BadRequestError extends Error {}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseReasoningEffort(raw: unknown): ReasoningEffort | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const normalized = normalizeReasoningEffort(raw);
  if (!normalized) throw new BadRequestError("reasoningEffort 必须是 low / medium / high / max 之一。");
  return normalized;
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
  const reasoningEffort = parseReasoningEffort(record.reasoningEffort);
  if (reasoningEffort) provider.reasoningEffort = reasoningEffort;
  return Object.keys(provider).length > 0 ? provider : undefined;
}

function parseRequest(body: unknown): PromptEnhanceRequest {
  const record = asRecord(body);
  if (!record) throw new BadRequestError("请求体必须是 JSON 对象。");
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (!message) throw new BadRequestError("message 不能为空。");
  if (message.length > MAX_INPUT_CHARS) {
    throw new BadRequestError(`message 过长（上限 ${MAX_INPUT_CHARS} 字）。`);
  }
  const provider = parseProvider(record.provider);
  const reasoningEffort = parseReasoningEffort(record.reasoningEffort) ?? provider?.reasoningEffort;
  return {
    message,
    ...(provider ? { provider } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ProviderError) {
    if (error.kind === "rate_limit") {
      return NextResponse.json(
        { error: `${error.message}。请稍后再试。` },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "20" } },
      );
    }
    if (error.kind === "timeout") {
      return NextResponse.json(
        { error: "提示词扩写超时，请稍后重试。" },
        { status: 504, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error.kind === "auth") {
      return NextResponse.json(
        { error: `${error.message}。请检查模型设置中的 API Key。` },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: error.message },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { error: "提示词扩写失败，请稍后重试。" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<NextResponse<PromptEnhanceResponse> | NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体必须是合法 JSON。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let enhanceRequest: PromptEnhanceRequest;
  try {
    enhanceRequest = parseRequest(body);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "请求体格式不正确。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const identity = getClientIdentity(request);
  const limit = consumePromptEnhanceQuota(identity.ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.message },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(limit.retryAfterSec),
          "X-RateLimit-Reset": String(Math.floor(limit.resetAt / 1000)),
        },
      },
    );
  }

  try {
    const result = await runPromptEnhancement(enhanceRequest);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
