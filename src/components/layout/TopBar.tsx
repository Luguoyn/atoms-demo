"use client";

import { Button, Logo } from "@/components/ui";
import { useBuilder } from "@/lib/store";
import { cn } from "@/lib/utils";

export interface TopBarProps {
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
}

function IconMenu() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M19.4 13.5a7.9 7.9 0 0 0 0-3l1.7-1.3-1.9-3.3-2 .8a8 8 0 0 0-2.6-1.5L14.3 3h-4.6l-.3 2.2A8 8 0 0 0 6.8 6.7l-2-.8-1.9 3.3 1.7 1.3a7.9 7.9 0 0 0 0 3l-1.7 1.3 1.9 3.3 2-.8a8 8 0 0 0 2.6 1.5l.3 2.2h4.6l.3-2.2a8 8 0 0 0 2.6-1.5l2 .8 1.9-3.3-1.7-1.3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

const MODE_LABEL: Record<string, { label: string; className: string }> = {
  "server-key": { label: "服务端模型", className: "badge-ok" },
  byok: { label: "自带密钥", className: "badge-accent" },
  mock: { label: "演示模式", className: "badge-warn" },
};

export function TopBar({ onOpenSettings, onToggleSidebar }: TopBarProps) {
  const { activeProject, busy, phaseLabel, serverMode, createProject } =
    useBuilder();
  const mode = MODE_LABEL[serverMode] ?? MODE_LABEL.mock;

  return (
    <header className="relative z-20 flex h-[58px] shrink-0 items-center gap-3 px-3 sm:px-4">
      <button
        type="button"
        className="btn btn-icon lg:hidden"
        onClick={onToggleSidebar}
        aria-label="打开项目列表"
      >
        <IconMenu />
      </button>

      <div className="flex items-center gap-2.5">
        <Logo />
        <div className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight text-fg">
            Atoms<span className="gradient-text"> Demo</span>
          </span>
          <span className="mt-1 hidden text-[10.5px] text-muted-2 sm:block">
            AI 应用生成器 · Build with agents
          </span>
        </div>
      </div>

      <div className="mx-2 hidden h-6 w-px bg-white/10 md:block" />

      <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
        {activeProject ? (
          <>
            <span className="max-w-[260px] truncate text-[13px] text-muted">
              {activeProject.name}
            </span>
            {busy && phaseLabel ? (
              <span className="badge badge-accent shrink-0">
                <span className="typing-dot scale-75" />
                {phaseLabel}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-[13px] text-muted-2">
            描述你的想法，让 Agent 把它变成可运行的应用
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <span
          className={cn("badge hidden sm:inline-flex", mode.className)}
          title={
            serverMode === "mock"
              ? "未配置模型密钥：流程照常可用，生成结果为演示内容"
              : serverMode === "byok"
                ? "使用你在设置里填写的 API Key"
                : "使用服务端配置的模型"
          }
        >
          {mode.label}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          aria-label="模型设置"
        >
          <IconSettings />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void createProject();
          }}
          className="gap-1.5"
        >
          <IconPlus />
          <span className="hidden sm:inline">新建应用</span>
        </Button>
      </div>
    </header>
  );
}
