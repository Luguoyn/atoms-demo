/**
 * Download helpers for generated apps:
 * - `downloadSingleHtml` bundles everything into one runnable .html file;
 * - `downloadZip` packs the original virtual files plus a generated README.
 *
 * OWNER: ui-preview.
 */

import type { FileMap } from "@/types";
import { byteSize, downloadBlob, formatBytes } from "@/lib/utils";
import {
  buildStandaloneDocument,
  hasPreviewEntry,
} from "@/lib/preview/bundler";

const README_FILE = "README.md";

/** Filesystem-safe-ish name used for downloaded artifacts. */
export function slugifyAppName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-]+|[.\-]+$/g, "");
  return (cleaned || "atoms-app").slice(0, 48);
}

/** Download the app as a single self-contained HTML file. Returns the filename. */
export async function downloadSingleHtml(
  files: FileMap,
  name: string,
): Promise<string> {
  if (!hasPreviewEntry(files)) {
    throw new Error("缺少 index.html，无法导出单文件 HTML");
  }
  const { html } = buildStandaloneDocument(files);
  const filename = `${slugifyAppName(name)}.html`;
  downloadBlob(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    filename,
  );
  return filename;
}

/** Download the app as a ZIP with the original files + README. Returns the filename. */
export async function downloadZip(files: FileMap, name: string): Promise<string> {
  const sourceFiles = Object.entries(files ?? {}).filter(
    ([, content]) => typeof content === "string",
  );
  if (sourceFiles.length === 0) {
    throw new Error("当前还没有可导出的文件");
  }

  const { strToU8, zipSync } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of sourceFiles) {
    const safePath = toZipPath(path);
    if (!safePath) continue;
    entries[safePath] = strToU8(content);
  }
  if (!entries["README.md"]) {
    entries[README_FILE] = strToU8(buildReadme(files, name));
  }

  const zipped = zipSync(entries, { level: 6, mtime: new Date() });
  const filename = `${slugifyAppName(name)}.zip`;
  downloadBlob(new Blob([zipped], { type: "application/zip" }), filename);
  return filename;
}

/* -------------------------------------------------------------------------- */
/*                                  internals                                 */
/* -------------------------------------------------------------------------- */

function toZipPath(path: string): string | null {
  const normalized = path
    .replace(/\\/g, "/")
    .split(/[?#]/)[0]
    ?.replace(/^\/+/, "")
    .trim();
  if (!normalized) return null;
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;
  // Guard against zip-slip style paths.
  if (segments.some((segment) => segment === ".." || segment === ".")) return null;
  return segments.join("/");
}

function buildReadme(files: FileMap, name: string): string {
  const fileLines = Object.entries(files)
    .filter(([, content]) => typeof content === "string")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => `- \`${path}\` · ${formatBytes(byteSize(content))}`)
    .join("\n");
  const appName = name.trim() || "Atoms 应用";
  return `# ${appName}

由 **Atoms Demo** 于 ${new Date().toLocaleString("zh-CN")} 生成。

## 文件

${fileLines}

## 本地运行

直接双击打开 \`index.html\` 即可在浏览器中运行。这是纯静态应用，样式与脚本会随文件一起加载，无需安装依赖、无需联网。

## 说明

- 应用的数据保存在浏览器 \`localStorage\` 中，只留在本机，不会上传。
- 如需重新生成或继续修改，回到 Atoms Demo 的对话里告诉 Agent 即可。
`;
}
