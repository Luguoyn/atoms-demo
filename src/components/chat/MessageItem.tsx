"use client";

import type { ChatMessage } from "@/types";
import { cn, formatClock } from "@/lib/utils";
import { humanizeError } from "./errorText";
import { Markdown } from "./Markdown";
import { PlanCard } from "./PlanCard";
import { StepList } from "./StepList";
import { IconAlertTriangle, IconCheck, IconSparkles } from "./icons";

export interface MessageItemProps {
  message: ChatMessage;
  versionLabel?: string;
  /** Global generation flag from the store — a "streaming" message without it is stale (e.g. reloaded mid-stream). */
  busy: boolean;
}

export function MessageItem({ message, versionLabel, busy }: MessageItemProps) {
  if (message.role === "user") return <UserMessage message={message} />;
  return (
    <AssistantMessage
      message={message}
      versionLabel={versionLabel}
      busy={busy}
    />
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="group flex animate-slide-up flex-col items-end gap-1">
      <div className="msg-user max-w-[86%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-[13.5px] leading-relaxed">
        {message.content}
      </div>
      <span className="pr-1 text-[10.5px] text-muted-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {formatClock(message.createdAt)}
      </span>
    </div>
  );
}

function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-1", className)}>
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </span>
  );
}

function AssistantMessage({ message, versionLabel, busy }: MessageItemProps) {
  const streaming = message.status === "streaming" && busy;
  // The store persists mid-stream messages; after a reload they are stale, not live.
  const interrupted = message.status === "streaming" && !busy;
  const failed = message.status === "error";
  const content = message.content ?? "";
  const hasContent = content.trim().length > 0;
  const steps = message.steps ?? [];
  const hasPlan = Boolean(message.plan);
  const showThinkingBubble = streaming && !hasContent && !hasPlan && steps.length === 0;
  const showWritingHint =
    streaming && !hasContent && (hasPlan || steps.length > 0);

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
            <p className="mt-1.5 text-[11px] text-muted-2">
              可以调整描述后重试，或检查模型设置。
            </p>
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

        {!streaming ? (
          <div className="flex items-center gap-2 pl-0.5 text-[10.5px] text-muted-2">
            {versionLabel ? (
              <span className="inline-flex items-center gap-1 text-ok/80">
                <IconCheck className="h-3 w-3" />
                已保存 {versionLabel}
              </span>
            ) : null}
            <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {formatClock(message.createdAt)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
