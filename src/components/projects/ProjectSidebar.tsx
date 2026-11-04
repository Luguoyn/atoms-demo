"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ServerMode } from "@/lib/store";
import { useBuilder } from "@/lib/store";
import { cn, formatRelative } from "@/lib/utils";
import { IconFolder, IconPencil, IconPlus, IconTrash } from "@/components/chat/icons";

export interface ProjectSidebarProps {
  onNavigate?: () => void;
}

const MODE_META: Record<ServerMode, { label: string; hint: string; dot: string }> = {
  "server-key": {
    label: "服务端模型",
    hint: "使用服务端配置的模型密钥",
    dot: "bg-ok",
  },
  byok: {
    label: "自带密钥",
    hint: "使用你在设置中填写的 API Key",
    dot: "bg-accent",
  },
  mock: {
    label: "演示模式",
    hint: "未配置密钥，将使用内置示例 Agent 生成",
    dot: "bg-warn",
  },
};

function RowAction({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md text-muted-2 transition-colors",
        danger
          ? "hover:bg-err/15 hover:text-err"
          : "hover:bg-white/10 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function EmptyProjects() {
  return (
    <div className="mx-1 mt-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent-soft ring-1 ring-accent/20">
        <IconFolder className="h-4 w-4" />
      </span>
      <p className="mt-3 text-[12.5px] font-medium text-fg">还没有应用</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-2">
        点击上方「新建应用」，或在对话框里描述你的想法，Agent 会从零开始搭建。
      </p>
    </div>
  );
}

export function ProjectSidebar({ onNavigate }: ProjectSidebarProps) {
  const {
    projects,
    activeProject,
    serverMode,
    createProject,
    selectProject,
    deleteProject,
    renameProject,
  } = useBuilder();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);

  const mode = MODE_META[serverMode];

  useEffect(() => {
    if (!renamingId) return;
    const input = renameRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [renamingId]);

  const handleCreate = () => {
    void createProject();
    onNavigate?.();
  };

  const handleSelect = (id: string) => {
    if (id !== activeProject?.id) selectProject(id);
    onNavigate?.();
  };

  const startRename = (id: string, name: string) => {
    setConfirmingId(null);
    setDraftName(name);
    setRenamingId(id);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const nextName = draftName.trim();
    if (nextName) renameProject(renamingId, nextName);
    setRenamingId(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setDraftName("");
  };

  const handleDelete = (id: string) => {
    deleteProject(id);
    setConfirmingId(null);
    setRenamingId(null);
    onNavigate?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3.5 pb-2.5 pt-3.5">
        <div className="flex items-baseline gap-1.5">
          <h2 className="text-[13px] font-semibold tracking-tight text-fg">
            我的应用
          </h2>
          <span className="text-[10.5px] tabular-nums text-muted-2">
            {projects.length}
          </span>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2/70">
          Atoms
        </span>
      </div>

      <div className="px-3.5">
        <button type="button" onClick={handleCreate} className="btn btn-primary w-full">
          <IconPlus className="h-3.5 w-3.5" />
          新建应用
        </button>
      </div>

      <div className="divider mx-3 my-3" />

      <nav
        aria-label="项目列表"
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
        {projects.length === 0 ? (
          <EmptyProjects />
        ) : (
          <div className="space-y-1">
            {projects.map((project) => {
              const active = project.id === activeProject?.id;
              const renaming = renamingId === project.id;
              const confirming = confirmingId === project.id;

              return (
                <div
                  key={project.id}
                  className={cn(
                    "group relative rounded-xl transition-colors duration-150",
                    active
                      ? "bg-accent/[0.10] ring-1 ring-accent/30"
                      : "ring-1 ring-transparent hover:bg-white/[0.04] hover:ring-white/10",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-accent to-accent-2"
                    />
                  ) : null}

                  {renaming ? (
                    <div className="px-2.5 py-2">
                      <input
                        ref={renameRef}
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitRename();
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRename();
                          }
                        }}
                        onBlur={commitRename}
                        maxLength={40}
                        aria-label="应用名称"
                        placeholder="应用名称"
                        className="w-full rounded-lg bg-black/40 px-2 py-1 text-[13px] text-fg outline-none ring-1 ring-accent/40 placeholder:text-muted-2 focus:ring-accent/70"
                      />
                      <p className="mt-1 text-[10px] text-muted-2">
                        Enter 保存 · Esc 取消
                      </p>
                    </div>
                  ) : confirming ? (
                    <div className="px-2.5 py-2">
                      <p
                        className="truncate text-[12.5px] font-medium text-fg"
                        title={project.name}
                      >
                        删除「{project.name}」？
                      </p>
                      <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-2">
                        对话与版本将一并删除，无法恢复。
                      </p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDelete(project.id)}
                          className="btn btn-sm btn-danger"
                        >
                          删除
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="btn btn-sm btn-ghost"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 pr-1">
                      <button
                        type="button"
                        onClick={() => handleSelect(project.id)}
                        onDoubleClick={() => startRename(project.id, project.name)}
                        title={`${project.name}（双击重命名）`}
                        aria-current={active ? "true" : undefined}
                        className="min-w-0 flex-1 px-2.5 py-2 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {active ? (
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-2 shadow-[0_0_6px_rgba(34,211,238,0.8)]"
                            />
                          ) : null}
                          <span
                            className={cn(
                              "truncate text-[13px] font-medium",
                              active ? "text-fg" : "text-fg/90",
                            )}
                          >
                            {project.name}
                          </span>
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-2">
                          <span className="shrink-0">
                            {formatRelative(project.updatedAt)}
                          </span>
                          <span aria-hidden className="h-2 w-px shrink-0 bg-white/10" />
                          <span className="shrink-0 tabular-nums">
                            {project.messages.length} 条对话
                          </span>
                          {project.versions.length > 0 ? (
                            <>
                              <span
                                aria-hidden
                                className="h-2 w-px shrink-0 bg-white/10"
                              />
                              <span className="shrink-0 tabular-nums">
                                {project.versions.length} 版
                              </span>
                            </>
                          ) : null}
                        </span>
                      </button>

                      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                        <RowAction
                          label="重命名"
                          onClick={() => startRename(project.id, project.name)}
                        >
                          <IconPencil className="h-3.5 w-3.5" />
                        </RowAction>
                        <RowAction
                          label="删除"
                          danger
                          onClick={() => {
                            setConfirmingId(project.id);
                            setRenamingId(null);
                          }}
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </RowAction>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-white/5 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5" title={mode.hint}>
          <span
            aria-hidden
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", mode.dot)}
          />
          <span className="truncate text-[11px] text-muted">{mode.label}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-2">
            v0.1
          </span>
        </div>
        <p className="mt-1 truncate text-[10px] text-muted-2">
          项目与版本保存在本机浏览器
        </p>
      </div>
    </div>
  );
}
