/**
 * Public entry point of the server-side agent engine (`src/lib/agent/**`).
 * The API routes, scripts and offline smoke tests import from here.
 */
export { runAgent } from "./loop";
export type { RunAgentOptions } from "./options";

export {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  getDefaultModel,
  getServerConfig,
  hasServerKey,
  isMockForced,
  normalizeBaseUrl,
  normalizeReasoningEffort,
  resolveProvider,
} from "./config";

export { getServerKeyReason, getServerStatus, resolveServerMode } from "./status";
export type { ServerStatusOptions } from "./status";

export {
  acquireGenerationSlot,
  consumeGenerationQuota,
  consumePromptEnhanceQuota,
  getActiveGenerationCount,
  getClientIdentity,
  getClientIp,
  getGenerationQuota,
  getRateLimitConfig,
  rateLimitHeaders,
  resetRateLimitState,
} from "./ratelimit";
export type {
  ClientIdentity,
  ClientIpSource,
  ConcurrencySlotResult,
  GenerationQuotaResult,
  PromptEnhanceQuotaResult,
  QuotaSnapshot,
  RateLimitConfig,
} from "./ratelimit";

export { buildMockEnhancement, parseEnhancementResponse, runPromptEnhancement } from "./enhance";
export type { RunEnhanceOptions } from "./enhance";

export { formatValidationIssues, hasValidationErrors, validateApp } from "./validate";
export { MAX_FILE_BYTES, TOOL_DEFINITIONS, sanitizeFilePath } from "./tools";
export { ProviderError, getStreamOptionsSupport, resetStreamOptionsSupport } from "./provider";
export type { TokenUsage } from "./provider";
