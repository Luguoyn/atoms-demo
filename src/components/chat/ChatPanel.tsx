"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useBuilder } from "@/lib/store";
import { Composer } from "./Composer";
import { humanizeError } from "./errorText";
import { MessageItem } from "./MessageItem";
import { REFINE_IDEAS, ResumeState, WelcomeScreen } from "./WelcomeScreen";
import {
  IconAlertTriangle,
  IconArrowDown,
  IconSettings,
  IconSparkles,
  IconX,
} from "./icons";

export interface ChatPanelProps {
  onOpenSettings: () => void;
}

export function ChatPanel({ onOpenSettings }: ChatPanelProps) {
  const {
    activeProject,
    busy,
    phaseLabel,
    error,
    dismissError,
    sendMessage,
    stopGeneration,
    serverMode,
  } = useBuilder();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const projectId = activeProject?.id ?? "none";
  const messages = activeProject?.messages ?? [];
  const files = activeProject?.files ?? {};
  const fileCount = Object.keys(files).length;
  const hasFiles = fileCount > 0;
  const versions = activeProject?.versions;

  const versionLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const version of versions ?? []) map.set(version.id, version.label);
    return map;
  }, [versions]);

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const scrollKey = [
    projectId,
    messages.length,
    lastMessage?.content.length ?? 0,
    lastMessage?.steps?.length ?? 0,
    lastMessage?.plan ? "p" : "",
    busy ? "b" : "",
  ].join(":");

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance < 96;
    stickToBottom.current = nearBottom;
    setShowJump((current) => (current === !nearBottom ? current : !nearBottom));
  }, []);

  // Jump to the bottom instantly when switching projects.
  useEffect(() => {
    stickToBottom.current = true;
    setShowJump(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [projectId]);

  // Follow streaming output only while the user is already at the bottom.
  useEffect(() => {
    if (!stickToBottom.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [scrollKey]);

  const jumpToBottom = useCallback(() => {
    stickToBottom.current = true;
    setShowJump(false);
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || busy) return;
      stickToBottom.current = true;
      setShowJump(false);
      void sendMessage(value);
    },
    [busy, sendMessage],
  );

  const subtitle = busy
    ? "Agent 正在生成应用，可随时停止"
    : hasFiles
      ? "继续描述修改，Agent 会基于当前应用迭代"
      : "描述你的想法，Agent 会规划并生成可运行的应用";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-white/5 px-3 py-2.5 sm:px-4">
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-accent/25 to-accent-2/15 ring-1 ring-white/10">
          <IconSparkles className="h-3.5 w-3.5 text-accent-soft" />
          {busy ? (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-accent-2 shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="shrink-0 text-[13px] font-semibold tracking-tight text-fg">
              对话
            </h2>
            {busy ? (
              <span className="badge badge-accent min-w-0">
                <span
                  className="spinner"
                  style={{ width: 11, height: 11, borderWidth: 1.5 }}
                  aria-hidden
                />
                <span className="truncate">{phaseLabel ?? "生成中"}</span>
              </span>
            ) : serverMode === "mock" ? (
              <button
                type="button"
                onClick={onOpenSettings}
                title="当前为演示模式，点击配置模型"
                className="badge badge-warn cursor-pointer transition hover:brightness-110"
              >
                演示模式 →
              </button>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-2">{subtitle}</p>
        </div>

        {busy ? (
          <Button
            variant="danger"
            size="sm"
            onClick={stopGeneration}
            className="shrink-0"
          >
            停止
          </Button>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          aria-label="模型设置"
          title="模型设置"
          className="shrink-0"
        >
          <IconSettings className="h-4 w-4" />
        </Button>
      </header>

      {error ? (
        <div className="mx-3 mt-2.5 flex animate-slide-up items-start gap-2 rounded-xl bg-err/[0.08] px-3 py-2 ring-1 ring-err/25 sm:mx-4">
          <IconAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-err" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-err">生成失败</p>
            <p
              className="mt-0.5 line-clamp-2 break-words text-[11.5px] leading-relaxed text-muted"
              title={error}
            >
              {humanizeError(error)}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-2">
              请检查网络或模型设置后重试。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-md px-1.5 py-0.5 text-[11px] text-accent-soft transition-colors hover:bg-white/10"
            >
              设置
            </button>
            <button
              type="button"
              onClick={dismissError}
              aria-label="关闭错误提示"
              className="flex h-5 w-5 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-white/10 hover:text-fg"
            >
              <IconX className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="scroll-thin h-full overflow-y-auto overscroll-contain px-3 py-3.5 sm:px-4"
        >
          {messages.length === 0 ? (
            <div className="flex min-h-full flex-col justify-center">
              {hasFiles ? (
                <ResumeState
                  name={activeProject?.name}
                  fileCount={fileCount}
                  versionCount={versions?.length ?? 0}
                  onSend={handleSend}
                />
              ) : (
                <WelcomeScreen
                  mode={serverMode}
                  onSend={handleSend}
                  onOpenSettings={onOpenSettings}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4 pb-1">
              {messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  busy={busy}
                  versionLabel={
                    message.versionId
                      ? versionLabels.get(message.versionId)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>

        {showJump ? (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 animate-fade-in items-center gap-1.5 rounded-full bg-surface-2/95 px-3 py-1.5 text-[11.5px] text-muted shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] ring-1 ring-white/15 backdrop-blur transition-colors hover:text-fg hover:ring-accent/40"
          >
            <IconArrowDown className="h-3.5 w-3.5" />
            回到底部
          </button>
        ) : null}
      </div>

      <footer className="shrink-0 px-3 pb-2.5 pt-2 sm:px-4">
        {!busy && hasFiles && messages.length > 0 ? (
          <div className="scroll-thin -mx-1 mb-2 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="hidden shrink-0 text-[10.5px] font-medium text-muted-2 sm:inline">
              继续优化
            </span>
            {REFINE_IDEAS.slice(0, 3).map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => handleSend(idea)}
                className="shrink-0 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-muted ring-1 ring-white/10 transition hover:bg-accent/10 hover:text-accent-soft hover:ring-accent/40"
              >
                {idea}
              </button>
            ))}
          </div>
        ) : null}

        <Composer
          key={projectId}
          busy={busy}
          hasFiles={hasFiles}
          onSend={handleSend}
          onStop={stopGeneration}
        />
      </footer>
    </div>
  );
}
