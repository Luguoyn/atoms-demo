/**
 * Lightweight line-level diff for version comparison — implemented from scratch,
 * no third-party dependency.
 *
 * Strategy: trim the common prefix/suffix first (most refinements only touch a
 * small region), then run a bounded LCS dynamic-programming pass on the middle.
 * If the middle is too large — or a whole file is above the byte budget — we fall
 * back to a coarse "replace block" diff marked `truncated`, so a huge generated
 * file can never freeze the panel.
 *
 * OWNER: ui-preview.
 */

import type { FileMap } from "@/types";

export type DiffLineKind = "ctx" | "add" | "del";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  /** 1-based line number in the "before" file, null for added lines. */
  oldLine: number | null;
  /** 1-based line number in the "after" file, null for deleted lines. */
  newLine: number | null;
}

export type FileDiffStatus =
  | "added"
  | "deleted"
  | "modified"
  | "unchanged"
  | "skipped";

export interface FileDiff {
  path: string;
  status: FileDiffStatus;
  additions: number;
  deletions: number;
  /** Ordered diff lines; empty for unchanged files. */
  lines: DiffLine[];
  oldBytes: number;
  newBytes: number;
  /** True when the diff is a coarse replacement / was skipped for size. */
  truncated?: boolean;
  /** Human readable explanation for truncated / skipped entries. */
  note?: string;
}

export interface DiffSummary {
  files: FileDiff[];
  changedFiles: number;
  additions: number;
  deletions: number;
}

export interface DiffOptions {
  /** Files larger than this (UTF-16 chars) skip per-line diffing. */
  maxFileChars?: number;
  /** Max DP cells (middle region) before falling back to a coarse diff. */
  maxCells?: number;
  /** Max changed lines per side before falling back to a coarse diff. */
  maxChangedLines?: number;
}

const DEFAULT_MAX_FILE_CHARS = 200_000;
const DEFAULT_MAX_CELLS = 250_000;
const DEFAULT_MAX_CHANGED_LINES = 2_000;
const PRIORITY = ["index.html", "index.htm", "styles.css", "app.js"];

/** Diff two file maps; returns one entry per path (unchanged files included). */
export function diffFiles(
  before: FileMap,
  after: FileMap,
  options: DiffOptions = {},
): DiffSummary {
  const config: Required<DiffOptions> = {
    maxFileChars: options.maxFileChars ?? DEFAULT_MAX_FILE_CHARS,
    maxCells: options.maxCells ?? DEFAULT_MAX_CELLS,
    maxChangedLines: options.maxChangedLines ?? DEFAULT_MAX_CHANGED_LINES,
  };
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((path) => typeof path === "string" && path.length > 0)
    .sort(comparePaths);

  const files: FileDiff[] = [];
  let additions = 0;
  let deletions = 0;
  let changedFiles = 0;

  for (const path of paths) {
    const beforeText = before[path];
    const afterText = after[path];
    const fileDiff = diffFile(path, beforeText, afterText, config);
    files.push(fileDiff);
    if (fileDiff.status !== "unchanged") {
      changedFiles += 1;
      additions += fileDiff.additions;
      deletions += fileDiff.deletions;
    }
  }

  return { files, changedFiles, additions, deletions };
}

/** Diff a single pair of texts (exported for tests / reuse). */
export function diffTexts(
  before: string,
  after: string,
  options: DiffOptions = {},
): Pick<FileDiff, "lines" | "additions" | "deletions" | "truncated" | "note"> {
  const config = {
    maxFileChars: options.maxFileChars ?? DEFAULT_MAX_FILE_CHARS,
    maxCells: options.maxCells ?? DEFAULT_MAX_CELLS,
    maxChangedLines: options.maxChangedLines ?? DEFAULT_MAX_CHANGED_LINES,
  };
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  return diffLineArrays(beforeLines, afterLines, config);
}

/* -------------------------------------------------------------------------- */
/*                                  internals                                 */
/* -------------------------------------------------------------------------- */

interface InternalDiffConfig {
  maxFileChars: number;
  maxCells: number;
  maxChangedLines: number;
}

function diffFile(
  path: string,
  beforeText: string | undefined,
  afterText: string | undefined,
  config: InternalDiffConfig,
): FileDiff {
  const beforeBytes = beforeText === undefined ? 0 : beforeText.length;
  const afterBytes = afterText === undefined ? 0 : afterText.length;

  if (beforeText === undefined && afterText === undefined) {
    return baseFile(path, "unchanged", 0, 0, [], 0, 0);
  }

  if (beforeText === undefined) {
    const result = fullFileDiff(afterText ?? "", "add", config);
    return {
      ...baseFile(path, "added", result.additions, 0, result.lines, 0, afterBytes),
      truncated: result.truncated,
      note: result.note,
    };
  }

  if (afterText === undefined) {
    const result = fullFileDiff(beforeText, "del", config);
    return {
      ...baseFile(path, "deleted", 0, result.deletions, result.lines, beforeBytes, 0),
      truncated: result.truncated,
      note: result.note,
    };
  }

  if (beforeText === afterText) {
    return baseFile(path, "unchanged", 0, 0, [], beforeBytes, afterBytes);
  }

  if (beforeText.length > config.maxFileChars || afterText.length > config.maxFileChars) {
    return {
      ...baseFile(path, "modified", 0, 0, [], beforeBytes, afterBytes),
      truncated: true,
      note: `文件较大（${formatKb(Math.max(beforeBytes, afterBytes))}），已跳过逐行对比`,
    };
  }

  const result = diffTexts(beforeText, afterText, config);
  return {
    ...baseFile(
      path,
      "modified",
      result.additions,
      result.deletions,
      result.lines,
      beforeBytes,
      afterBytes,
    ),
    truncated: result.truncated,
    note: result.note,
  };
}

function baseFile(
  path: string,
  status: FileDiffStatus,
  additions: number,
  deletions: number,
  lines: DiffLine[],
  oldBytes: number,
  newBytes: number,
): FileDiff {
  return { path, status, additions, deletions, lines, oldBytes, newBytes };
}

function fullFileDiff(
  text: string,
  kind: "add" | "del",
  config: InternalDiffConfig,
) {
  const lines = splitLines(text);
  const capped = lines.length > config.maxChangedLines;
  const visible = capped ? lines.slice(0, config.maxChangedLines) : lines;
  const diffLines: DiffLine[] = visible.map((line, index) => ({
    kind,
    text: line,
    oldLine: kind === "del" ? index + 1 : null,
    newLine: kind === "add" ? index + 1 : null,
  }));
  const total = visible.length;
  return {
    lines: diffLines,
    additions: kind === "add" ? total : 0,
    deletions: kind === "del" ? total : 0,
    truncated: capped,
    note: capped
      ? `文件共 ${lines.length} 行，仅显示前 ${config.maxChangedLines} 行`
      : undefined,
  };
}

function diffLineArrays(
  beforeLines: string[],
  afterLines: string[],
  config: InternalDiffConfig,
): Pick<FileDiff, "lines" | "additions" | "deletions" | "truncated" | "note"> {
  /* 1. common prefix / suffix — keeps the DP region small for typical edits */
  let start = 0;
  while (
    start < beforeLines.length &&
    start < afterLines.length &&
    beforeLines[start] === afterLines[start]
  ) {
    start += 1;
  }
  let endBefore = beforeLines.length;
  let endAfter = afterLines.length;
  while (
    endBefore > start &&
    endAfter > start &&
    beforeLines[endBefore - 1] === afterLines[endAfter - 1]
  ) {
    endBefore -= 1;
    endAfter -= 1;
  }

  const middleBefore = beforeLines.slice(start, endBefore);
  const middleAfter = afterLines.slice(start, endAfter);

  const lines: DiffLine[] = [];
  for (let index = 0; index < start; index += 1) {
    lines.push({
      kind: "ctx",
      text: beforeLines[index],
      oldLine: index + 1,
      newLine: index + 1,
    });
  }

  let truncated = false;
  let note: string | undefined;
  const middleCells =
    (middleBefore.length + 1) * (middleAfter.length + 1);
  const middleTooTall =
    middleBefore.length + middleAfter.length > config.maxChangedLines;
  const lcs =
    middleCells <= config.maxCells && !middleTooTall
      ? lcsDiff(middleBefore, middleAfter, start)
      : null;

  if (lcs) {
    lines.push(...lcs);
  } else {
    truncated = true;
    note = `变更范围较大（-${middleBefore.length} / +${middleAfter.length} 行），已简化为整块替换`;
    let oldLine = start + 1;
    for (const text of middleBefore) {
      lines.push({ kind: "del", text, oldLine, newLine: null });
      oldLine += 1;
    }
    let newLine = start + 1;
    for (const text of middleAfter) {
      lines.push({ kind: "add", text, oldLine: null, newLine });
      newLine += 1;
    }
  }

  for (let index = 0; index < beforeLines.length - endBefore; index += 1) {
    lines.push({
      kind: "ctx",
      text: beforeLines[endBefore + index],
      oldLine: endBefore + index + 1,
      newLine: endAfter + index + 1,
    });
  }

  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.kind === "add") additions += 1;
    else if (line.kind === "del") deletions += 1;
  }

  return { lines, additions, deletions, truncated, note };
}

/** Bounded LCS backtrack over the trimmed middle region. */
function lcsDiff(
  before: string[],
  after: string[],
  offset: number,
): DiffLine[] | null {
  const n = before.length;
  const m = after.length;
  const cells = (n + 1) * (m + 1);
  const table = new Uint32Array(cells); // LCS lengths, filled bottom-right → top-left
  const stride = m + 1;
  for (let i = n - 1; i >= 0; i -= 1) {
    const rowBase = i * stride;
    const nextBase = rowBase + stride;
    for (let j = m - 1; j >= 0; j -= 1) {
      table[rowBase + j] =
        before[i] === after[j]
          ? table[nextBase + j + 1] + 1
          : Math.max(table[nextBase + j], table[rowBase + j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldLine = offset + 1;
  let newLine = offset + 1;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      lines.push({ kind: "ctx", text: before[i], oldLine, newLine });
      i += 1;
      j += 1;
      oldLine += 1;
      newLine += 1;
      continue;
    }
    const skipBefore = table[(i + 1) * stride + j];
    const skipAfter = table[i * stride + j + 1];
    if (skipBefore >= skipAfter) {
      lines.push({ kind: "del", text: before[i], oldLine, newLine: null });
      i += 1;
      oldLine += 1;
    } else {
      lines.push({ kind: "add", text: after[j], oldLine: null, newLine });
      j += 1;
      newLine += 1;
    }
  }
  while (i < n) {
    lines.push({ kind: "del", text: before[i], oldLine, newLine: null });
    i += 1;
    oldLine += 1;
  }
  while (j < m) {
    lines.push({ kind: "add", text: after[j], oldLine: null, newLine });
    j += 1;
    newLine += 1;
  }
  return lines;
}

function splitLines(text: string): string[] {
  if (!text) return [];
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function comparePaths(a: string, b: string): number {
  const aIndex = PRIORITY.indexOf(a);
  const bIndex = PRIORITY.indexOf(b);
  const aRank = aIndex === -1 ? PRIORITY.length : aIndex;
  const bRank = bIndex === -1 ? PRIORITY.length : bIndex;
  if (aRank !== bRank) return aRank - bRank;
  return a.localeCompare(b);
}

function formatKb(chars: number): string {
  if (chars < 1024) return `${chars} B`;
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(1)} KB`;
  return `${(chars / 1024 / 1024).toFixed(1)} MB`;
}
