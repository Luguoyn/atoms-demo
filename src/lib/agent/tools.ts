/**
 * Tool definitions + argument/path validation for the agent tool loop.
 * The virtual file system is a flat whitelist of app files; nothing outside it
 * can be written, read or deleted.
 */
import type { FileMap } from "@/types";

export const MAX_FILE_BYTES = 200_000;
export const CORE_FILES = ["index.html", "styles.css", "app.js"] as const;
export const CORE_FILE_SET: ReadonlySet<string> = new Set<string>(CORE_FILES);

/** Flat, offline-friendly file whitelist (nested paths / assets are not rendered). */
const ALLOWED_APP_FILES = new Set<string>(["index.html", "styles.css", "app.js", "README.md", "favicon.svg"]);

export const ALLOWED_FILES_HINT = "[index.html, styles.css, app.js, README.md, favicon.svg]";

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  items?: JsonSchemaProperty;
  enum?: string[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, JsonSchemaProperty>;
      required?: string[];
    };
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write one file of the generated app, or append a segment to it. Use mode:'append' to append a partial segment (large files: first write a segment with mode:'overwrite', then append remaining segments, each under ~6KB).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: `Relative file path. One of ${ALLOWED_FILES_HINT}.`,
          },
          content: {
            type: "string",
            description: "UTF-8 file content (complete file for overwrite, or the next segment for append). Maximum 200 KB per file.",
          },
          mode: {
            type: "string",
            enum: ["overwrite", "append"],
            description:
              "'overwrite' (default) replaces the whole file; 'append' appends this segment to the end of the existing file. Prefer overwrite for the first segment and append for the rest.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the current content of one file in the generated app.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List all files currently present in the generated app with their sizes.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete one file from the generated app. Use sparingly.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description:
        "Signal that the app is complete and all three files (index.html, styles.css, app.js) were written. Call this exactly once, at the very end.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "One short Chinese sentence describing what was built/changed.",
          },
          app_name: {
            type: "string",
            description: "Short Chinese app name, e.g. 番茄专注钟.",
          },
        },
        required: ["summary"],
      },
    },
  },
];

const utf8 = new TextEncoder();

export function byteSize(text: string): number {
  return utf8.encode(text).length;
}

export function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Validate and normalize a tool file path. Returns `null` when the path is not
 * allowed (traversal, absolute paths, hidden files, unsupported extension...).
 */
export function sanitizeFilePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim().replace(/\\/g, "/");
  while (value.startsWith("./")) value = value.slice(2);
  value = value.replace(/^\/+/, "");
  if (!value || value.length > 80) return null;
  if (/^[a-zA-Z]:/.test(value)) return null;
  if (value.split("/").some((segment) => segment === ".." || segment === "." || segment.length === 0)) return null;
  if (!ALLOWED_APP_FILES.has(value)) return null;
  return value;
}

export type ToolArgumentParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

/** Parse the JSON string streamed in a tool call. Tolerates empty args and ``` fences. */
export function parseToolArguments(raw: string): ToolArgumentParseResult {
  let text = (raw ?? "").trim();
  if (!text) return { ok: true, value: {} };
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  }
  if (!text) return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "工具参数不是合法 JSON（可能被截断），请重新完整调用该工具。" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "工具参数必须是一个 JSON 对象。" };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

/** write_file modes: full replacement or append a segment (large-file strategy). */
export type WriteMode = "overwrite" | "append";

export function normalizeWriteMode(raw: unknown): WriteMode {
  return typeof raw === "string" && raw.trim().toLowerCase() === "append" ? "append" : "overwrite";
}

export type FileWriteResult =
  | { ok: true; content: string; bytes: number; addedBytes: number; mode: WriteMode }
  | { ok: false; error: string };

/**
 * Apply a write_file call to the virtual file system. `append` concatenates the
 * segment to the existing content (used to write large files across completions).
 * Mutates `files` on success; enforces the per-file size limit on the merged result.
 */
export function applyFileWrite(
  files: FileMap,
  path: string,
  content: string,
  mode: WriteMode,
): FileWriteResult {
  const existing = typeof files[path] === "string" ? files[path] : "";
  const next = mode === "append" ? existing + content : content;
  const bytes = byteSize(next);
  if (bytes > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `文件过大（合并后 ${formatKb(bytes)}），单文件上限 ${formatKb(MAX_FILE_BYTES)}；请精简内容或分段后再试。`,
    };
  }
  files[path] = next;
  return { ok: true, content: next, bytes, addedBytes: byteSize(content), mode };
}

/** Extract a best-effort `"path"` value from (possibly truncated) tool arguments. */
export function guessPathFromArguments(rawArguments: string): string | null {
  const match = /"path"\s*:\s*"([^"\\]{1,80})"/.exec(rawArguments ?? "");
  return match?.[1] ? sanitizeFilePath(match[1]) : null;
}

/**
 * Split file content into ordered chunks that concatenate back exactly to the
 * original. Used to stream `file_delta` events for both real and mock agents.
 */
export function splitForStreaming(content: string, targetSize = 480): string[] {
  if (!content) return [];
  const lines = content.split("\n");
  const chunks: string[] = [];
  let current = "";
  for (let index = 0; index < lines.length; index += 1) {
    const piece = index < lines.length - 1 ? `${lines[index]}\n` : lines[index];
    if (current.length > 0 && current.length + piece.length > targetSize) {
      chunks.push(current);
      current = "";
    }
    current += piece;
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [content];
}

export function describeFiles(files: FileMap): string {
  const paths = Object.keys(files);
  if (paths.length === 0) return "（暂无文件）";
  return paths.map((path) => `${path}（${formatKb(byteSize(files[path] ?? ""))}）`).join("、");
}
