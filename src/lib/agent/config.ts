/**
 * Server-side provider configuration.
 *
 * Resolution order: per-request BYOK override -> `LLM_*` env -> built-in mock agent.
 * The resolved API key must never be logged, serialized or returned to the client.
 */
import type { ProviderOverride, ReasoningEffort, ServerConfig } from "@/types";

export const DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_MODEL = "deepseek-chat";

const REASONING_EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high", "max"];

/** Validate an incoming `reasoningEffort` value; unknown values are ignored. */
export function normalizeReasoningEffort(value: unknown): ReasoningEffort | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return (REASONING_EFFORTS as readonly string[]).includes(normalized)
    ? (normalized as ReasoningEffort)
    : undefined;
}

function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Accepts `api.deepseek.com`, `https://api.deepseek.com/`, `https://x/v1` ... */
export function normalizeBaseUrl(raw?: string): string {
  const value = (raw ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

/** `MOCK_LLM=1` (also true/yes/on) forces the offline demo agent. */
export function isMockForced(): boolean {
  const flag = envValue("MOCK_LLM")?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

/** Read a bounded integer (milliseconds) from env; used for agent time budgets. */
export function readEnvMilliseconds(name: string, fallback: number, min: number, max: number): number {
  const raw = envValue(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function hasServerKey(): boolean {
  return Boolean(envValue("LLM_API_KEY"));
}

export function getDefaultModel(): string {
  return envValue("LLM_MODEL") || DEFAULT_MODEL;
}

export interface ResolvedProvider {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Where the credentials came from; used for user-facing error hints only. */
  source: "byok" | "env";
}

/**
 * Resolve the provider for a single request. Returns `null` when the server
 * should fall back to the deterministic mock agent (no key anywhere, or mock forced).
 *
 * `MOCK_LLM=1` means "the server itself must not spend its key": it disables the
 * env-key path, but a user-supplied BYOK key still works so a public demo can be
 * shipped in demo mode while power users bring their own model credentials.
 */
export function resolveProvider(override?: ProviderOverride | null): ResolvedProvider | null {
  const byokKey = override?.apiKey?.trim();
  const mockForced = isMockForced();

  if (byokKey) {
    return {
      baseUrl: normalizeBaseUrl(override?.baseUrl || envValue("LLM_BASE_URL")),
      apiKey: byokKey,
      model: override?.model?.trim() || getDefaultModel(),
      source: "byok",
    };
  }

  if (mockForced) return null;

  const envKey = envValue("LLM_API_KEY");
  if (!envKey) return null;
  return {
    baseUrl: normalizeBaseUrl(envValue("LLM_BASE_URL")),
    apiKey: envKey,
    model: getDefaultModel(),
    source: "env",
  };
}

/** Payload of `GET /api/config`. */
export function getServerConfig(): ServerConfig {
  const mockForced = isMockForced();
  const hasKey = hasServerKey() && !mockForced;
  return {
    hasServerKey: hasKey,
    mockMode: mockForced || !hasKey,
    defaultModel: getDefaultModel(),
  };
}
