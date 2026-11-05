/**
 * Helpers for the "代码" tab: file listing (size / line count / language) and
 * a copy-all text format. Pure functions, safe on the server too.
 * OWNER: ui-preview.
 */

import type { FileMap } from "@/types";
import { byteSize } from "@/lib/utils";

export type SourceLanguage = "html" | "css" | "js" | "json" | "md" | "text";

export interface SourceFileInfo {
  path: string;
  content: string;
  /** UTF-8 size in bytes. */
  bytes: number;
  /** Number of lines (a trailing newline does not add an extra line). */
  lines: number;
  language: SourceLanguage;
}

const PRIORITY = ["index.html", "index.htm", "styles.css", "app.js"];

/** List the virtual files in a stable, product-meaningful order. */
export function listSourceFiles(files: FileMap): SourceFileInfo[] {
  const entries = Object.entries(files ?? {}).filter(
    ([path, content]) =>
      typeof path === "string" && path.trim().length > 0 && typeof content === "string",
  );
  return entries
    .map(([path, content]) => ({
      path,
      content,
      bytes: byteSize(content),
      lines: countLines(content),
      language: detectLanguage(path),
      rank: priorityRank(path),
    }))
    .sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path))
    .map(({ rank: _rank, ...info }) => info);
}

/** Line count that matches what an editor shows (no phantom last line). */
export function countLines(text: string): number {
  if (!text) return 0;
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

/** Text used by "复制全部" — one banner header per file. */
export function buildCombinedSource(files: FileMap): string {
  const entries = listSourceFiles(files);
  if (entries.length === 0) return "";
  return entries
    .map(
      (file) =>
        `/* ===== ${file.path} · ${file.lines} 行 · ${formatFileSize(file.bytes)} ===== */\n${file.content}`,
    )
    .join("\n\n");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Safe filename for downloading a single virtual file. */
export function virtualFileDownloadName(path: string): string {
  const base = path.split("/").filter(Boolean).pop() ?? "file.txt";
  const cleaned = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
  return cleaned || "file.txt";
}

function detectLanguage(path: string): SourceLanguage {
  const lower = path.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".ts")) {
    return "js";
  }
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md")) return "md";
  return "text";
}

function priorityRank(path: string): number {
  const index = PRIORITY.indexOf(path);
  return index === -1 ? PRIORITY.length : index;
}
