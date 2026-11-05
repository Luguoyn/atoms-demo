"use client";

/**
 * Line-level diff view for a historical version vs. the current files.
 * Entry point: VersionsTab's "对比" button.
 * OWNER: ui-preview.
 */

import { useMemo, useState } from "react";
import type { FileMap, Version } from "@/types";
import { Badge, Button, type BadgeTone } from "@/components/ui";
import {
  diffFiles,
  type DiffLine,
  type FileDiff,
  type FileDiffStatus,
} from "@/lib/preview/diff";
import { cn } from "@/lib/utils";
import {
  IconAlert,
  IconArrowLeft,
  IconChevronDown,
  IconFileCode,
} from "./Icons";

export interface DiffViewProps {
  version: Version;
  currentFiles: FileMap;
  onBack: () => void;
}

/** Lines rendered per file before the "expand" affordance. */
const RENDER_CAP = 400;

const STATUS_META: Record<
  FileDiffStatus,
  { label: string; tone: BadgeTone }
> = {
  added: { label: "新增", tone: "ok" },
  deleted: { label: "删除", tone: "err" },
  modified: { label: "修改", tone: "accent" },
  skipped: { label: "跳过", tone: "warn" },
  unchanged: { label: "未变", tone: "default" },
};

export function DiffView({ version, currentFiles, onBack }: DiffViewProps) {
  const summary = useMemo(
    () => diffFiles(version.files, currentFiles),
    [version.files, currentFiles],
  );
  const changed = summary.files.filter((file) => file.status !== "unchanged");

  const scrollToFile = (index: number) => {
    document
      .getElementById(`atoms-diff-file-${index}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/[0.06] px-2.5 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回版本列表"
          title="返回版本列表"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-white/[0.07] hover:text-fg"
        >
          <IconArrowLeft size={13} />
        </button>
        <span className="text-[12px] font-medium text-fg">版本对比</span>
        <span className="badge h-[19px] px-1.5 font-mono text-[10px]">
          {version.label}
        </span>
        <span className="text-[10.5px] text-muted-2">→ 当前</span>
        <div className="ml-auto flex items-center gap-2 text-[10.5px]">
          <span className="text-ok">+{summary.additions}</span>
          <span className="text-err">-{summary.deletions}</span>
          <span className="text-muted-2">{changed.length} 个文件变更</span>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {changed.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-2">
              <IconFileCode size={18} />
            </div>
            <p className="text-[12.5px] font-medium text-muted">两个版本内容一致</p>
            <p className="max-w-[280px] text-[11.5px] leading-relaxed text-muted-2">
              {version.label} 与当前文件没有任何差异，继续修改后再来对比。
            </p>
            <Button variant="ghost" size="sm" onClick={onBack}>
              返回版本列表
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {changed.map((file, index) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => scrollToFile(index)}
                  className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] transition-colors hover:border-white/[0.16] hover:bg-white/[0.06]"
                  title={`跳转到 ${file.path}`}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      file.status === "added"
                        ? "bg-ok"
                        : file.status === "deleted"
                          ? "bg-err"
                          : "bg-accent-soft",
                    )}
                    aria-hidden
                  />
                  <span className="max-w-[120px] truncate font-mono text-fg/85">
                    {file.path}
                  </span>
                  {file.additions > 0 ? (
                    <span className="text-ok">+{file.additions}</span>
                  ) : null}
                  {file.deletions > 0 ? (
                    <span className="text-err">-{file.deletions}</span>
                  ) : null}
                </button>
              ))}
            </div>

            {changed.map((file, index) => (
              <FileDiffCard key={file.path} file={file} index={index} />
            ))}

            <p className="pb-1 text-center text-[10px] text-muted-2">
              逐行对比基于本地计算，不会上传代码
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function FileDiffCard({ file, index }: { file: FileDiff; index: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[file.status] ?? STATUS_META.modified;
  const visibleLines = expanded ? file.lines : file.lines.slice(0, RENDER_CAP);
  const hiddenCount = file.lines.length - visibleLines.length;

  return (
    <section
      id={`atoms-diff-file-${index}`}
      className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-black/20 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "展开文件差异" : "收起文件差异"}
          aria-expanded={!collapsed}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-2 transition-colors hover:bg-white/[0.07] hover:text-fg"
        >
          <IconChevronDown
            size={11}
            className={cn(
              "transition-transform",
              collapsed ? "-rotate-90" : "rotate-0",
            )}
          />
        </button>
        <IconFileCode size={12} className="shrink-0 text-muted-2" />
        <span className="min-w-0 truncate font-mono text-[11.5px] text-fg/90">
          {file.path}
        </span>
        <Badge tone={meta.tone} className="h-[18px] px-1.5 text-[9.5px]">
          {meta.label}
        </Badge>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px]">
          {file.additions > 0 ? (
            <span className="text-ok">+{file.additions}</span>
          ) : null}
          {file.deletions > 0 ? (
            <span className="text-err">-{file.deletions}</span>
          ) : null}
        </span>
      </header>

      {!collapsed ? (
        <>
          {file.note ? (
            <div className="flex items-start gap-1.5 border-b border-warn/15 bg-warn/[0.06] px-2.5 py-1 text-[10.5px] leading-relaxed text-warn">
              <IconAlert size={11} className="mt-[1px] shrink-0" />
              <span>{file.note}</span>
            </div>
          ) : null}

          {file.lines.length === 0 ? (
            <p className="px-2.5 py-2 text-[11px] text-muted-2">
              {file.status === "deleted" ? "文件已删除" : "文件为空"}
            </p>
          ) : (
            <div className="py-1 font-mono" style={{ tabSize: 2 }}>
              {visibleLines.map((line, lineIndex) => (
                <DiffRow key={lineIndex} line={line} />
              ))}
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="w-full border-t border-white/[0.06] py-1 text-[10.5px] text-muted transition-colors hover:bg-white/[0.04] hover:text-fg"
                >
                  展开剩余 {hiddenCount} 行
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  const added = line.kind === "add";
  const deleted = line.kind === "del";
  return (
    <div
      className={cn(
        "flex min-w-0 px-0.5",
        added && "bg-ok/[0.08]",
        deleted && "bg-err/[0.09]",
      )}
    >
      <span className="w-[26px] shrink-0 select-none pr-1 text-right text-[9.5px] leading-[1.65] text-muted-2/55">
        {line.oldLine ?? ""}
      </span>
      <span className="w-[26px] shrink-0 select-none pr-1 text-right text-[9.5px] leading-[1.65] text-muted-2/55">
        {line.newLine ?? ""}
      </span>
      <span
        className={cn(
          "w-3 shrink-0 select-none pl-0.5 text-[11px] leading-[1.65]",
          added ? "text-ok" : deleted ? "text-err" : "text-muted-2/35",
        )}
      >
        {added ? "+" : deleted ? "-" : " "}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-2 text-[11px] leading-[1.65] text-fg/85">
        {line.text === "" ? " " : line.text}
      </span>
    </div>
  );
}
