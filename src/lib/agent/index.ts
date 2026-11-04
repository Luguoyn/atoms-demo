/**
 * Public entry point of the server-side agent engine (`src/lib/agent/**`).
 * The API routes and scripts import from here.
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
  resolveProvider,
} from "./config";

export { formatValidationIssues, hasValidationErrors, validateApp } from "./validate";
export { MAX_FILE_BYTES, TOOL_DEFINITIONS, sanitizeFilePath } from "./tools";
export { ProviderError } from "./provider";
