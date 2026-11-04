/**
 * Share links: the whole virtual file system is compressed with
 * `CompressionStream("deflate-raw")`, base64url-encoded and put in the URL hash
 * (`#share=<base64url(deflate(JSON))>`). When CompressionStream is unavailable
 * we fall back to plain base64url so sharing never hard-fails.
 *
 * Only the hash is used, so the payload is never sent to the server.
 * OWNER: ui-preview.
 */

import type { FileMap } from "@/types";

const HASH_PREFIX = "#share=";
const SHARE_VERSION = 1;
/** Browsers / proxies start to choke on multi-megabyte URLs. */
export const MAX_SHARE_URL_LENGTH = 1_500_000;

export interface SharedApp {
  files: FileMap;
  name?: string;
}

interface SharePayload {
  v: number;
  name?: string;
  files: FileMap;
  at: number;
}

/**
 * Encode the app into a link that can be opened in another tab/browser.
 * @throws when there is nothing to share or the payload exceeds the URL budget.
 */
export async function createShareUrl(
  files: FileMap,
  projectName?: string,
): Promise<string> {
  const entries = Object.entries(files ?? {}).filter(
    ([path, content]) =>
      typeof path === "string" && path.trim().length > 0 && typeof content === "string",
  );
  if (entries.length === 0) {
    throw new Error("当前应用还没有可分享的文件");
  }

  const payload: SharePayload = {
    v: SHARE_VERSION,
    name: projectName?.trim() ? projectName.trim().slice(0, 60) : undefined,
    files: Object.fromEntries(entries),
    at: Date.now(),
  };
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const compressed = await deflateRaw(raw);
  const encoded = bytesToBase64Url(compressed ?? raw);

  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const url = `${base}${HASH_PREFIX}${encoded}`;
  if (url.length > MAX_SHARE_URL_LENGTH) {
    throw new Error(
      "应用内容过大，无法生成分享链接（上限约 1.5MB）——可以改用导出 ZIP 分享。",
    );
  }
  return url;
}

/** Read a `#share=` payload from the current URL; null when absent/invalid. */
export async function readShareFromHash(): Promise<SharedApp | null> {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash ?? "";
  if (!hash.toLowerCase().startsWith(HASH_PREFIX)) return null;
  const encoded = hash.slice(HASH_PREFIX.length).trim();
  if (!encoded) return null;

  try {
    const bytes = base64UrlToBytes(encoded);
    const candidates: Uint8Array[] = [];
    const inflated = await inflateRaw(bytes);
    if (inflated) candidates.push(inflated);
    candidates.push(bytes);
    for (const candidate of candidates) {
      const parsed = parsePayload(new TextDecoder().decode(candidate));
      if (parsed) return parsed;
    }
  } catch {
    /* malformed link — treated as "no share" by the caller */
  }
  return null;
}

/** Drop the `#share=` fragment after importing, without adding a history entry. */
export function clearShareHash(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  try {
    window.history.replaceState(null, "", `${pathname}${search}`);
  } catch {
    /* some embedded contexts disallow history manipulation */
  }
}

/* -------------------------------------------------------------------------- */
/*                                  internals                                 */
/* -------------------------------------------------------------------------- */

function parsePayload(text: string): SharedApp | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const rawFiles = record.files;
  if (!rawFiles || typeof rawFiles !== "object" || Array.isArray(rawFiles)) {
    return null;
  }
  const files: FileMap = {};
  for (const [path, content] of Object.entries(
    rawFiles as Record<string, unknown>,
  )) {
    if (
      typeof content === "string" &&
      path.trim().length > 0 &&
      path.length <= 260
    ) {
      files[path] = content;
    }
  }
  if (Object.keys(files).length === 0) return null;
  const name =
    typeof record.name === "string" && record.name.trim()
      ? record.name.trim().slice(0, 60)
      : undefined;
  return { files, name };
}

async function deflateRaw(input: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([input as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

async function inflateRaw(input: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const stream = new Blob([input as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
