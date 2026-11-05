"use client";

/**
 * Console tab: streams `console.*` output and runtime errors captured from the
 * preview iframe. v0.2 adds level filtering, log copy and an auto-scroll toggle.
 * OWNER: ui-preview.
 */

import { useEffect, useRef, useState } from "react";
import type { ConsoleEntry } from "@/types";
import { Button, useToast } from "@/components/ui";
import { cn, copyText, formatClock } from "@/lib/utils";
import { IconCopy, IconTerminal, IconTrash } from "./Icons";

export interface ConsoleTabProps {
  entries: ConsoleEntry[];
  onClear: () => void;
}

type LevelFilter = "all" | "log" | "warn" | "error";

const FILTERS: { key: LevelFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "log", label: "日志" },
  { key: "warn", label: "警告" },
  { key: "error", label: "错误" },
];

const LEVEL_META: Record<
  ConsoleEntry["level"],
  { label: string; text: string; row: string }
> = {
  log: { label: "log", text: "text-muted-2", row: "" },
  info: { label: "info", text: "text-accent-2", row: "" },
  warn: { label: "warn", text: "text-warn", row: "bg-warn/[0.05]" },
  error: { label: "error", text: "text-err", row: "bg-err/[0.07]" },
};

export function ConsoleTab({ entries, onClear }: ConsoleTabProps) {
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [filter, setFilter] = useState<LevelFilter>("all");
  const [autoScroll, setAutoScroll] = useState(true);

  const errorCount = entries.reduce(
    (total, entry) => (entry.level === "error" ? total + 1 : total),
    0,
  );
  const warnCount = entries.reduce(
    (total, entry) => (entry.level === "warn" ? total + 1 : total),
    0,
  );
  const visibleEntries =
    filter === "all"
      ? entries
      : entries.filter((entry) => {
          if (filter === "log") {
            return entry.level === "log" || entry.level === "info";
          }
          return entry.level === filter;
        });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !autoScroll || !stickToBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [entries.length, filter, autoScroll]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 28;
  };

  const handleCopy = async () => {
    if (visibleEntries.length === 0) return;
    const text = visibleEntries
      .map(
        (entry) =>
          `[${formatClock(entry.at)}] [${entry.level.toUpperCase()}] ${entry.text}`,
      )
      .join("\n");
    const ok = await copyText(`${text}\n`);
    toast(
      ok
        ? {
            title: "已复制控制台日志",
            description: `${visibleEntries.length} 条`,
            tone: "success",
          }
        : { title: "复制失败", description: "浏览器未允许写入剪贴板", tone: "error" },
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header: title + counters + actions */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
        <IconTerminal size={13} className="shrink-0 text-muted-2" />
        <span className="text-[12px] font-medium text-fg">控制台</span>
        <span className="shrink-0 text-[11px] text-muted-2">
          {entries.length > 0 ? `${entries.length} 条` : "暂无输出"}
        </span>
        {errorCount > 0 ? (
          <span className="badge badge-err h-[18px] shrink-0 px-1.5 text-[10.5px]">
            {errorCount} 个错误
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            disabled={visibleEntries.length === 0}
            title="复制当前筛选的日志"
            aria-label="复制日志"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-white/[0.07] hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconCopy size={13} />
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={entries.length === 0}
            className="h-7 gap-1 px-1.5 text-[11px]"
            title="清空控制台"
          >
            <IconTrash size={12} />
            清空
          </Button>
        </div>
      </div>

      {/* filter + auto-scroll */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/[0.04] px-2.5 py-1">
        <div
          className="flex items-center gap-0.5 rounded-lg border border-white/[0.07] bg-black/20 p-0.5"
          role="group"
          aria-label="日志级别筛选"
        >
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
              className={cn(
                "rounded-md px-1.5 py-[3px] text-[10.5px] transition-colors",
                filter === option.key
                  ? "bg-white/[0.1] text-fg"
                  : "text-muted-2 hover:bg-white/[0.05] hover:text-fg",
              )}
            >
              {option.label}
              {option.key === "warn" && warnCount > 0 ? (
                <span className="ml-1 text-warn">{warnCount}</span>
              ) : null}
              {option.key === "error" && errorCount > 0 ? (
                <span className="ml-1 text-err">{errorCount}</span>
              ) : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAutoScroll((value) => !value)}
          aria-pressed={autoScroll}
          title={autoScroll ? "自动滚动已开启" : "自动滚动已关闭"}
          className={cn(
            "ml-auto rounded-md px-1.5 py-[3px] text-[10.5px] transition-colors",
            autoScroll
              ? "bg-accent/[0.12] text-accent-soft"
              : "text-muted-2 hover:bg-white/[0.05] hover:text-fg",
          )}
        >
          自动滚动{autoScroll ? "·开" : "·关"}
        </button>
      </div>

      {visibleEntries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-2">
            <IconTerminal size={18} />
          </div>
          <p className="text-[12.5px] font-medium text-muted">
            {entries.length === 0 ? "还没有控制台输出" : "当前筛选下没有日志"}
          </p>
          <p className="max-w-[300px] text-[11.5px] leading-relaxed text-muted-2">
            {entries.length === 0
              ? "生成的应用开始运行后，console.log、警告与运行时错误会实时出现在这里。"
              : "切换到「全部」查看其他级别的日志。"}
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="scroll-thin min-h-0 flex-1 overflow-y-auto font-mono"
        >
          {visibleEntries.map((entry) => {
            const meta = LEVEL_META[entry.level] ?? LEVEL_META.log;
            return (
              <div
                key={entry.id}
                className={cn(
                  "flex items-start gap-2 border-b border-white/[0.035] px-3 py-1.5 text-[11.5px] leading-relaxed",
                  meta.row,
                )}
              >
                <span className="shrink-0 pt-[1px] text-[10.5px] tabular-nums text-muted-2">
                  {formatClock(entry.at)}
                </span>
                <span
                  className={cn(
                    "w-[34px] shrink-0 pt-[1px] text-[10px] font-semibold uppercase tracking-wide",
                    meta.text,
                  )}
                >
                  {meta.label}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fg/85">
                  {entry.text}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {entries.length > 0 ? (
        <div className="shrink-0 border-t border-white/[0.05] px-3 py-1.5 text-[10.5px] text-muted-2">
          {filteredHint(visibleEntries.length, entries.length)} · 最多保留最近 200 条
        </div>
      ) : null}
    </div>
  );
}

function filteredHint(visible: number, total: number): string {
  return visible === total ? `共 ${total} 条` : `显示 ${visible} / ${total} 条`;
}
