/**
 * Shared domain contracts for Atoms Demo.
 * OWNER: Lead. Do not change signatures without messaging the Lead first.
 */

/** Virtual file system of a generated app. Keys are POSIX-ish paths, e.g. "index.html". */
export type FileMap = Record<string, string>;

/** The plan the agent produces before writing code. */
export interface AppPlan {
  /** Short product/app name, e.g. "专注番茄钟" */
  name: string;
  /** One-sentence product summary */
  summary: string;
  /** 3-6 user-facing features */
  features: string[];
  /** Files the agent intends to write */
  files: { path: string; purpose: string }[];
}

export type ToolName = "write_file" | "read_file" | "list_files" | "delete_file" | "finish";

export interface ValidationIssue {
  file: string;
  message: string;
  severity: "error" | "warning";
}

export type AgentPhase = "planning" | "coding" | "validating" | "fixing" | "done";

/** Events streamed from POST /api/chat as SSE (`data: <json>\n\n`). */
export type AgentEvent =
  | { type: "phase"; phase: AgentPhase; label: string }
  | { type: "status"; message: string }
  | { type: "plan"; plan: AppPlan }
  | { type: "tool_start"; id: string; tool: ToolName; label: string }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  | { type: "file_delta"; path: string; delta: string }
  | { type: "file_done"; path: string; content: string }
  | { type: "assistant_delta"; delta: string }
  /** Token accounting reported at the end of a run (cache hits included). */
  | { type: "usage"; usage: GenerationUsage }
  | { type: "validation"; ok: boolean; issues: ValidationIssue[] }
  | {
      type: "done";
      files: FileMap;
      plan?: AppPlan;
      summary: string;
      stats: { steps: number; mock: boolean };
    }
  | { type: "error"; message: string; retryable?: boolean };

/** Optional per-request provider override (BYOK from the settings dialog). */
export type ReasoningEffort = "low" | "medium" | "high" | "max";

export interface ProviderOverride {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** Reasoning budget for reasoning models; forwarded to OpenAI-compatible `reasoning_effort`. */
  reasoningEffort?: ReasoningEffort;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Token accounting for one generation, including prompt-cache hits. */
export interface GenerationUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** Prompt tokens served from the provider's prompt cache (cost is much lower). */
  cachedTokens: number;
  /** Hidden reasoning tokens, when the provider reports them. */
  reasoningTokens?: number;
  totalTokens?: number;
}

/** GET /api/status response (per caller IP when rate limiting is enabled). */
export interface ServerStatus {
  mode: "server-key" | "byok" | "mock";
  model: string;
  hasServerKey: boolean;
  mockForced: boolean;
  /** Reason the server key is (un)usable, e.g. "no-key" | "mock-forced" | "ok". */
  serverKeyReason: "ok" | "no-key" | "mock-forced";
  /** Remaining per-IP demo quota; `null` when the caller pays with their own key. */
  quota: { limitPerHour: number; remaining: number; resetAt: number } | null;
  rateLimits: { perHour: number; concurrent: number };
  version: string;
}

/** POST /api/prompt/enhance request/response. */
export interface PromptEnhanceRequest {
  message: string;
  provider?: ProviderOverride;
  reasoningEffort?: ReasoningEffort;
}

export interface PromptEnhanceResponse {
  enhanced: string;
  tips: string[];
  mock: boolean;
}

/** POST /api/chat request body. */
export interface ChatRequest {
  projectId: string;
  message: string;
  /** Current app files; empty object for the first generation. */
  files: FileMap;
  /** Previous conversation, oldest first (text only). */
  history: ChatTurn[];
  /** "generate" when files is empty, "refine" when the user iterates on an existing app. */
  mode: "generate" | "refine";
  provider?: ProviderOverride;
  /** Quality/speed trade-off forwarded to reasoning models. */
  reasoningEffort?: ReasoningEffort;
}

/** GET /api/config response. */
export interface ServerConfig {
  hasServerKey: boolean;
  mockMode: boolean;
  defaultModel: string;
}

/* ------------------------------- client state ------------------------------ */

export interface AgentStep {
  id: string;
  tool: ToolName;
  label: string;
  status: "running" | "done" | "error";
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status: "streaming" | "done" | "error";
  plan?: AppPlan;
  steps?: AgentStep[];
  versionId?: string;
  /** Token/cache accounting for the generation that produced this message. */
  usage?: GenerationUsage;
}

export interface Version {
  id: string;
  createdAt: number;
  label: string;
  files: FileMap;
  plan?: AppPlan;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface Project extends ProjectMeta {
  messages: ChatMessage[];
  files: FileMap;
  versions: Version[];
  plan?: AppPlan;
}

export interface ProviderSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
  /** Empty string = use the server default. */
  reasoningEffort: ReasoningEffort | "";
}

/** Console entry captured from the preview iframe. */
export interface ConsoleEntry {
  id: string;
  level: "log" | "info" | "warn" | "error";
  text: string;
  at: number;
}

/** Builder store surface consumed by UI components (`useBuilder()`). */
export interface BuilderState {
  ready: boolean;
  projects: ProjectMeta[];
  activeProject: Project | null;
  busy: boolean;
  phase: AgentPhase | null;
  phaseLabel: string | null;
  error: string | null;
  serverConfig: ServerConfig | null;
  settings: ProviderSettings;
  consoleEntries: ConsoleEntry[];
  serverMode: "server-key" | "byok" | "mock";
}
