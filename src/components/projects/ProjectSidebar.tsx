"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui";
import type { ServerMode } from "@/lib/store";
import { useBuilder } from "@/lib/store";
import { cn, downloadBlob, formatRelative } from "@/lib/utils";
import {
  IconArrowUpDown,
  IconCopy,
  IconDownload,
  IconFolder,
  IconMore,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUpload,
  IconX,
} from "@/components/chat/icons";

export interface ProjectSidebarProps {
  onNavigate?: () => void;
}

type SortMode = "updated" | "created";

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

function slugify(name: string): string {
  const slug = name
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "atoms-project";
}

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

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors",
        danger
          ? "text-muted-2 hover:bg-err/10 hover:text-err"
          : "text-muted hover:bg-white/[0.06] hover:text-fg",
      )}
    >
      <span className="shrink-0">{icon}</span>
      {label}
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
    duplicateProject,
    exportProjectJSON,
    importProjectJSON,
    deleteAllProjects,
  } = useBuilder();
  const { toast } = useToast();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [importing, setImporting] = useState(false);

  const renameRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mode = MODE_META[serverMode];

  const visibleProjects = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const filtered = keyword
      ? projects.filter(
          (project) =>
            project.name.toLowerCase().includes(keyword) ||
            project.messages
              .slice(-5)
              .some((message) => message.content.toLowerCase().includes(keyword)),
        )
      : projects;
    return [...filtered].sort((a, b) =>
      sortMode === "updated"
        ? b.updatedAt - a.updatedAt
        : b.createdAt - a.createdAt,
    );
  }, [projects, query, sortMode]);

  useEffect(() => {
    if (!renamingId) return;
    const input = renameRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [renamingId]);

  // Close the row menu on outside click / Escape.
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("click", close);
    }, 0);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuId]);

  const handleCreate = () => {
    void createProject();
    onNavigate?.();
  };

  const handleSelect = (id: string) => {
    setMenuId(null);
    if (id !== activeProject?.id) selectProject(id);
    onNavigate?.();
  };

  const startRename = (id: string, name: string) => {
    setConfirmingId(null);
    setMenuId(null);
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
    setMenuId(null);
    onNavigate?.();
    toast({ title: "已删除应用", tone: "success" });
  };

  const handleDuplicate = async (id: string) => {
    setMenuId(null);
    const copy = await duplicateProject(id);
    if (copy) {
      toast({
        title: "已复制应用",
        description: `「${copy.name}」`,
        tone: "success",
      });
    } else {
      toast({ title: "复制失败", description: "项目不存在或存储不可用", tone: "error" });
    }
  };

  const handleExport = (id: string, name: string) => {
    setMenuId(null);
    const json = exportProjectJSON(id);
    if (!json) {
      toast({ title: "导出失败", description: "项目不存在", tone: "error" });
      return;
    }
    downloadBlob(
      new Blob([json], { type: "application/json;charset=utf-8" }),
      `${slugify(name)}.json`,
    );
    toast({
      title: "已导出项目 JSON",
      description: `${slugify(name)}.json`,
      tone: "success",
    });
  };

  const handleImportClick = () => {
    if (importing) return;
    fileInputRef.current?.click();
  };

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const project = await importProjectJSON(text);
      if (project) {
        setQuery("");
        toast({
          title: "已导入项目",
          description: `「${project.name}」`,
          tone: "success",
        });
        onNavigate?.();
      } else {
        toast({
          title: "导入失败",
          description: "不是有效的 Atoms 项目 JSON 文件",
          tone: "error",
        });
      }
    } catch {
      toast({ title: "导入失败", description: "文件读取失败", tone: "error" });
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteAll = () => {
    deleteAllProjects();
    setConfirmClearAll(false);
    setMenuId(null);
    toast({ title: "已清空所有项目", tone: "success" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3.5">
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

      <div className="mt-2 flex items-center gap-1.5 px-3.5">
        <div className="relative min-w-0 flex-1">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索项目或消息…"
            aria-label="搜索项目"
            className="input h-8 pl-8 pr-7 text-[12px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="清除搜索"
              className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-white/10 hover:text-fg"
            >
              <IconX className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleImportClick}
          disabled={importing}
          aria-label="导入项目 JSON"
          title="导入项目 JSON"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-2 ring-1 ring-white/10 transition-colors hover:bg-white/[0.06] hover:text-fg disabled:opacity-50"
        >
          {importing ? (
            <span
              className="spinner"
              style={{ width: 12, height: 12, borderWidth: 1.5 }}
              aria-hidden
            />
          ) : (
            <IconUpload className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() =>
            setSortMode((current) => (current === "updated" ? "created" : "updated"))
          }
          aria-label="切换排序方式"
          title={
            sortMode === "updated"
              ? "排序：最近更新（点击切换为创建时间）"
              : "排序：创建时间（点击切换为最近更新）"
          }
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-2 ring-1 ring-white/10 transition-colors hover:bg-white/[0.06] hover:text-fg"
        >
          <IconArrowUpDown className="h-3.5 w-3.5" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            void handleImportFile(event);
          }}
        />
      </div>

      <div className="divider mx-3 my-2.5" />

      <nav
        aria-label="项目列表"
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
        {projects.length === 0 ? (
          <EmptyProjects />
        ) : visibleProjects.length === 0 ? (
          <div className="mx-1 mt-3 rounded-xl bg-white/[0.02] px-4 py-6 text-center ring-1 ring-white/[0.06]">
            <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.04] text-muted-2">
              <IconSearch className="h-4 w-4" />
            </span>
            <p className="mt-2.5 text-[12px] font-medium text-fg">没有匹配的项目</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-2">
              试试其它关键词，或清除搜索条件
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-2 text-[11px] text-accent-soft transition-colors hover:text-accent"
            >
              清除搜索
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {visibleProjects.map((project) => {
              const active = project.id === activeProject?.id;
              const renaming = renamingId === project.id;
              const confirming = confirmingId === project.id;
              const menuOpen = menuId === project.id;

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
                    <>
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
                            <span
                              aria-hidden
                              className="h-2 w-px shrink-0 bg-white/10"
                            />
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

                        <button
                          type="button"
                          onClick={() => setMenuId(menuOpen ? null : project.id)}
                          aria-label="更多操作"
                          aria-expanded={menuOpen}
                          title="更多操作"
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-2 transition-all hover:bg-white/10 hover:text-fg",
                            menuOpen
                              ? "bg-white/10 text-fg"
                              : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
                          )}
                        >
                          <IconMore className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {menuOpen ? (
                        <div className="border-t border-white/5 px-1.5 py-1">
                          <MenuItem
                            icon={<IconCopy className="h-3.5 w-3.5" />}
                            label="复制项目"
                            onClick={() => {
                              void handleDuplicate(project.id);
                            }}
                          />
                          <MenuItem
                            icon={<IconDownload className="h-3.5 w-3.5" />}
                            label="导出 JSON"
                            onClick={() => handleExport(project.id, project.name)}
                          />
                          <MenuItem
                            icon={<IconPencil className="h-3.5 w-3.5" />}
                            label="重命名"
                            onClick={() => startRename(project.id, project.name)}
                          />
                          <MenuItem
                            icon={<IconTrash className="h-3.5 w-3.5" />}
                            label="删除项目"
                            danger
                            onClick={() => {
                              setMenuId(null);
                              setConfirmingId(project.id);
                            }}
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-white/5 px-3.5 py-2.5">
        {confirmClearAll ? (
          <div>
            <p className="text-[11.5px] font-medium text-fg">
              删除全部 {projects.length} 个项目？
            </p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-2">
              所有对话与版本都会删除，无法恢复。
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleDeleteAll}
                className="btn btn-sm btn-danger"
              >
                全部删除
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="btn btn-sm btn-ghost"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-1.5" title={mode.hint}>
              <span
                aria-hidden
                className={cn("h-1.5 w-1.5 shrink-0 rounded-full", mode.dot)}
              />
              <span className="truncate text-[11px] text-muted">{mode.label}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-2">
                v0.2
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="truncate text-[10px] text-muted-2">
                项目与版本保存在本机浏览器
              </p>
              {projects.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="shrink-0 text-[10px] text-muted-2 transition-colors hover:text-err"
                >
                  清空全部
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
