/**
 * Server capability snapshot used by `GET /api/status` (and offline smoke tests).
 * Pure function: all environment/clock inputs are read dynamically so tests can
 * flip env vars without reloading the module.
 */
import type { ProviderOverride, ServerStatus } from "@/types";

import { getDefaultModel, hasServerKey, isMockForced } from "./config";
import { getGenerationQuota, getRateLimitConfig, type QuotaSnapshot } from "./ratelimit";

/** Resolve the effective serving mode for this request/caller. */
export function resolveServerMode(override?: ProviderOverride | null): ServerStatus["mode"] {
  if (override?.apiKey?.trim()) return "byok";
  if (isMockForced()) return "mock";
  return hasServerKey() ? "server-key" : "mock";
}

export function getServerKeyReason(): ServerStatus["serverKeyReason"] {
  if (isMockForced()) return "mock-forced";
  return hasServerKey() ? "ok" : "no-key";
}

export interface ServerStatusOptions {
  /** Caller IP used for the per-IP quota view. */
  ip?: string;
  /** Injectable clock for tests. */
  now?: number;
  /** App version (the status route passes `package.json.version`). */
  version?: string;
  /** Optional BYOK preview (not used by the GET route, handy for tests). */
  override?: ProviderOverride | null;
}

export function getServerStatus(options: ServerStatusOptions = {}): ServerStatus {
  const mode = resolveServerMode(options.override);
  const quota: QuotaSnapshot | null =
    mode === "server-key" ? getGenerationQuota(options.ip ?? "local", options.now) : null;
  const limits = getRateLimitConfig();

  return {
    mode,
    model: getDefaultModel(),
    hasServerKey: hasServerKey(),
    mockForced: isMockForced(),
    serverKeyReason: getServerKeyReason(),
    quota: quota
      ? { limitPerHour: quota.limitPerHour, remaining: quota.remaining, resetAt: quota.resetAt }
      : null,
    rateLimits: { perHour: limits.perHour, concurrent: limits.concurrent },
    version: options.version?.trim() || process.env.APP_VERSION || "0.2.0",
  };
}
