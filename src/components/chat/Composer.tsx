"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { FOCUS_COMPOSER_EVENT } from "@/lib/hotkeys";
import { IconArrowUp, IconSparkles, IconStop } from "./icons";

export interface ComposerProps {
  busy: boolean;
  hasFiles: boolean;
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onEnhance: () => void;
  enhancing: boolean;
}

const MAX_TEXTAREA_HEIGHT = 148;

export function Composer({
  busy,
  hasFiles,
  value,
  onChange,
  onSend,
  onStop,
  onEnhance,
  enhancing,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow up to ~8 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  // Global `mod+k` (dispatched by the shell) focuses the composer.
  useEffect(() => {
    const handleFocus = () => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const end = el.value.length;
      el.setSelectionRange(end, end);
    };
    window.addEventListener(FOCUS_COMPOSER_EVENT, handleFocus);
    return () => window.removeEventListener(FOCUS_COMPOSER_EVENT, handleFocus);
  }, []);

  // Esc stops the running generation without leaving the input.
  useEffect(() => {
    if (!busy) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onStop();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onStop]);

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") return;
    // Do not send while an IME (e.g. Chinese pinyin) is composing.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const mod = event.metaKey || event.ctrlKey;
    if (event.shiftKey && !mod) return; // Shift+Enter inserts a newline
    event.preventDefault();
    submit();
  };

  const placeholder = busy
    ? "Agent 正在生成中，按 Esc 或点击停止可中断…"
    : hasFiles
      ? "继续描述修改，例如：把主色换成绿色"
      : "描述你想做的应用，例如：一个待办清单";

  return (
    <div>
      <div className="rounded-2xl bg-black/30 px-3 pb-2 pt-2.5 ring-1 ring-white/10 transition focus-within:ring-accent/45 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.10)]">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={busy}
          placeholder={placeholder}
          aria-label="输入你的需求"
          className="block max-h-[148px] w-full resize-none bg-transparent text-[13.5px] leading-[1.7] text-fg outline-none placeholder:text-muted-2 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
        />

        <div className="mt-1.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-2">
            {busy ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="typing-dot" />
                生成中 · 按 Esc 停止
              </span>
            ) : hasFiles ? (
              "迭代模式 · 会基于当前应用修改"
            ) : (
              "生成模式 · 从零创建应用"
            )}
          </span>

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl bg-err/10 px-3 text-[12px] font-medium text-err ring-1 ring-err/35 transition hover:bg-err/20"
            >
              <IconStop className="h-3 w-3" />
              停止
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onEnhance}
                disabled={enhancing}
                title="用 AI 把你的想法扩写成更完整的需求"
                className="flex h-8 shrink-0 items-center gap-1 rounded-xl bg-white/[0.04] px-2.5 text-[11.5px] text-muted ring-1 ring-white/10 transition hover:bg-accent/10 hover:text-accent-soft hover:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enhancing ? (
                  <span
                    className="spinner"
                    style={{ width: 11, height: 11, borderWidth: 1.5 }}
                    aria-hidden
                  />
                ) : (
                  <IconSparkles className="h-3 w-3" />
                )}
                扩写
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!value.trim()}
                aria-label="发送"
                title="发送（Enter / Ctrl+Enter）"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-indigo-600 text-white shadow-[0_8px_20px_-8px_rgba(139,92,246,0.8)] transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
              >
                <IconArrowUp className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[10.5px] text-muted-2">
        <span className="hidden truncate sm:inline">
          AI 生成内容可能存在错误，请检查后使用
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <kbd className="kbd">Enter</kbd>
          <span>发送</span>
          <span aria-hidden className="mx-0.5 text-white/15">
            ·
          </span>
          <kbd className="kbd">Shift</kbd>
          <span>+</span>
          <kbd className="kbd">Enter</kbd>
          <span>换行</span>
          <span aria-hidden className="mx-0.5 hidden text-white/15 sm:inline">
            ·
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <kbd className="kbd">?</kbd>
            <span>快捷键</span>
          </span>
        </span>
      </div>
    </div>
  );
}
