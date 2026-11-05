"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { IconClock } from "./icons";

export interface GenerationStatusProps {
  phaseLabel: string | null;
  statusHint: string | null;
  /** Changes whenever phase / hint / last message changes; resets the silence watchdog. */
  activityKey: string;
}

/** Show the "still generating" fallback after this much silence. */
const SILENCE_HINT_AFTER_MS = 20000;

function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Live "generating" status line for the chat header.
 *
 * Owns its 1s interval (and the silence watchdog) so ticking does not re-render
 * the whole chat panel tree. The component is mounted only while `busy` is true
 * and remounts when the active project changes, which resets the timer.
 */
export function GenerationStatus({
  phaseLabel,
  statusHint,
  activityKey,
}: GenerationStatusProps) {
  const startedAtRef = useRef<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Reset the watchdog whenever the run makes progress.
  useEffect(() => {
    setSilent(false);
    const watchdog = window.setTimeout(
      () => setSilent(true),
      SILENCE_HINT_AFTER_MS,
    );
    return () => window.clearTimeout(watchdog);
  }, [activityKey]);

  const hint = statusHint?.trim() || phaseLabel || "正在生成…";
  const text = silent ? "（仍在生成，可继续等待或点停止）" : hint;
  const title = silent
    ? `${hint} · 已超过 20 秒没有新进展，可继续等待或点停止`
    : hint;

  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[10.5px] leading-4 text-muted-2">
      <IconClock className="h-3 w-3 shrink-0 text-accent-soft/80" />
      <span className="shrink-0 tabular-nums text-muted">
        已用 {formatElapsed(elapsedSeconds)}
      </span>
      <span aria-hidden className="shrink-0 text-white/15">
        ·
      </span>
      <span
        className={cn("min-w-0 truncate", silent && "font-medium text-warn/85")}
        title={title}
        aria-live="polite"
        aria-atomic="true"
      >
        {text}
      </span>
    </div>
  );
}
