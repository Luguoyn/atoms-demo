/**
 * In-memory per-IP quotas, per-IP prompt-enhance limits and a global concurrency
 * guard, shared by `/api/chat`, `/api/status` and `/api/prompt/enhance`.
 *
 * Single-process only: exactly what the tunneled single-instance demo needs.
 * A multi-instance/serverless deployment would need a shared store (Redis/KV).
 */
const HOUR_MS = 60 * 60 * 1000;
const MAX_BUCKETS = 5_000;

export interface RateLimitConfig {
  /** Hourly quota for generations that spend the server's own key. */
  perHour: number;
  /** Max simultaneous server-key generations across the process. */
  concurrent: number;
  /** Hourly cap for `POST /api/prompt/enhance` (independent bucket). */
  promptEnhancePerHour: number;
}

function readPositiveInt(name: string, fallback: number, min = 1, max = 100_000): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(raw)));
}

/** Read the configured limits (env is re-read so tests/ops can adjust them). */
export function getRateLimitConfig(): RateLimitConfig {
  return {
    perHour: readPositiveInt("RATE_LIMIT_PER_HOUR", 12),
    concurrent: readPositiveInt("RATE_LIMIT_CONCURRENT", 2),
    promptEnhancePerHour: readPositiveInt("PROMPT_ENHANCE_PER_HOUR", 30),
  };
}

/* ------------------------------- client IP -------------------------------- */

export type ClientIpSource = "cf-connecting-ip" | "x-forwarded-for" | "x-real-ip" | "local";

export interface ClientIdentity {
  ip: string;
  source: ClientIpSource;
}

function sanitizeIp(raw: string): string {
  const cleaned = raw.replace(/[^0-9a-fA-F:.]/g, "").slice(0, 64);
  return cleaned || "unknown";
}

/** Best-effort client IP from the usual proxy headers. */
export function getClientIdentity(request: Request): ClientIdentity {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return { ip: sanitizeIp(cf), source: "cf-connecting-ip" };

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return { ip: sanitizeIp(first), source: "x-forwarded-for" };
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return { ip: sanitizeIp(realIp), source: "x-real-ip" };

  return { ip: "local", source: "local" };
}

export function getClientIp(request: Request): string {
  return getClientIdentity(request).ip;
}

/* --------------------------- generation quota ----------------------------- */

export interface QuotaSnapshot {
  limitPerHour: number;
  remaining: number;
  resetAt: number;
  used: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const generationBuckets = new Map<string, Bucket>();
const enhanceBuckets = new Map<string, Bucket>();

function pruneBuckets(map: Map<string, Bucket>, now: number): void {
  if (map.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key);
  }
}

/** Current quota state for an IP without consuming anything (used by /api/status). */
export function getGenerationQuota(ip: string, now = Date.now()): QuotaSnapshot {
  const config = getRateLimitConfig();
  const bucket = generationBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    return {
      limitPerHour: config.perHour,
      remaining: config.perHour,
      resetAt: now + HOUR_MS,
      used: 0,
    };
  }
  return {
    limitPerHour: config.perHour,
    remaining: Math.max(0, config.perHour - bucket.count),
    resetAt: bucket.resetAt,
    used: bucket.count,
  };
}

export type GenerationQuotaResult =
  | { allowed: true; snapshot: QuotaSnapshot }
  | { allowed: false; snapshot: QuotaSnapshot; retryAfterSec: number; message: string };

/** Consume one server-key generation for this IP (fixed one-hour window). */
export function consumeGenerationQuota(ip: string, now = Date.now()): GenerationQuotaResult {
  const config = getRateLimitConfig();
  const bucket = generationBuckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + HOUR_MS;
    generationBuckets.set(ip, { count: 1, resetAt });
    pruneBuckets(generationBuckets, now);
    return {
      allowed: true,
      snapshot: { limitPerHour: config.perHour, remaining: Math.max(0, config.perHour - 1), resetAt, used: 1 },
    };
  }

  if (bucket.count >= config.perHour) {
    return {
      allowed: false,
      snapshot: {
        limitPerHour: config.perHour,
        remaining: 0,
        resetAt: bucket.resetAt,
        used: bucket.count,
      },
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      message: `这个 IP 本小时的演示生成额度已用完（上限 ${config.perHour} 次/小时），请稍后再试；也可以在右上角「模型设置」里填写自己的 API Key 继续使用。`,
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    snapshot: {
      limitPerHour: config.perHour,
      remaining: Math.max(0, config.perHour - bucket.count),
      resetAt: bucket.resetAt,
      used: bucket.count,
    },
  };
}

/* ------------------------- prompt enhance quota --------------------------- */

export type PromptEnhanceQuotaResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; retryAfterSec: number; resetAt: number; message: string };

/** Consume one prompt-enhance call (separate bucket from generations). */
export function consumePromptEnhanceQuota(ip: string, now = Date.now()): PromptEnhanceQuotaResult {
  const config = getRateLimitConfig();
  const bucket = enhanceBuckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + HOUR_MS;
    enhanceBuckets.set(ip, { count: 1, resetAt });
    pruneBuckets(enhanceBuckets, now);
    return { allowed: true, remaining: Math.max(0, config.promptEnhancePerHour - 1), resetAt };
  }

  if (bucket.count >= config.promptEnhancePerHour) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      resetAt: bucket.resetAt,
      message: `提示词扩写次数已达上限（${config.promptEnhancePerHour} 次/小时），请稍后再试。`,
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, config.promptEnhancePerHour - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/* ------------------------------ concurrency -------------------------------- */

let activeGenerations = 0;

export function getActiveGenerationCount(): number {
  return activeGenerations;
}

export type ConcurrencySlotResult =
  | { ok: true; release: () => void }
  | { ok: false; retryAfterSec: number; message: string };

/** Acquire a global server-key generation slot; release it when the stream ends. */
export function acquireGenerationSlot(): ConcurrencySlotResult {
  const config = getRateLimitConfig();
  if (activeGenerations >= config.concurrent) {
    return {
      ok: false,
      retryAfterSec: 10,
      message: `当前同时在生成的人较多（并发上限 ${config.concurrent}），请等几秒再试；也可以在右上角「模型设置」里填写自己的 API Key 继续使用。`,
    };
  }
  activeGenerations += 1;
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      activeGenerations = Math.max(0, activeGenerations - 1);
    },
  };
}

/* --------------------------------- helpers -------------------------------- */

/** Standard `X-RateLimit-*` headers for SSE and 429 responses. */
export function rateLimitHeaders(snapshot: QuotaSnapshot): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(snapshot.limitPerHour),
    "X-RateLimit-Remaining": String(snapshot.remaining),
    "X-RateLimit-Reset": String(Math.floor(snapshot.resetAt / 1000)),
  };
}

/** Test hook: forget all counters (offline smoke tests). */
export function resetRateLimitState(): void {
  generationBuckets.clear();
  enhanceBuckets.clear();
  activeGenerations = 0;
}
