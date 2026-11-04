"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconArrowUp, IconStop } from "./icons";

export interface ComposerProps {
  busy: boolean;
  hasFiles: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

const MAX_TEXTAREA_HEIGHT = 148;

export function Composer({ busy, hasFiles, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // Do not send while an IME (e.g. Chinese pinyin) is composing.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  const placeholder = busy
    ? "Agent 正在生成中，点击停止可中断…"
    : hasFiles
      ? "继续描述修改，例如：把主色换成绿色"
      : "描述你想做的应用，例如：一个待办清单";

  return (
    <div>
      <div className="rounded-2xl bg-black/30 px-3 pb-2 pt-2.5 ring-1 ring-white/10 transition focus-within:ring-accent/45 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.10)]">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
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
                Agent 正在生成，可随时停止
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
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim()}
              aria-label="发送"
              title="发送（Enter）"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-indigo-600 text-white shadow-[0_8px_20px_-8px_rgba(139,92,246,0.8)] transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
            >
              <IconArrowUp className="h-4 w-4" />
            </button>
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
        </span>
      </div>
    </div>
  );
}
