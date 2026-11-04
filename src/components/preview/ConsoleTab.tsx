"use client";

/**
 * Console tab: streams `console.*` output and runtime errors captured from the
 * preview iframe. OWNER: ui-preview.
 */

import { useEffect, useRef } from "react";
import type { ConsoleEntry } from "@/types";
import { Button } from "@/components/ui";
import { cn, formatClock } from "@/lib/utils";
import { IconTerminal, IconTrash } from "./Icons";

export interface ConsoleTabProps {
  entries: ConsoleEntry[];
  onClear: () => void;
}

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !stickToBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [entries.length]);

  const errorCount = entries.reduce(
    (total, entry) => (entry.level === "error" ? total + 1 : total),
    0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <IconTerminal size={13} className="text-muted-2" />
        <span className="text-[12px] font-medium text-fg">控制台</span>
        <span className="text-[11px] text-muted-2">
          {entries.length > 0 ? `${entries.length} 条` : "暂无输出"}
        </span>
        {errorCount > 0 ? (
          <span className="badge badge-err h-[18px] px-1.5 text-[10.5px]">
            {errorCount} 个错误
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={entries.length === 0}
          className="ml-auto gap-1 px-2 text-[11.5px]"
          title="清空控制台"
        >
          <IconTrash size={12} />
          清空
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-2">
            <IconTerminal size={18} />
          </div>
          <p className="text-[12.5px] font-medium text-muted">还没有控制台输出</p>
          <p className="max-w-[300px] text-[11.5px] leading-relaxed text-muted-2">
            生成的应用开始运行后，console.log、警告与运行时错误会实时出现在这里。
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={() => {
            const element = scrollRef.current;
            if (!element) return;
            stickToBottomRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 28;
          }}
          className="scroll-thin min-h-0 flex-1 overflow-y-auto font-mono"
        >
          {entries.map((entry) => {
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
          最多保留最近 200 条 · 输出来自预览沙箱
        </div>
      ) : null}
    </div>
  );
}
