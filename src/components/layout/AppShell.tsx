"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { ProjectSidebar } from "@/components/projects/ProjectSidebar";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useBuilder } from "@/lib/store";
import { cn } from "@/lib/utils";

type MobileTab = "chat" | "preview";

export function AppShell() {
  const { ready } = useBuilder();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  useEffect(() => {
    if (mobileTab === "preview") setSidebarOpen(false);
  }, [mobileTab]);

  return (
    <div className="relative z-10 flex h-dvh w-full flex-col overflow-hidden">
      <TopBar
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-2 sm:px-4">
        {/* Projects rail (desktop) */}
        <aside className="hidden w-[248px] shrink-0 lg:block">
          <div className="panel flex h-full flex-col overflow-hidden">
            <ProjectSidebar />
          </div>
        </aside>

        {/* Mobile drawer */}
        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="absolute bottom-2 left-2 top-[62px] w-[280px] max-w-[86vw]">
              <div className="panel flex h-full flex-col overflow-hidden shadow-2xl">
                <ProjectSidebar onNavigate={() => setSidebarOpen(false)} />
              </div>
            </div>
          </div>
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-1 gap-3">
          <section
            className={cn(
              "panel flex min-h-0 min-w-0 flex-col overflow-hidden",
              "w-full lg:w-[442px] xl:w-[486px] lg:shrink-0",
              mobileTab === "preview" && "hidden lg:flex",
            )}
          >
            <ChatPanel onOpenSettings={() => setSettingsOpen(true)} />
          </section>

          <section
            className={cn(
              "panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              mobileTab === "chat" && "hidden lg:flex",
            )}
          >
            <PreviewPanel />
          </section>
        </main>
      </div>

      {/* Mobile tab bar */}
      <nav className="relative z-20 flex shrink-0 items-center gap-1 border-t border-white/5 bg-black/30 px-3 py-2 backdrop-blur lg:hidden">
        {(
          [
            { key: "chat", label: "对话" },
            { key: "preview", label: "预览" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMobileTab(tab.key)}
            className={cn(
              "flex-1 rounded-xl py-2 text-[13px] font-medium transition-colors",
              mobileTab === tab.key
                ? "bg-white/10 text-fg"
                : "text-muted hover:bg-white/5",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {!ready ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <span className="spinner h-6 w-6 border-[3px]" />
            <span className="text-[12.5px] text-muted">正在加载工作区…</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
