/**
 * Server-side ("compile-level") validation of the generated app.
 * Never executes generated code: JS is only compiled with `node:vm`.
 *
 * External-resource checks are context-aware: only things that actually load or
 * fetch remote content are treated as errors (script/link/img/iframe src, CSS
 * url()/@import, fetch/XHR/WebSocket...). Plain identifier URLs such as SVG's
 * `xmlns="http://www.w3.org/2000/svg"` or URLs inside comments are allowed.
 */
import * as vm from "node:vm";

import type { FileMap, ValidationIssue } from "@/types";
import { CORE_FILES, CORE_FILE_SET, MAX_FILE_BYTES, byteSize } from "./tools";

const MAX_TOTAL_BYTES = 600_000;
const TEXT_EXTENSIONS = new Set(["html", "css", "js", "mjs", "md", "txt", "svg", "json"]);

/** Well-known identifier namespaces that never initiate a network request. */
const IDENTIFIER_URL_HOSTS = [
  "w3.org",
  "schema.org",
  "ns.adobe.com",
  "purl.org",
  "xmlns.com",
  "openxmlformats.org",
  "json-schema.org",
];

export function hasValidationErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

export function formatValidationIssues(issues: ValidationIssue[], limit = 12): string {
  return issues
    .slice(0, limit)
    .map((issue) => `- [${issue.severity}] ${issue.file}: ${issue.message}`)
    .join("\n");
}

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.split("\n").slice(0, 3).join(" ").slice(0, 300);
}

function trimForMessage(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 100 ? `${compact.slice(0, 100)}…` : compact;
}

/** True for `http(s)://` / protocol-relative / ftp URLs. */
function isExternalUrl(raw: string): boolean {
  return /^(?:https?:)?\/\//i.test(raw) || /^ftp:\/\//i.test(raw);
}

/** True when the URL is a pure identifier namespace (never fetched). */
function isIdentifierUrl(raw: string): boolean {
  if (!isExternalUrl(raw)) return false;
  try {
    const host = new URL(raw.startsWith("//") ? `https:${raw}` : raw).hostname.toLowerCase();
    return IDENTIFIER_URL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

/** External references that would really load remote content (identifier URLs excluded). */
function isLoadableExternalRef(raw: string): boolean {
  return isExternalUrl(raw) && !isIdentifierUrl(raw);
}

/** Find `url(...)` and `@import` targets in a CSS snippet that would load remote content. */
function findExternalCssRefs(css: string): string[] {
  const refs = new Set<string>();
  const urlPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(css)) !== null) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (raw && isLoadableExternalRef(raw)) refs.add(raw);
  }
  const importPattern = /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^);"']+))/gi;
  while ((match = importPattern.exec(css)) !== null) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (raw && isLoadableExternalRef(raw)) refs.add(raw);
  }
  return [...refs];
}

/** Strip JS comments (line/block) while keeping strings intact. */
function stripJsComments(code: string): string {
  let result = "";
  let state: "code" | "line" | "block" | "single" | "double" | "template" = "code";
  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];
    const next = code[index + 1];
    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        index += 1;
      } else if (char === "/" && next === "*") {
        state = "block";
        index += 1;
      } else if (char === "'") {
        state = "single";
        result += char;
      } else if (char === '"') {
        state = "double";
        result += char;
      } else if (char === "`") {
        state = "template";
        result += char;
      } else {
        result += char;
      }
      continue;
    }
    if (state === "line") {
      if (char === "\n") {
        state = "code";
        result += char;
      }
      continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }
    result += char;
    if (char === "\\") {
      if (index + 1 < code.length) {
        result += code[index + 1];
        index += 1;
      }
      continue;
    }
    if (state === "single" && char === "'") state = "code";
    else if (state === "double" && char === '"') state = "code";
    else if (state === "template" && char === "`") state = "code";
  }
  return result;
}

/** Network-capable JS API usage, checked outside comments only. */
const JS_NETWORK_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bfetch\s*\(/, message: "包含 fetch() 网络请求，产物必须离线运行" },
  { pattern: /\bXMLHttpRequest\b/, message: "包含 XMLHttpRequest 网络请求，产物必须离线运行" },
  { pattern: /\bWebSocket\b/, message: "包含 WebSocket 连接，产物必须离线运行" },
  { pattern: /\bEventSource\b/, message: "包含 EventSource 连接，产物必须离线运行" },
  { pattern: /\bsendBeacon\s*\(/, message: "包含 navigator.sendBeacon 网络请求，产物必须离线运行" },
  { pattern: /\bimportScripts?\s*\(/, message: "包含 importScripts 外部脚本加载，产物必须离线运行" },
  { pattern: /\bnew\s+Image\s*\(/, message: "包含 new Image() 外部图片加载，产物必须离线运行" },
  { pattern: /\.src\s*=\s*["'`]\s*(?:https?:)?\/\//, message: "通过 .src 加载外部资源，产物必须离线运行" },
  {
    pattern: /setAttribute\s*\(\s*["'](?:src|href)["']\s*,\s*["'`]\s*(?:https?:)?\/\//,
    message: "通过 setAttribute 加载外部资源，产物必须离线运行",
  },
];

function findJsNetworkMessages(code: string): string[] {
  const stripped = stripJsComments(code);
  const messages: string[] = [];
  for (const rule of JS_NETWORK_PATTERNS) {
    if (rule.pattern.test(stripped)) messages.push(rule.message);
  }
  return messages;
}

function makeIssueCollector(file: string, issues: ValidationIssue[]) {
  const seen = new Set<string>();
  return (message: string, severity: ValidationIssue["severity"]): void => {
    const key = `${severity}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ file, message, severity });
  };
}

export function validateApp(files: FileMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const paths = Object.keys(files);
  if (paths.length === 0) {
    return [{ file: "app", message: "没有生成任何文件", severity: "error" }];
  }

  let totalBytes = 0;
  for (const path of paths) {
    const content = typeof files[path] === "string" ? files[path] : "";
    const size = byteSize(content);
    totalBytes += size;
    const extension = path.includes(".") ? path.split(".").pop()?.toLowerCase() ?? "" : "";
    if (!TEXT_EXTENSIONS.has(extension)) {
      issues.push({ file: path, message: `不支持的文件类型 .${extension || "?"}（只允许文本文件）`, severity: "error" });
      continue;
    }
    if (size === 0) {
      issues.push({ file: path, message: "文件内容为空", severity: CORE_FILE_SET.has(path) ? "error" : "warning" });
      continue;
    }
    if (size > MAX_FILE_BYTES) {
      issues.push({
        file: path,
        message: `文件过大（${(size / 1024).toFixed(1)} KB），单文件上限 ${(MAX_FILE_BYTES / 1024).toFixed(0)} KB`,
        severity: "error",
      });
    }
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    issues.push({
      file: "app",
      message: `产物总大小 ${(totalBytes / 1024).toFixed(0)} KB 偏大（建议 < ${(MAX_TOTAL_BYTES / 1024).toFixed(0)} KB）`,
      severity: "warning",
    });
  }

  for (const core of CORE_FILES) {
    if (files[core] === undefined) {
      issues.push({ file: core, message: `缺少必需文件 ${core}`, severity: "error" });
    }
  }

  const html = files["index.html"];
  if (typeof html === "string" && html.trim()) validateHtml(html, files, issues);
  const css = files["styles.css"];
  if (typeof css === "string" && css.trim()) validateCss(css, issues);
  const js = files["app.js"];
  if (typeof js === "string" && js.trim()) validateJs(js, "app.js", issues);

  return issues;
}

const LOADING_TAGS = new Set([
  "script",
  "link",
  "img",
  "iframe",
  "audio",
  "video",
  "source",
  "track",
  "embed",
  "object",
  "input",
  "image",
  "use",
  "video",
]);
const NAVIGATION_TAGS = new Set(["a", "area", "form"]);

function attributeValues(attrs: string): Array<{ name: string; value: string }> {
  const result: Array<{ name: string; value: string }> = [];
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(attrs)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    result.push({ name, value });
  }
  return result;
}

function validateHtml(html: string, files: FileMap, issues: ValidationIssue[]): void {
  const push = makeIssueCollector("index.html", issues);

  if (!/<html[\s>]/i.test(html)) push("缺少 <html> 根元素", "error");
  if (!/<body[\s>]/i.test(html)) push("缺少 <body> 元素", "error");
  if (!/<\/html\s*>/i.test(html)) push("缺少 </html> 结束标签", "warning");
  if (!/<!doctype\s+html/i.test(html)) push("缺少 <!DOCTYPE html> 声明", "warning");
  if (!/<html[^>]*\blang\s*=/i.test(html)) push('建议为 <html> 添加 lang="zh-CN"', "warning");
  if (!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(html)) push("缺少 viewport meta，移动端适配会失效", "warning");
  if (!/<link[^>]+href\s*=\s*["']\.?\/?styles\.css["']/i.test(html)) {
    push("index.html 未通过 <link> 引用 styles.css", "warning");
  }
  if (!/<script[^>]+src\s*=\s*["']\.?\/?app\.js["']/i.test(html)) {
    push("index.html 未通过 <script src> 引用 app.js", "warning");
  }

  const checkRef = (tagName: string, attrName: string, rawValue: string): void => {
    const value = rawValue.trim();
    if (!value) return;
    if (/^(?:#|data:|blob:|mailto:|tel:|javascript:)/i.test(value)) return;
    const isNavigation = NAVIGATION_TAGS.has(tagName) && attrName === "href";
    const isLoader = LOADING_TAGS.has(tagName) || attrName === "src" || attrName === "poster" || attrName === "data";

    if (isExternalUrl(value)) {
      if (isIdentifierUrl(value)) return;
      if (isNavigation) {
        push(`包含外部链接 ${trimForMessage(value)}（点击后会离开应用，建议移除）`, "warning");
      } else {
        push(`引用了外部资源 ${trimForMessage(value)}，必须改为离线自包含`, "error");
      }
      return;
    }
    if (value.startsWith("/")) {
      if (isLoader) push(`引用了绝对路径 ${trimForMessage(value)}，预览环境请使用相对路径`, "error");
      return;
    }
    const localPath = value.replace(/^\.\//, "").split(/[?#]/)[0];
    if (!localPath) return;
    if (isLoader && typeof files[localPath] !== "string") {
      push(`引用了不存在的本地文件 ${trimForMessage(localPath)}`, "error");
    }
  };

  const tagPattern = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagPattern.exec(html)) !== null) {
    const tagName = tagMatch[1].toLowerCase();
    const attrs = tagMatch[2] ?? "";
    const parsedAttrs = attributeValues(attrs);
    for (const { name, value } of parsedAttrs) {
      if (name === "style") {
        for (const ref of findExternalCssRefs(value)) {
          push(`内联样式引用了外部资源 ${trimForMessage(ref)}，必须改为离线自包含`, "error");
        }
        continue;
      }
      if (name === "srcset" || name === "imagesrcset") {
        for (const candidate of value.split(",")) {
          const url = candidate.trim().split(/\s+/)[0];
          if (url) checkRef(tagName, "src", url);
        }
        continue;
      }
      if (name === "src" || name === "poster" || name === "data" || name === "href" || name.endsWith(":href")) {
        checkRef(tagName, name === "href" || name.endsWith(":href") ? "href" : name, value);
      }
    }
  }

  const stylePattern = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = stylePattern.exec(html)) !== null) {
    for (const ref of findExternalCssRefs(styleMatch[2] ?? "")) {
      push(`内联 <style> 引用了外部资源 ${trimForMessage(ref)}，必须改为离线自包含`, "error");
    }
  }

  const scriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptPattern.exec(html)) !== null) {
    const attrs = scriptMatch[1] ?? "";
    const body = scriptMatch[2] ?? "";
    if (/\bsrc\s*=/i.test(attrs) || !body.trim()) continue;
    const typeMatch = /type\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const scriptType = typeMatch?.[1]?.toLowerCase();
    if (scriptType && !/javascript/.test(scriptType)) continue;
    let compiled = true;
    try {
      new vm.Script(body, { filename: "index.html#inline-script" });
    } catch (error) {
      compiled = false;
      push(`内联脚本语法错误：${errorText(error)}`, "error");
    }
    if (compiled) {
      for (const message of findJsNetworkMessages(body)) {
        push(`内联脚本${message}`, "error");
      }
    }
  }
}

function validateCss(css: string, issues: ValidationIssue[]): void {
  const push = makeIssueCollector("styles.css", issues);
  const open = (css.match(/\{/g) ?? []).length;
  const close = (css.match(/\}/g) ?? []).length;
  if (open !== close) push(`样式表花括号数量不匹配（{ ${open} 个 / } ${close} 个）`, "warning");
  for (const ref of findExternalCssRefs(css)) {
    push(`CSS 引用了外部资源 ${trimForMessage(ref)}，必须离线自包含`, "error");
  }
}

function validateJs(code: string, file: string, issues: ValidationIssue[]): void {
  const push = makeIssueCollector(file, issues);
  if (/^\s*(?:import|export)\b/m.test(code)) {
    push("app.js 使用了 ESM 语法（import/export），请改为可直接 <script> 加载的经典脚本", "error");
    return;
  }
  try {
    new vm.Script(code, { filename: file });
  } catch (error) {
    push(`JavaScript 语法错误：${errorText(error)}`, "error");
    return;
  }
  for (const message of findJsNetworkMessages(code)) {
    push(message, "error");
  }
  if (!/localStorage/.test(code)) {
    push("未使用 localStorage 持久化应用状态（建议加上）", "warning");
  }
}
