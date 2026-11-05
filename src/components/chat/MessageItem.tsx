"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { ChatMessage, GenerationUsage } from "@/types";
import { useToast } from "@/components/ui";
import { cn, copyText, formatClock } from "@/lib/utils";
import { humanizeError } from "./errorText";
import { Markdown } from "./Markdown";
import { PlanCard } from "./PlanCard";
import { StepList } from "./StepList";
import {
  IconActivity,
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconPencil,
  IconRefresh,
  IconSparkles,
} from "./icons";

export interface MessageItemProps {
  message: ChatMessage;
  versionLabel?: string;
  /** Global generation flag from the store — a "streaming" message without it is stale (e.g. reloaded mid-stream). */
  busy: boolean;
  onRegenerate: (messageId: string) => void;
  onRetry: () => void;
  onEditResend: (messageId: string, text: string) => void;
}

export function MessageItem({
  message,
  versionLabel,
  busy,
  onRegenerate,
  onRetry,
  onEditResend,
}: MessageItemProps) {
  if (message.role === "user") {
    return (
      <UserMessage message={message} busy={busy} onEditResend={onEditResend} />
    );
  }
  return (
    <AssistantMessage
      message={message}
      versionLabel={versionLabel}
      busy={busy}
      onRegenerate={onRegenerate}
      onRetry={onRetry}
    />
  );
}

/* --------------------------------- helpers -------------------------------- */

function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(count < 10000 ? 1 : 0)}k`;
}

function ActionButton({
  icon,
  label,
  onClick,
  danger = false,
  disabled = false,
  title,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={cn(
        "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        danger
          ? "text-muted-2 hover:bg-err/10 hover:text-err"
          : "text-muted-2 hover:bg-white/[0.06] hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

const ACTION_ROW_CLASS =
  "flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100";

function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-1", className)}>
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </span>
  );
}

function UsagePanel({ usage }: { usage: GenerationUsage }) {
  const cacheRatio =
    usage.cachedTokens > 0 && usage.promptTokens > 0
      ? Math.round((usage.cachedTokens / usage.promptTokens) * 100)
      : 0;

  return (
    <div className="animate-fade-in rounded-xl bg-white/[0.025] px-3 py-2 text-[10.5px] text-muted-2 ring-1 ring-white/[0.06]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          输入{" "}
          <span className="font-mono text-fg/80">
            {formatTokens(usage.promptTokens)}
          </span>
        </span>
        <span>
          输出{" "}
          <span className="font-mono text-fg/80">
            {formatTokens(usage.completionTokens)}
          </span>
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1",
            usage.cachedTokens > 0 && "text-ok/80",
          )}
        >
          缓存命中{" "}
          <span className="font-mono">
            {formatTokens(usage.cachedTokens)}
            {cacheRatio > 0 ? `（${cacheRatio}%）` : ""}
          </span>
        </span>
        {usage.reasoningTokens ? (
          <span>
            思考{" "}
            <span className="font-mono text-fg/80">
              {formatTokens(usage.reasoningTokens)}
            </span>
          </span>
        ) : null}
        <span className="ml-auto truncate font-mono text-muted-2/70">
          {usage.model}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------- user message ---------------------------- */

function UserMessage({
  message,
  busy,
  onEditResend,
}: {
  message: ChatMessage;
  busy: boolean;
  onEditResend: (messageId: string, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    onEditResend(message.id, text);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(message.content);
    setEditing(false);
  };

  const startEditing = () => {
    setDraft(message.content);
    setEditing(true);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (!(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    submit();
  };

  if (editing) {
    return (
      <div className="flex animate-slide-up flex-col items-end gap-1">
        <div className="w-full max-w-[92%] rounded-2xl rounded-br-md bg-black/30 p-2 ring-1 ring-accent/35">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            disabled={busy}
            aria-label="编辑消息"
            className="max-h-[140px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-fg outline-none disabled:opacity-60"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="hidden text-[10px] text-muted-2 sm:inline">
              Ctrl/⌘+Enter 保存并重发
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={cancel} className="btn btn-sm btn-ghost">
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim() || busy}
                className="btn btn-sm btn-primary"
              >
                保存并重发
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex animate-slide-up flex-col items-end gap-1">
      <div className="msg-user max-w-[86%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-[13.5px] leading-relaxed">
        {message.content}
      </div>
      <div className="flex items-center gap-1.5 pr-0.5 text-[10.5px] text-muted-2">
        <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {formatClock(message.createdAt)}
        </span>
        <div className={ACTION_ROW_CLASS}>
          <ActionButton
            icon={<IconPencil className="h-3 w-3" />}
            label="编辑并重发"
            onClick={startEditing}
            disabled={busy}
            title={busy ? "生成中暂时无法编辑" : "编辑这条消息并重新发送"}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ assistant message ------------------------- */

function AssistantMessage({
  message,
  versionLabel,
  busy,
  onRegenerate,
  onRetry,
}: {
  message: ChatMessage;
  versionLabel?: string;
  busy: boolean;
  onRegenerate: (messageId: string) => void;
  onRetry: () => void;
}) {
  const { toast } = useToast();
  const [showUsage, setShowUsage] = useState(false);
  const streaming = message.status === "streaming" && busy;
  // The store persists mid-stream messages; after a reload they are stale, not live.
  const interrupted = message.status === "streaming" && !busy;
  const failed = message.status === "error";
  const content = message.content ?? "";
  const hasContent = content.trim().length > 0;
  const steps = message.steps ?? [];
  const hasPlan = Boolean(message.plan);
  const usage = message.usage;
  const showThinkingBubble = streaming && !hasContent && !hasPlan && steps.length === 0;
  const showWritingHint = streaming && !hasContent && (hasPlan || steps.length > 0);
  const canAct = !streaming;

  const handleCopy = async () => {
    const ok = await copyText(content);
    toast(
      ok
        ? { title: "已复制消息内容", tone: "success" }
        : { title: "复制失败", description: "请手动选择文本复制", tone: "error" },
    );
  };

  return (
    <div className="group flex animate-slide-up gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-accent/25 via-accent/10 to-accent-2/15 ring-1 ring-white/10",
          streaming && "glow",
        )}
      >
        {failed ? (
          <IconAlertTriangle className="h-3.5 w-3.5 text-err" />
        ) : interrupted ? (
          <IconAlertTriangle className="h-3.5 w-3.5 text-warn" />
        ) : (
          <IconSparkles className="h-3.5 w-3.5 text-accent-soft" />
        )}
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        {message.plan ? (
          <PlanCard plan={message.plan} defaultOpen={streaming} />
        ) : null}

        {steps.length > 0 ? <StepList steps={steps} /> : null}

        {failed ? (
          <div className="rounded-2xl rounded-bl-md bg-err/[0.07] px-3.5 py-2.5 ring-1 ring-err/25">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-err">
              <IconAlertTriangle className="h-3.5 w-3.5" />
              生成失败
            </div>
            <p className="mt-1 max-w-[52ch] whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-muted">
              {humanizeError(content) || "请求未能完成，请重试。"}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={onRetry}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg bg-err/10 px-2 py-1 text-[11px] font-medium text-err ring-1 ring-err/25 transition hover:bg-err/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <IconRefresh className="h-3 w-3" />
                重试
              </button>
              <span className="text-[10.5px] text-muted-2">
                也可以调整描述后重新发送
              </span>
            </div>
          </div>
        ) : hasContent ? (
          <div className="msg-agent max-w-[95%] px-3.5 py-2.5">
            <Markdown text={content} />
            {streaming ? (
              <span className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-muted-2">
                <TypingDots />
                正在输出
              </span>
            ) : null}
          </div>
        ) : null}

        {showThinkingBubble ? (
          <div className="msg-agent inline-flex items-center gap-2 px-3.5 py-2.5">
            <TypingDots />
            <span className="text-[12px] text-muted">正在思考…</span>
          </div>
        ) : null}

        {showWritingHint ? (
          <div className="flex items-center gap-2 pl-0.5">
            <TypingDots />
            <span className="text-[11.5px] text-muted-2">正在编写代码…</span>
          </div>
        ) : null}

        {interrupted ? (
          <div className="flex items-start gap-1.5 rounded-xl bg-warn/[0.06] px-3 py-2 text-[11.5px] leading-relaxed text-warn/90 ring-1 ring-warn/20">
            <IconAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              本次生成已中断（页面刷新或连接断开）。可以重新发送，或继续描述修改。
            </span>
          </div>
        ) : null}

        {showUsage && usage ? <UsagePanel usage={usage} /> : null}

        {!streaming ? (
          <div className="flex min-h-[20px] items-center gap-2 pl-0.5 text-[10.5px] text-muted-2">
            {versionLabel ? (
              <span className="inline-flex items-center gap-1 text-ok/80">
                <IconCheck className="h-3 w-3" />
                已保存 {versionLabel}
              </span>
            ) : null}
            <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {formatClock(message.createdAt)}
            </span>

            <div className={cn("ml-auto", ACTION_ROW_CLASS)}>
              {hasContent ? (
                <ActionButton
                  icon={<IconCopy className="h-3 w-3" />}
                  label="复制"
                  onClick={() => {
                    void handleCopy();
                  }}
                />
              ) : null}
              {usage ? (
                <ActionButton
                  icon={<IconActivity className="h-3 w-3" />}
                  label={showUsage ? "收起用量" : "用量"}
                  onClick={() => setShowUsage((value) => !value)}
                  title="查看本次生成消耗的 tokens 与缓存命中"
                />
              ) : null}
              {failed || interrupted ? (
                <ActionButton
                  icon={<IconRefresh className="h-3 w-3" />}
                  label="重试"
                  onClick={onRetry}
                  disabled={busy}
                />
              ) : (
                <ActionButton
                  icon={<IconRefresh className="h-3 w-3" />}
                  label="重新生成"
                  onClick={() => onRegenerate(message.id)}
                  disabled={!canAct || busy}
                  title="用同一条需求重新生成"
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
