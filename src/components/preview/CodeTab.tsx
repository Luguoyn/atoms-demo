"use client";

/**
 * 代码 tab: virtual file tree + line-numbered source viewer.
 * Per-file copy / download, plus "复制全部" and ZIP export.
 * OWNER: ui-preview.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { FileMap } from "@/types";
import { Button, useToast } from "@/components/ui";
import {
  buildCombinedSource,
  formatFileSize,
  listSourceFiles,
  type SourceFileInfo,
  type SourceLanguage,
} from "@/lib/preview/codeFiles";
import { downloadVirtualFile, downloadZip } from "@/lib/export/exportApp";
import { copyText } from "@/lib/utils";
import {
  IconArchive,
  IconCopy,
  IconDownload,
  IconFileCode,
} from "./Icons";

export interface CodeTabProps {
  files: FileMap;
  projectName: string;
}

const MAX_VIEW_LINES = 2_500;

const LANGUAGE_META: Record<
  SourceLanguage,
  { label: string; dot: string }
> = {
  html: { label: "HTML", dot: "bg-[#fb923c]" },
  css: { label: "CSS", dot: "bg-[#22d3ee]" },
  js: { label: "JS", dot: "bg-[#facc15]" },
  json: { label: "JSON", dot: "bg-[#a78bfa]" },
  md: { label: "MD", dot: "bg-[#94a3b8]" },
  text: { label: "TXT", dot: "bg-[#71717a]" },
};

export function CodeTab({ files, projectName }: CodeTabProps) {
  const { toast } = useToast();
  const list = useMemo(() => listSourceFiles(files), [files]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionsRef = useRef(new Map<string, number>());

  const selected: SourceFileInfo | null =
    list.find((file) => file.path === activePath) ?? list[0] ?? null;
  const totalBytes = useMemo(
    () => list.reduce((total, file) => total + file.bytes, 0),
    [list],
  );

  // Keep the selection valid when a new generation replaces the files.
  useEffect(() => {
    if (list.length === 0) return;
    if (!activePath || !list.some((file) => file.path === activePath)) {
      setActivePath(list[0].path);
    }
  }, [list, activePath]);

  // Preserve per-file scroll positions while switching files.
  useEffect(() => {
    const element = viewerRef.current;
    if (!element || !selected) return;
    element.scrollTop = scrollPositionsRef.current.get(selected.path) ?? 0;
  }, [selected]);

  const handleCopyFile = async () => {
    if (!selected) return;
    const ok = await copyText(selected.content);
    toast(
      ok
        ? { title: "已复制文件内容", description: selected.path, tone: "success" }
        : { title: "复制失败", description: "浏览器未允许写入剪贴板", tone: "error" },
    );
  };

  const handleDownloadFile = () => {
    if (!selected) return;
    try {
      const filename = downloadVirtualFile(selected.path, selected.content);
      toast({ title: "已开始下载", description: filename, tone: "success" });
    } catch {
      toast("下载失败，请稍后重试");
    }
  };

  const handleCopyAll = async () => {
    if (list.length === 0) return;
    const ok = await copyText(buildCombinedSource(files));
    toast(
      ok
        ? {
            title: "已复制全部代码",
            description: `${list.length} 个文件 · ${formatFileSize(totalBytes)}`,
            tone: "success",
          }
        : { title: "复制失败", description: "浏览器未允许写入剪贴板", tone: "error" },
    );
  };

  const handleZip = async () => {
    if (list.length === 0) return;
    try {
      const filename = await downloadZip(files, projectName);
      toast({ title: "ZIP 已开始下载", description: filename, tone: "success" });
    } catch (error) {
      toast(
        error instanceof Error ? `导出失败：${error.message}` : "导出失败，请稍后重试",
      );
    }
  };

  const lines = useMemo(() => {
    if (!selected) return [];
    const normalized = selected.content.replace(/\r\n?/g, "\n");
    const all = normalized.split("\n");
    if (all.length > 0 && all[all.length - 1] === "") all.pop();
    return all.slice(0, MAX_VIEW_LINES);
  }, [selected]);
  const truncated = (selected?.lines ?? 0) > MAX_VIEW_LINES;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <IconFileCode size={13} className="text-muted-2" />
        <span className="text-[12px] font-medium text-fg">代码</span>
        <span className="text-[11px] text-muted-2">
          {list.length > 0
            ? `${list.length} 个文件 · ${formatFileSize(totalBytes)}`
            : "暂无文件"}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void handleCopyAll();
            }}
            disabled={list.length === 0}
            className="gap-1 px-2 text-[11px]"
            title="复制全部代码"
          >
            <IconCopy size={12} />
            复制全部
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void handleZip();
            }}
            disabled={list.length === 0}
            className="gap-1 px-2 text-[11px]"
            title="下载 ZIP（含 README）"
          >
            <IconArchive size={12} />
            ZIP
          </Button>
        </div>
      </div>

      {list.length === 0 || !selected ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-2">
            <IconFileCode size={18} />
          </div>
          <p className="text-[12.5px] font-medium text-muted">还没有可查看的代码</p>
          <p className="max-w-[300px] text-[11.5px] leading-relaxed text-muted-2">
            生成完成后，这里会显示 index.html、styles.css、app.js
            的源码，并支持复制单个文件或整包下载。
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* file tree */}
          <aside className="scroll-thin w-[118px] shrink-0 overflow-y-auto border-r border-white/[0.06] py-1 sm:w-[148px]">
            {list.map((file) => {
              const meta = LANGUAGE_META[file.language];
              const active = file.path === selected.path;
              const name = file.path.split("/").filter(Boolean).pop() ?? file.path;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setActivePath(file.path)}
                  aria-current={active ? "true" : undefined}
                  className={
                    active
                      ? "flex w-full flex-col items-start gap-0.5 border-l-2 border-accent bg-accent/[0.09] px-2 py-1.5 text-left"
                      : "flex w-full flex-col items-start gap-0.5 border-l-2 border-transparent px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                  }
                  title={file.path}
                >
                  <span className="flex w-full min-w-0 items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`}
                      aria-hidden
                    />
                    <span className="truncate font-mono text-[11px] text-fg/90">
                      {name}
                    </span>
                  </span>
                  <span className="pl-3 text-[9.5px] text-muted-2">
                    {formatFileSize(file.bytes)} · {file.lines} 行
                  </span>
                </button>
              );
            })}
            <p className="px-2 pb-1 pt-2 text-[9px] leading-relaxed text-muted-2">
              生成的应用源码
            </p>
          </aside>

          {/* viewer */}
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-black/20 px-2.5 py-1.5">
              <span className="truncate font-mono text-[11px] text-fg/85">
                {selected.path}
              </span>
              <span className="hidden shrink-0 text-[10px] text-muted-2 sm:inline">
                {LANGUAGE_META[selected.language].label} · {selected.lines} 行
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyFile();
                  }}
                  title={`复制 ${selected.path}`}
                  aria-label={`复制 ${selected.path}`}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-white/[0.07] hover:text-fg"
                >
                  <IconCopy size={12} />
                </button>
                <button
                  type="button"
                  onClick={handleDownloadFile}
                  title={`下载 ${selected.path}`}
                  aria-label={`下载 ${selected.path}`}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-white/[0.07] hover:text-fg"
                >
                  <IconDownload size={12} />
                </button>
              </div>
            </div>

            {truncated ? (
              <div className="shrink-0 border-b border-warn/20 bg-warn/[0.06] px-2.5 py-1 text-[10.5px] text-warn">
                文件较大，仅显示前 {MAX_VIEW_LINES} 行（共 {selected.lines} 行）
              </div>
            ) : null}

            <div
              ref={viewerRef}
              onScroll={() => {
                const element = viewerRef.current;
                if (element && selected) {
                  scrollPositionsRef.current.set(selected.path, element.scrollTop);
                }
              }}
              className="scroll-thin min-h-0 flex-1 overflow-auto bg-[#08080d]"
            >
              <div className="w-max min-w-full py-1 font-mono" style={{ tabSize: 2 }}>
                {lines.length === 0 ? (
                  <p className="px-3 py-2 text-[11px] text-muted-2">
                    （空文件）
                  </p>
                ) : (
                  lines.map((line, index) => (
                    <div
                      key={index}
                      className="group flex min-w-full hover:bg-white/[0.035]"
                    >
                      <span className="sticky left-0 z-10 w-[42px] shrink-0 select-none bg-[#08080d] pr-2 text-right text-[10px] leading-[1.7] text-muted-2/60 group-hover:text-muted">
                        {index + 1}
                      </span>
                      <span className="whitespace-pre pl-3 pr-4 text-[11px] leading-[1.7] text-fg/85">
                        {line === "" ? " " : line}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
