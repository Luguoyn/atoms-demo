"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AgentEvent,
  AgentPhase,
  ChatMessage,
  ChatRequest,
  ChatTurn,
  ConsoleEntry,
  FileMap,
  Project,
  ProviderSettings,
  ServerConfig,
  Version,
} from "@/types";
import {
  loadProjects,
  loadSettings,
  persistProjects,
  persistSettings,
} from "@/lib/idb";
import { truncate, uid } from "@/lib/utils";

export type ServerMode = "server-key" | "byok" | "mock";

export interface BuilderApi {
  ready: boolean;
  projects: Project[];
  activeProject: Project | null;
  busy: boolean;
  phase: AgentPhase | null;
  phaseLabel: string | null;
  error: string | null;
  serverConfig: ServerConfig | null;
  settings: ProviderSettings;
  consoleEntries: ConsoleEntry[];
  serverMode: ServerMode;
  createProject(name?: string): Promise<Project>;
  selectProject(id: string): void;
  deleteProject(id: string): void;
  renameProject(id: string, name: string): void;
  sendMessage(text: string): Promise<void>;
  stopGeneration(): void;
  restoreVersion(versionId: string): void;
  saveSettings(next: ProviderSettings): Promise<void>;
  dismissError(): void;
  clearConsole(): void;
  pushConsole(entry: ConsoleEntry): void;
  importShare(files: FileMap, name?: string): Promise<Project>;
}

const EMPTY_SETTINGS: ProviderSettings = { baseUrl: "", model: "", apiKey: "" };

const BuilderContext = createContext<BuilderApi | null>(null);

function makeProject(seed?: string, files: FileMap = {}): Project {
  const now = Date.now();
  const project: Project = {
    id: uid("p_"),
    name: seed ? truncate(seed.replace(/\s+/g, " ").trim(), 18) : "未命名应用",
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    messages: [],
    files,
    versions: [],
  };
  return project;
}

export function BuilderProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<AgentPhase | null>(null);
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [settings, setSettings] = useState<ProviderSettings>(EMPTY_SETTINGS);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);

  const projectsRef = useRef<Project[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  activeIdRef.current = activeId;

  /** Update projects, keep refs in sync, and refresh messageCount. */
  const mutate = useCallback((fn: (prev: Project[]) => Project[]) => {
    setProjects((prev) => {
      const next = fn(prev).map((p) => ({
        ...p,
        messageCount: p.messages.length,
      }));
      projectsRef.current = next;
      return next;
    });
  }, []);

  /* ------------------------------- bootstrap ------------------------------ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedProjects, savedSettings] = await Promise.all([
        loadProjects(),
        loadSettings<ProviderSettings>(),
      ]);
      if (cancelled) return;
      if (savedSettings) setSettings({ ...EMPTY_SETTINGS, ...savedSettings });
      if (loadedProjects.length > 0) {
        // Normalize runs that were interrupted by a refresh: no message can
        // still be streaming after a fresh load.
        const normalized = loadedProjects.map((project) => ({
          ...project,
          messages: project.messages.map((message) =>
            message.status === "streaming"
              ? {
                  ...message,
                  status: "error" as const,
                  content:
                    message.content ||
                    "本次生成在页面刷新/关闭时中断，可重新发送需求或继续对话。",
                  steps: (message.steps ?? []).map((step) =>
                    step.status === "running"
                      ? { ...step, status: "done" as const }
                      : step,
                  ),
                }
              : message,
          ),
        }));
        projectsRef.current = normalized;
        setProjects(normalized);
        setActiveId(normalized[normalized.length - 1].id);
      }
      setReady(true);
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        if (res.ok) setServerConfig((await res.json()) as ServerConfig);
      } catch {
        setServerConfig(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------- persistence ---------------------------- */
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void persistProjects(projects);
    }, 250);
    return () => clearTimeout(timer);
  }, [projects, ready]);

  /* -------------------------------- actions ------------------------------- */
  const createProject = useCallback(
    async (name?: string) => {
      const project = makeProject(name);
      mutate((prev) => [...prev, project]);
      setActiveId(project.id);
      activeIdRef.current = project.id;
      setConsoleEntries([]);
      return project;
    },
    [mutate],
  );

  const selectProject = useCallback((id: string) => {
    setActiveId(id);
    activeIdRef.current = id;
    setConsoleEntries([]);
  }, []);

  const deleteProject = useCallback(
    (id: string) => {
      mutate((prev) => prev.filter((p) => p.id !== id));
      if (activeIdRef.current === id) {
        const rest = projectsRef.current.filter((p) => p.id !== id);
        const nextId = rest.length > 0 ? rest[rest.length - 1].id : null;
        setActiveId(nextId);
        activeIdRef.current = nextId;
      }
    },
    [mutate],
  );

  const renameProject = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      mutate((prev) => prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
    },
    [mutate],
  );

  const dismissError = useCallback(() => setError(null), []);
  const clearConsole = useCallback(() => setConsoleEntries([]), []);
  const pushConsole = useCallback((entry: ConsoleEntry) => {
    setConsoleEntries((prev) => [...prev.slice(-199), entry]);
  }, []);

  const saveSettings = useCallback(async (next: ProviderSettings) => {
    const clean: ProviderSettings = {
      baseUrl: next.baseUrl.trim(),
      model: next.model.trim(),
      apiKey: next.apiKey.trim(),
    };
    setSettings(clean);
    await persistSettings(clean);
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const restoreVersion = useCallback(
    (versionId: string) => {
      const projectId = activeIdRef.current;
      if (!projectId) return;
      const project = projectsRef.current.find((p) => p.id === projectId);
      const version = project?.versions.find((v) => v.id === versionId);
      if (!project || !version) return;
      const note: ChatMessage = {
        id: uid("m_"),
        role: "assistant",
        content: `已恢复到 ${version.label}，右侧预览已更新。`,
        createdAt: Date.now(),
        status: "done",
      };
      mutate((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                files: version.files,
                plan: version.plan ?? p.plan,
                updatedAt: Date.now(),
                messages: [...p.messages, note],
              }
            : p,
        ),
      );
    },
    [mutate],
  );

  const importShare = useCallback(
    async (files: FileMap, name?: string) => {
      const project = makeProject(name ?? "从分享链接导入的应用", files);
      if (Object.keys(files).length > 0) {
        const version: Version = {
          id: uid("v_"),
          createdAt: Date.now(),
          label: "v1",
          files,
        };
        project.versions = [version];
        project.messages = [
          {
            id: uid("m_"),
            role: "assistant",
            content:
              "已从分享链接导入这个应用，你可以直接预览，也可以继续告诉我怎么改。",
            createdAt: Date.now(),
            status: "done",
            versionId: version.id,
          },
        ];
      }
      mutate((prev) => [...prev, project]);
      setActiveId(project.id);
      activeIdRef.current = project.id;
      setConsoleEntries([]);
      return project;
    },
    [mutate],
  );

  /* ------------------------------ generation ------------------------------ */
  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busyRef.current) return;

      let project = activeIdRef.current
        ? projectsRef.current.find((p) => p.id === activeIdRef.current)
        : undefined;

      if (!project) {
        project = makeProject(content);
        mutate((prev) => [...prev, project as Project]);
        setActiveId(project.id);
        activeIdRef.current = project.id;
        setConsoleEntries([]);
      }

      const targetId = project.id;
      const baseFiles: FileMap = { ...(project.files ?? {}) };
      const history: ChatTurn[] = project.messages
        .filter((m) => m.status === "done" && m.content.trim().length > 0)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const userMessage: ChatMessage = {
        id: uid("m_"),
        role: "user",
        content,
        createdAt: Date.now(),
        status: "done",
      };
      const assistantId = uid("m_");
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        status: "streaming",
        steps: [],
      };

      mutate((prev) =>
        prev.map((p) =>
          p.id === targetId
            ? {
                ...p,
                messages: [...p.messages, userMessage, assistantMessage],
                updatedAt: Date.now(),
              }
            : p,
        ),
      );

      busyRef.current = true;
      setBusy(true);
      setError(null);
      setPhase("planning");
      setPhaseLabel("理解需求中");

      const controller = new AbortController();
      abortRef.current = controller;

      const patchAssistant = (
        patch:
          | Partial<ChatMessage>
          | ((message: ChatMessage) => Partial<ChatMessage>),
      ) => {
        mutate((prev) =>
          prev.map((p) =>
            p.id !== targetId
              ? p
              : {
                  ...p,
                  updatedAt: Date.now(),
                  messages: p.messages.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          ...(typeof patch === "function" ? patch(m) : patch),
                        }
                      : m,
                  ),
                },
          ),
        );
      };

      let finished = false;
      let sawError = false;
      /** Latest known app files during this run (used for partial-success recovery). */
      let latestFiles: FileMap = { ...baseFiles };
      let sawFiles = Object.keys(baseFiles).length > 0;

      /** Turn whatever was produced so far into a normal version instead of losing it. */
      const finalizePartial = (note: string) => {
        const versionId = uid("v_");
        mutate((prev) =>
          prev.map((p) => {
            if (p.id !== targetId) return p;
            const version: Version = {
              id: versionId,
              createdAt: Date.now(),
              label: `v${p.versions.length + 1}`,
              files: latestFiles,
              plan: p.plan,
            };
            return {
              ...p,
              files: latestFiles,
              versions: [...p.versions, version],
              updatedAt: Date.now(),
              messages: p.messages.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      status: "done" as const,
                      content:
                        (m.content ? `${m.content}\n\n` : "") + note,
                      versionId,
                      steps: (m.steps ?? []).map((s) =>
                        s.status === "running"
                          ? { ...s, status: "done" as const }
                          : s,
                      ),
                    }
                  : m,
              ),
            };
          }),
        );
        setError(null);
        finished = true;
      };

      const applyEvent = (event: AgentEvent) => {
        switch (event.type) {
          case "phase":
            setPhase(event.phase);
            setPhaseLabel(event.label);
            break;
          case "status":
            break;
          case "plan":
            patchAssistant({ plan: event.plan });
            break;
          case "tool_start":
            patchAssistant((m) => ({
              steps: [
                ...(m.steps ?? []),
                {
                  id: event.id,
                  tool: event.tool,
                  label: event.label,
                  status: "running" as const,
                },
              ],
            }));
            break;
          case "tool_result":
            patchAssistant((m) => ({
              steps: (m.steps ?? []).map((step) =>
                step.id === event.id
                  ? {
                      ...step,
                      status: event.ok ? ("done" as const) : ("error" as const),
                      summary: event.summary,
                    }
                  : step,
              ),
            }));
            break;
          case "file_delta":
            break;
          case "file_done":
            latestFiles = { ...latestFiles, [event.path]: event.content };
            sawFiles = true;
            mutate((prev) =>
              prev.map((p) =>
                p.id === targetId
                  ? { ...p, files: { ...p.files, [event.path]: event.content } }
                  : p,
              ),
            );
            break;
          case "assistant_delta":
            patchAssistant((m) => ({ content: (m.content ?? "") + event.delta }));
            break;
          case "validation":
            break;
          case "done": {
            latestFiles = event.files;
            sawFiles = Object.keys(event.files).length > 0;
            const versionId = uid("v_");
            mutate((prev) =>
              prev.map((p) => {
                if (p.id !== targetId) return p;
                const version: Version = {
                  id: versionId,
                  createdAt: Date.now(),
                  label: `v${p.versions.length + 1}`,
                  files: event.files,
                  plan: event.plan,
                };
                const isFirstGeneration = p.versions.length === 0;
                const plan = event.plan ?? p.plan;
                const nextName =
                  isFirstGeneration && plan?.name ? plan.name : p.name;
                return {
                  ...p,
                  name: nextName,
                  files: event.files,
                  plan,
                  versions: [...p.versions, version],
                  updatedAt: Date.now(),
                  messages: p.messages.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          status: "done" as const,
                          content:
                            event.summary ||
                            m.content ||
                            "应用已生成，右侧可以预览。",
                          versionId,
                          plan,
                          steps: (m.steps ?? []).map((s) => ({
                            ...s,
                            status:
                              s.status === "running"
                                ? ("done" as const)
                                : s.status,
                          })),
                        }
                      : m,
                  ),
                };
              }),
            );
            finished = true;
            break;
          }
          case "error":
            if (sawFiles) {
              // Keep the partial result: degrade to a completed version with a note.
              finalizePartial(
                `生成提前结束：${event.message}\n\n> 已保留当前已生成的 ${Object.keys(latestFiles).length} 个文件，右侧可直接预览；可以继续对话补全。`,
              );
            } else {
              sawError = true;
              patchAssistant({ status: "error", content: event.message });
              setError(event.message);
            }
            finished = true;
            break;
          default:
            break;
        }
      };

      try {
        const body: ChatRequest = {
          projectId: targetId,
          message: content,
          files: baseFiles,
          history,
          mode: Object.keys(baseFiles).length > 0 ? "refine" : "generate",
          provider: settings.apiKey
            ? {
                baseUrl: settings.baseUrl || undefined,
                apiKey: settings.apiKey,
                model: settings.model || undefined,
              }
            : undefined,
        };

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => "");
          throw new Error(
            `服务端返回 ${response.status}${detail ? `：${detail.slice(0, 240)}` : ""}`,
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!finished) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const rawEvent = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const dataLine = rawEvent
              .split("\n")
              .find((line) => line.startsWith("data:"));
            if (dataLine) {
              try {
                applyEvent(JSON.parse(dataLine.slice(5).trim()) as AgentEvent);
              } catch {
                /* ignore malformed keep-alive frames */
              }
            }
            if (finished) break;
            boundary = buffer.indexOf("\n\n");
          }
        }

        if (!finished) {
          if (sawFiles) {
            finalizePartial(
              "生成连接中断，已保留当前已生成的内容，可以在右侧预览或继续对话补全。",
            );
          } else if (sawError) {
            patchAssistant({ status: "error" });
          } else {
            patchAssistant((m) => ({
              status: "error" as const,
              content:
                m.content ||
                "连接中断了，本次结果可能不完整——请重试或换一句更具体的描述。",
            }));
            setError("生成连接中断，请重试");
          }
        }
      } catch (err) {
        const aborted =
          err instanceof DOMException && err.name === "AbortError";
        if (aborted) {
          if (sawFiles) {
            finalizePartial("已停止生成，已保留当前生成结果。");
          } else {
            patchAssistant({ status: "done", content: "已停止生成。" });
          }
        } else {
          const message =
            err instanceof Error ? err.message : "生成失败，请稍后重试";
          if (sawFiles) {
            finalizePartial(
              `生成中断：${message}\n\n> 已保留当前已生成的内容，可直接预览或重试。`,
            );
          } else {
            patchAssistant({ status: "error", content: message });
            setError(message);
          }
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
        setPhase(null);
        setPhaseLabel(null);
        abortRef.current = null;
      }
    },
    [mutate, settings],
  );

  /* -------------------------------- expose -------------------------------- */
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects],
  );
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );
  const serverMode: ServerMode = settings.apiKey
    ? "byok"
    : serverConfig
      ? serverConfig.mockMode
        ? "mock"
        : "server-key"
      : "mock";

  const api = useMemo<BuilderApi>(
    () => ({
      ready,
      projects: sortedProjects,
      activeProject,
      busy,
      phase,
      phaseLabel,
      error,
      serverConfig,
      settings,
      consoleEntries,
      serverMode,
      createProject,
      selectProject,
      deleteProject,
      renameProject,
      sendMessage,
      stopGeneration,
      restoreVersion,
      saveSettings,
      dismissError,
      clearConsole,
      pushConsole,
      importShare,
    }),
    [
      ready,
      sortedProjects,
      activeProject,
      busy,
      phase,
      phaseLabel,
      error,
      serverConfig,
      settings,
      consoleEntries,
      serverMode,
      createProject,
      selectProject,
      deleteProject,
      renameProject,
      sendMessage,
      stopGeneration,
      restoreVersion,
      saveSettings,
      dismissError,
      clearConsole,
      pushConsole,
      importShare,
    ],
  );

  return (
    <BuilderContext.Provider value={api}>{children}</BuilderContext.Provider>
  );
}

export function useBuilder(): BuilderApi {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder must be used within <BuilderProvider>");
  return ctx;
}
