/**
 * Preview bundler: turns the generated virtual files (`index.html` + `styles.css`
 * + `app.js`) into one self-contained HTML document that can be rendered with
 * `<iframe srcDoc sandbox="allow-scripts ...">`.
 *
 * The bundler is deliberately defensive: generated apps come from an LLM, so the
 * document may be missing files, reference external CDNs, or contain `</script>`
 * sequences inside strings. Every one of these cases degrades to a readable,
 * intentional state instead of a blank iframe.
 *
 * OWNER: ui-preview.
 */

import type { FileMap } from "@/types";
import { byteSize, formatBytes } from "@/lib/utils";

/** Hard cap on the built document; above this the browser gets janky. */
export const MAX_PREVIEW_BYTES = 2_200_000;
/** Above this the preview still renders, but we warn that the app is heavy. */
const HEAVY_PREVIEW_BYTES = 1_500_000;

const ENTRY_CANDIDATES = [
  "index.html",
  "index.htm",
  "public/index.html",
  "src/index.html",
];

export interface BundleResult {
  /** Document ready for `<iframe srcDoc>`. */
  html: string;
  /** Non-fatal issues worth surfacing in the preview toolbar. */
  warnings: string[];
  /** Byte size of `html` (UTF-8). */
  bytes: number;
  /** Resolved entry document path, or null when no HTML entry exists. */
  entry: string | null;
}

/* -------------------------------------------------------------------------- */
/*                                  public API                                */
/* -------------------------------------------------------------------------- */

/** Build the document used by the live preview (includes the console bridge). */
export function buildPreviewDocument(files: FileMap): BundleResult {
  return bundleFiles(files, true);
}

/** Build a clean document for export / "open in new window" (no bridge). */
export function buildStandaloneDocument(files: FileMap): BundleResult {
  return bundleFiles(files, false);
}

/** True when the app has a renderable HTML entry document. */
export function hasPreviewEntry(files: FileMap): boolean {
  const normalized = normalizeFiles(files);
  const entry = findEntryPath(normalized);
  return entry !== null && (normalized.get(entry) ?? "").trim().length > 0;
}

/* -------------------------------------------------------------------------- */
/*                                bundle pipeline                             */
/* -------------------------------------------------------------------------- */

function bundleFiles(files: FileMap, withBridge: boolean): BundleResult {
  const normalized = normalizeFiles(files);
  const warnings = new Set<string>();
  const entryPath = findEntryPath(normalized);
  const entryContent = entryPath ? (normalized.get(entryPath) ?? "") : "";

  /* No HTML entry: show an intentional placeholder rather than a blank frame. */
  if (!entryPath || entryContent.trim().length === 0) {
    warnings.add("缺少 index.html，暂时无法渲染应用");
    const html = buildFallbackDocument({
      title: "还没有可以预览的页面",
      message:
        "文件里还没有 index.html。等 Agent 写完代码，预览会自动出现在这里。",
      hints: ["生成完成后自动刷新", "可切到「控制台」查看细节"],
      fileNames: [...normalized.keys()].sort(),
    });
    return { html, warnings: [...warnings], bytes: byteSize(html), entry: entryPath };
  }

  let html = inlineStyles(entryContent, entryPath, normalized, warnings);
  html = inlineScripts(html, entryPath, normalized, warnings);
  collectExternalResources(html, warnings);

  const headFragments = buildHeadFragments(html, withBridge);
  html = injectHead(html, headFragments);

  const bytes = byteSize(html);
  if (bytes > MAX_PREVIEW_BYTES) {
    warnings.add(
      `应用体积 ${formatBytes(bytes)} 超过预览上限 ${formatBytes(MAX_PREVIEW_BYTES)}，已切换为占位预览`,
    );
    const html2 = buildFallbackDocument({
      title: "应用体积过大，无法实时预览",
      message: `内联后的页面约 ${formatBytes(bytes)}，超过实时预览上限。你仍然可以导出 ZIP，或在新窗口中打开。`,
      hints: ["可以让 Agent 精简代码", "可导出后在本地查看"],
      fileNames: [...normalized.keys()].sort(),
    });
    return { html: html2, warnings: [...warnings], bytes: byteSize(html2), entry: entryPath };
  }
  if (bytes > HEAVY_PREVIEW_BYTES) {
    warnings.add(`应用内联后约 ${formatBytes(bytes)}，滚动预览可能略有卡顿`);
  }

  return { html, warnings: [...warnings], bytes, entry: entryPath };
}

/* -------------------------------------------------------------------------- */
/*                                   inlining                                 */
/* -------------------------------------------------------------------------- */

function inlineStyles(
  html: string,
  entryPath: string,
  files: Map<string, string>,
  warnings: Set<string>,
): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = readAttr(tag, "rel");
    if (!rel || !rel.toLowerCase().split(/\s+/).includes("stylesheet")) return tag;
    const href = readAttr(tag, "href");
    if (!href) return tag;
    if (isDataRef(href)) return tag;
    if (isExternalRef(href)) {
      warnings.add(`检测到外部样式表 ${shorten(href)}，离线预览时可能无法加载`);
      return tag;
    }
    const local = resolveLocalPath(entryPath, href);
    if (!local) return tag;
    const css = files.get(local);
    if (css === undefined) {
      warnings.add(`缺少样式文件 ${local}，已跳过内联`);
      return `<!-- atoms-preview: ${local} 未找到 -->`;
    }
    return `<style data-atoms-inlined="${escapeAttr(local)}">\n${escapeStyleContent(css)}\n</style>`;
  });
}

function inlineScripts(
  html: string,
  entryPath: string,
  files: Map<string, string>,
  warnings: Set<string>,
): string {
  const inlineOne = (attrs: string, body: string, original: string): string => {
    const src = readAttr(attrs, "src");
    if (!src) return original;
    if (isDataRef(src)) return original;
    if (isExternalRef(src)) {
      warnings.add(`检测到外部脚本 ${shorten(src)}，离线预览时可能无法加载`);
      return original;
    }
    const local = resolveLocalPath(entryPath, src);
    if (!local) return original;
    const code = files.get(local);
    if (code === undefined) {
      warnings.add(`缺少脚本文件 ${local}，已跳过内联`);
      return `<!-- atoms-preview: ${local} 未找到 -->`;
    }
    const type = readAttr(attrs, "type");
    const typeAttr =
      type && /^(?:module|text\/javascript|application\/javascript)$/i.test(type.trim())
        ? ` type="${escapeAttr(type.trim())}"`
        : "";
    void body;
    return `<script${typeAttr} data-atoms-inlined="${escapeAttr(local)}">\n${escapeScriptContent(code)}\n</script>`;
  };

  const paired = html.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
    (match, attrs: string, body: string) => inlineOne(attrs, body, match),
  );

  // Tolerate hand-written / LLM-written self-closing script tags.
  return paired.replace(/<script\b([^>]*?)\/>/gi, (match, attrs: string) =>
    inlineOne(attrs, "", match),
  );
}

function collectExternalResources(html: string, warnings: Set<string>): void {
  const hosts = new Set<string>();
  const re = /(?:src|href)\s*=\s*["']((?:https?:)?\/\/[^"']+)["']/gi;
  let match: RegExpExecArray | null = re.exec(html);
  while (match) {
    const url = match[1];
    try {
      hosts.add(new URL(url.startsWith("//") ? `https:${url}` : url).host);
    } catch {
      hosts.add(shorten(url));
    }
    match = re.exec(html);
  }
  if (hosts.size > 0) {
    const shown = [...hosts].slice(0, 3).join("、");
    warnings.add(
      `检测到外部资源（${shown}${hosts.size > 3 ? " 等" : ""}），离线预览时可能无法加载`,
    );
  }
  if (/@import\s+(?:url\(\s*)?["']?(?:https?:)?\/\//i.test(html)) {
    warnings.add("样式包含外部 @import，离线预览可能缺少字体或图标");
  }
}

/* -------------------------------------------------------------------------- */
/*                              document scaffolding                          */
/* -------------------------------------------------------------------------- */

function buildHeadFragments(html: string, withBridge: boolean): string {
  const fragments: string[] = [];
  if (!/<meta\b[^>]*charset\s*=/i.test(html)) {
    fragments.push('<meta charset="utf-8">');
  }
  if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html)) {
    fragments.push(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
  }
  if (!/<base\b/i.test(html)) {
    fragments.push('<base target="_blank">');
  }
  if (withBridge) {
    fragments.push(`<script data-atoms-preview-bridge="1">${PREVIEW_BRIDGE}</script>`);
  }
  return fragments.join("\n");
}

function injectHead(html: string, fragments: string): string {
  if (!fragments) return html;
  const headMatch = /<head\b[^>]*>/i.exec(html);
  if (headMatch && headMatch.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return `${html.slice(0, insertAt)}\n${fragments}\n${html.slice(insertAt)}`;
  }
  const htmlMatch = /<html\b[^>]*>/i.exec(html);
  if (htmlMatch && htmlMatch.index !== undefined) {
    const insertAt = htmlMatch.index + htmlMatch[0].length;
    return `${html.slice(0, insertAt)}\n<head>\n${fragments}\n</head>${html.slice(insertAt)}`;
  }
  const bodyMatch = /<body\b[^>]*>/i.exec(html);
  if (bodyMatch && bodyMatch.index !== undefined) {
    return `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n${fragments}\n</head>\n${html.slice(bodyMatch.index)}\n</html>`;
  }
  return `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n${fragments}\n</head>\n<body>\n${html}\n</body>\n</html>`;
}

/* -------------------------------------------------------------------------- */
/*                                bridge script                               */
/* -------------------------------------------------------------------------- */

/**
 * Injected into the preview document before any app script:
 * - forwards console.* / runtime errors / unhandled rejections to the parent
 *   (`{ source: "atoms-preview", kind, level, text, at }`);
 * - shims localStorage/sessionStorage because the sandbox runs in an opaque
 *   origin where the real Storage API throws (generated apps rely on it).
 */
const PREVIEW_BRIDGE = `
(function () {
  "use strict";
  var SOURCE = "atoms-preview";
  var MAX_TEXT = 4000;
  var windowStart = 0;
  var sentCount = 0;

  function toText(value) {
    if (typeof value === "string") return value;
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value instanceof Error) return value.name + ": " + value.message;
    try {
      var seen = [];
      var json = JSON.stringify(value, function (key, item) {
        if (item && typeof item === "object") {
          if (seen.indexOf(item) >= 0) return "[Circular]";
          seen.push(item);
        }
        return item;
      });
      if (typeof json === "string") return json;
    } catch (err) { /* fall through */ }
    return String(value);
  }

  function post(kind, level, text) {
    try {
      var now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        sentCount = 0;
      }
      sentCount += 1;
      if (sentCount > 80) return;
      if (!window.parent || window.parent === window) return;
      window.parent.postMessage(
        {
          source: SOURCE,
          kind: kind,
          level: level,
          text: String(text == null ? "" : text).slice(0, MAX_TEXT),
          at: now
        },
        "*"
      );
    } catch (err) { /* parent gone or message blocked */ }
  }

  var methods = ["log", "info", "warn", "error", "debug"];
  for (var i = 0; i < methods.length; i += 1) {
    (function (name) {
      var original = console[name];
      console[name] = function () {
        var parts = [];
        for (var j = 0; j < arguments.length; j += 1) {
          parts.push(toText(arguments[j]));
        }
        post("console", name === "debug" ? "log" : name, parts.join(" "));
        try {
          if (typeof original === "function") original.apply(console, arguments);
        } catch (err) { /* ignore */ }
      };
    })(methods[i]);
  }

  window.addEventListener(
    "error",
    function (event) {
      var target = event && event.target;
      if (target && target !== window && (target.src || target.href)) {
        post("error", "error", "资源加载失败：" + String(target.src || target.href));
        return;
      }
      var message = (event && event.message) || "未知错误";
      var where = "";
      if (event && event.filename) {
        where = "（" + event.filename + ":" + event.lineno + ":" + event.colno + "）";
      }
      post("error", "error", message + where);
    },
    true
  );

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    var text = reason && reason.message ? reason.message : toText(reason);
    post("error", "error", "未处理的 Promise 拒绝：" + text);
  });

  window.addEventListener(
    "load",
    function () {
      post("console", "info", "预览已就绪");
    },
    { once: true }
  );

  function memoryStorage() {
    var store = {};
    return {
      getItem: function (key) {
        var k = String(key);
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function (key, value) {
        store[String(key)] = String(value);
      },
      removeItem: function (key) {
        delete store[String(key)];
      },
      clear: function () {
        store = {};
      },
      key: function (index) {
        var keys = Object.keys(store);
        return index >= 0 && index < keys.length ? keys[index] : null;
      },
      get length() {
        return Object.keys(store).length;
      }
    };
  }

  function ensureStorage(name) {
    try {
      var probe = window[name];
      if (probe && typeof probe.getItem === "function") return;
    } catch (err) { /* opaque origin: fall through to the in-memory shim */ }
    var shim = memoryStorage();
    try {
      Object.defineProperty(window, name, { value: shim, configurable: true });
      post(
        "console",
        "warn",
        "预览运行在沙箱中，localStorage 已切换为内存模式；在「新窗口」中打开可持久保存。"
      );
    } catch (err) { /* last resort: leave the native throwing accessor */ }
  }
  ensureStorage("localStorage");
  ensureStorage("sessionStorage");
})();
`;

/* -------------------------------------------------------------------------- */
/*                              fallback document                             */
/* -------------------------------------------------------------------------- */

interface FallbackOptions {
  title: string;
  message: string;
  hints?: string[];
  fileNames?: string[];
}

function buildFallbackDocument(options: FallbackOptions): string {
  const hints = (options.hints ?? [])
    .map((hint) => `<span class="hint">${escapeHtml(hint)}</span>`)
    .join("");
  const fileList =
    options.fileNames && options.fileNames.length > 0
      ? `<div class="files"><span class="files-label">当前文件</span>${escapeHtml(
          options.fileNames.join("\n"),
        )}</div>`
      : "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<title>${escapeHtml(options.title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background:
      radial-gradient(58rem 40rem at 18% -12%, rgba(139, 92, 246, 0.18), transparent 62%),
      radial-gradient(42rem 30rem at 104% 112%, rgba(34, 211, 238, 0.1), transparent 60%),
      #08080e;
    color: #ececf5;
    font-family: ui-sans-serif, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: 100%;
    max-width: 440px;
    padding: 22px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(23, 23, 34, 0.82), rgba(13, 13, 20, 0.86));
    box-shadow: 0 24px 60px -30px rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(12px);
  }
  .mark {
    width: 34px;
    height: 34px;
    margin-bottom: 14px;
    border-radius: 11px;
    background: linear-gradient(135deg, #8b5cf6, #22d3ee);
    box-shadow: 0 0 26px rgba(139, 92, 246, 0.45);
  }
  h1 { margin: 0 0 8px; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 0; font-size: 13px; line-height: 1.75; color: #9b9bb4; }
  .hints { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
  .hint {
    padding: 4px 9px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    color: #9b9bb4;
    font-size: 11px;
  }
  .files {
    margin-top: 14px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.28);
    color: #7c7c94;
    font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .files-label {
    display: block;
    margin-bottom: 4px;
    color: #6d6d85;
    font-family: inherit;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <main class="card">
    <div class="mark"></div>
    <h1>${escapeHtml(options.title)}</h1>
    <p>${escapeHtml(options.message)}</p>
    ${hints ? `<div class="hints">${hints}</div>` : ""}
    ${fileList}
  </main>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/*                                  utilities                                 */
/* -------------------------------------------------------------------------- */

function normalizeFiles(files: FileMap): Map<string, string> {
  const map = new Map<string, string>();
  if (!files || typeof files !== "object") return map;
  for (const [rawPath, rawContent] of Object.entries(files)) {
    if (typeof rawContent !== "string") continue;
    const path = normalizePath(rawPath);
    if (!path) continue;
    map.set(path, rawContent);
  }
  return map;
}

function normalizePath(rawPath: string): string {
  const withoutQuery = rawPath.replace(/\\/g, "/").split(/[?#]/)[0] ?? "";
  return withoutQuery
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/")
    .toLowerCase();
}

function findEntryPath(files: Map<string, string>): string | null {
  for (const candidate of ENTRY_CANDIDATES) {
    if (files.has(candidate)) return candidate;
  }
  const nested = [...files.keys()]
    .filter((path) => path === "index.html" || /(^|\/)index\.(html|htm)$/.test(path))
    .sort(
      (a, b) =>
        a.split("/").length - b.split("/").length || a.localeCompare(b),
    );
  return nested[0] ?? null;
}

function resolveLocalPath(fromPath: string, ref: string): string | null {
  const cleaned = ref.trim().split(/[?#]/)[0]?.replace(/\\/g, "/") ?? "";
  if (!cleaned) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(cleaned)) return null;
  const baseDir = fromPath.includes("/")
    ? fromPath.slice(0, fromPath.lastIndexOf("/"))
    : "";
  const combined = cleaned.startsWith("/")
    ? cleaned.slice(1)
    : baseDir
      ? `${baseDir}/${cleaned}`
      : cleaned;
  const segments: string[] = [];
  for (const segment of combined.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  const resolved = segments.join("/");
  return resolved.length > 0 ? resolved.toLowerCase() : null;
}

function readAttr(attrs: string, name: string): string | null {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
    "i",
  );
  const match = pattern.exec(attrs);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function isExternalRef(ref: string): boolean {
  return /^(?:https?:)?\/\//i.test(ref.trim());
}

function isDataRef(ref: string): boolean {
  return /^(?:data|blob):/i.test(ref.trim());
}

function escapeStyleContent(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

function escapeScriptContent(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function shorten(value: string): string {
  return value.length > 60 ? `${value.slice(0, 57)}…` : value;
}
