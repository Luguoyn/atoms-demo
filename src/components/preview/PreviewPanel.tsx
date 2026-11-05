"use client";

/**
 * PreviewPanel — the right-hand "running app" surface (v0.2):
 * - toolbar: app name, device switch, refresh / new window / export / fullscreen /
 *   share / version history;
 * - live sandboxed iframe (bundled `srcDoc`) with device chrome + busy overlay;
 * - token usage / prompt-cache / demo-quota status bar;
 * - bottom tabs: 预览 / 控制台 / 代码 / 版本;
 * - fullscreen overlay with device + refresh controls.
 *
 * All data comes from `useBuilder()`; the component takes no props.
 * OWNER: ui-preview.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FileMap, Version } from "@/types";
import { Badge, Button, Modal, useToast } from "@/components/ui";
import { useBuilder } from "@/lib/store";
import {
  buildPreviewDocument,
  buildStandaloneDocument,
} from "@/lib/preview/bundler";
import { pickLatestUsage } from "@/lib/preview/usage";
import { neutralizeContainingBlocks } from "@/lib/preview/fullscreen";
import {
  clearShareHash,
  createShareUrl,
  readShareFromHash,
} from "@/lib/share/shareLink";
import { downloadSingleHtml, downloadZip } from "@/lib/export/exportApp";
import { byteSize, cn, copyText, formatBytes, uid } from "@/lib/utils";
import { CodeTab } from "./CodeTab";
import { ConsoleTab } from "./ConsoleTab";
import { DeviceSwitch } from "./DeviceSwitch";
import { FullscreenFooter, FullscreenHeader } from "./FullscreenChrome";
import {
  IconAlert,
  IconArchive,
  IconDownload,
  IconExternal,
  IconEye,
  IconFileCode,
  IconHistory,
  IconMaximize,
  IconRefresh,
  IconShare,
  IconTerminal,
} from "./Icons";
import { PreviewStage, type PreviewDevice } from "./PreviewStage";
import { UsageBar } from "./UsageBar";
import { VersionsTab } from "./VersionsTab";

const EMPTY_FILES: FileMap = {};
const EMPTY_VERSIONS: Version[] = [];
const DEVICE_STORAGE_KEY = "atoms-demo:preview-device:v1";

type PreviewTab = "preview" | "console" | "code" | "versions";

export function PreviewPanel() {
  const {
    ready,
    activeProject,
    busy,
    phaseLabel,
    error,
    consoleEntries,
    serverMode,
    lastUsage,
    serverStatus,
    pushConsole,
    clearConsole,
    restoreVersion,
    importShare,
  } = useBuilder();
  const { toast } = useToast();

  const [tab, setTab] = useState<PreviewTab>("preview");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFallback, setShareFallback] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const closeFullscreenRef = useRef<HTMLButtonElement | null>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasFullscreenRef = useRef(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const shareHandledRef = useRef(false);
  const prevVersionCountRef = useRef<number | null>(null);
  const rateRef = useRef({
    windowStart: 0,
    count: 0,
    lastText: "",
    lastAt: 0,
    suppressed: false,
  });

  /* -------------------------------- derived ------------------------------- */

  const files = activeProject?.files;
  const filesOrEmpty = files ?? EMPTY_FILES;
  const hasFiles = Object.keys(filesOrEmpty).length > 0;
  const bundle = useMemo(
    () => buildPreviewDocument(filesOrEmpty),
    [filesOrEmpty],
  );
  const versionCount = activeProject?.versions.length ?? 0;
  const hasProject = activeProject !== null;
  const errorCount = useMemo(
    () => consoleEntries.reduce((n, e) => (e.level === "error" ? n + 1 : n), 0),
    [consoleEntries],
  );
  const projectName = hasProject
    ? activeProject.plan?.name?.trim() ||
      activeProject.name?.trim() ||
      "未命名应用"
    : "预览";
  const fileCount = Object.keys(filesOrEmpty).length;
  const metaText = hasFiles
    ? `${fileCount} 个文件 · ${formatBytes(bundle.bytes)}${
        versionCount > 0 ? ` · ${versionCount} 个版本` : ""
      }`
    : hasProject
      ? busy
        ? (phaseLabel ?? "Agent 正在编写代码")
        : "等待生成内容"
      : "生成后在此实时运行";
  const address = `atoms://preview/${bundle.entry ?? "index.html"}`;
  // Only surface bundler warnings for a settled app that has files: while
  // generating, the progress state is the truth; with no files at all there is
  // nothing actionable to warn about (and "缺少 index.html" would look like an error).
  const showWarnings = !busy && fileCount > 0 && bundle.warnings.length > 0;

  const usage = useMemo(
    () => pickLatestUsage(activeProject?.messages) ?? lastUsage ?? null,
    [activeProject?.messages, lastUsage],
  );
  const quota =
    serverMode === "server-key" ? (serverStatus?.quota ?? null) : null;

  /* -------------------------------- effects ------------------------------- */

  // Restore the last used device (client-only to avoid a hydration mismatch).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DEVICE_STORAGE_KEY);
      if (stored === "desktop" || stored === "tablet" || stored === "mobile") {
        setDevice(stored);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Fullscreen reuses the SAME preview surface: only its positioning changes, so
  // the iframe is never re-created (no blank first paint, no state loss). While
  // fixed-positioned we neutralise ancestor containing blocks (the panel glass
  // uses backdrop-filter) and restore them on exit.
  useEffect(() => {
    if (!fullscreen) return;
    wasFullscreenRef.current = true;
    const restore = neutralizeContainingBlocks(surfaceRef.current);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    closeFullscreenRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      restore();
    };
  }, [fullscreen]);

  // Return keyboard focus to the trigger after leaving fullscreen.
  useEffect(() => {
    if (fullscreen) return;
    if (!wasFullscreenRef.current) return;
    wasFullscreenRef.current = false;
    fullscreenButtonRef.current?.focus();
  }, [fullscreen]);

  // Pick up `#share=...` links once the store has hydrated from IndexedDB.
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void (async () => {
      if (shareHandledRef.current) return;
      const shared = await readShareFromHash();
      if (!shared || !active || shareHandledRef.current) return;
      shareHandledRef.current = true;
      try {
        await importShare(shared.files, shared.name ?? "分享的应用");
        clearShareHash();
        setTab("preview");
        toast({ title: "已从分享链接导入应用", tone: "success" });
      } catch {
        if (active) toast({ title: "分享链接解析失败", description: "内容可能不完整", tone: "error" });
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, importShare, toast]);

  // Console bridge: forward iframe messages, dedupe + rate limit so a chatty or
  // broken app cannot flood the panel.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const frame = iframeRef.current;
      if (frame && event.source && event.source !== frame.contentWindow) return;
      const data = event.data as unknown;
      if (!data || typeof data !== "object") return;
      const record = data as Record<string, unknown>;
      if (record.source !== "atoms-preview") return;

      const kind = record.kind === "error" ? "error" : "console";
      const rawLevel = typeof record.level === "string" ? record.level : "";
      const level: "log" | "info" | "warn" | "error" =
        kind === "error" || rawLevel === "error"
          ? "error"
          : rawLevel === "warn"
            ? "warn"
            : rawLevel === "info"
              ? "info"
              : "log";

      let text = typeof record.text === "string" ? record.text : "";
      text = text.replace(/\s+$/, "").slice(0, 2400);
      if (!text) return;

      const now = Date.now();
      const rate = rateRef.current;
      if (text === rate.lastText && now - rate.lastAt < 1200) {
        rate.lastAt = now;
        return;
      }
      if (now - rate.windowStart > 1000) {
        rate.windowStart = now;
        rate.count = 0;
        rate.suppressed = false;
      }
      rate.count += 1;
      if (rate.count > 50) {
        if (!rate.suppressed) {
          rate.suppressed = true;
          pushConsole({
            id: uid("c_"),
            level: "warn",
            text: "控制台输出过于频繁，已省略后续消息",
            at: now,
          });
        }
        return;
      }
      rate.lastText = text;
      rate.lastAt = now;
      pushConsole({
        id: uid("c_"),
        level,
        text,
        at: now,
      });
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [pushConsole]);

  // A new generated version means a fresh run: drop stale console output.
  useEffect(() => {
    const previous = prevVersionCountRef.current;
    prevVersionCountRef.current = versionCount;
    if (previous !== null && versionCount > previous) clearConsole();
  }, [versionCount, clearConsole]);

  // Close the export menu on outside click.
  useEffect(() => {
    if (!exportOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const menu = exportMenuRef.current;
      if (menu && event.target instanceof Node && !menu.contains(event.target)) {
        setExportOpen(false);
      }
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [exportOpen]);

  /* -------------------------------- actions ------------------------------- */

  const selectDevice = useCallback((next: PreviewDevice) => {
    setDevice(next);
    try {
      window.localStorage.setItem(DEVICE_STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (!hasFiles) return;
    setReloadKey((key) => key + 1);
    pushConsole({
      id: uid("c_"),
      level: "info",
      text: "已刷新预览",
      at: Date.now(),
    });
  }, [hasFiles, pushConsole]);

  const handleOpenWindow = useCallback(() => {
    if (!hasFiles) return;
    try {
      const { html } = buildStandaloneDocument(filesOrEmpty);
      const url = URL.createObjectURL(
        new Blob([html], { type: "text/html;charset=utf-8" }),
      );
      const win = window.open(url, "_blank");
      if (!win) {
        URL.revokeObjectURL(url);
        toast({ title: "浏览器拦截了新窗口", description: "请允许本站弹出窗口", tone: "error" });
        return;
      }
      try {
        win.opener = null;
      } catch {
        /* ignore */
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast({ title: "打开新窗口失败", tone: "error" });
    }
  }, [filesOrEmpty, hasFiles, toast]);

  const handleExport = useCallback(
    async (kind: "html" | "zip") => {
      setExportOpen(false);
      if (!hasFiles) return;
      try {
        const filename =
          kind === "zip"
            ? await downloadZip(filesOrEmpty, projectName)
            : await downloadSingleHtml(filesOrEmpty, projectName);
        toast({
          title: kind === "zip" ? "ZIP 已开始下载" : "HTML 已开始下载",
          description: filename,
          tone: "success",
        });
      } catch (exportError) {
        toast({
          title: "导出失败",
          description:
            exportError instanceof Error ? exportError.message : "请稍后重试",
          tone: "error",
        });
      }
    },
    [filesOrEmpty, hasFiles, projectName, toast],
  );

  const handleShare = useCallback(async () => {
    if (!hasFiles || shareBusy) return;
    setShareBusy(true);
    try {
      const url = await createShareUrl(filesOrEmpty, projectName);
      const copied = await copyText(url);
      if (copied) {
        toast({
          title: "分享链接已复制",
          description: `约 ${formatBytes(byteSize(url))} · 打开后自动导入`,
          tone: "success",
        });
      } else {
        setShareFallback(url);
        toast({
          title: "自动复制失败",
          description: "请在弹窗中手动复制链接",
          tone: "error",
        });
      }
    } catch (shareError) {
      toast({
        title: "生成分享链接失败",
        description:
          shareError instanceof Error ? shareError.message : "请稍后重试",
        tone: "error",
      });
    } finally {
      setShareBusy(false);
    }
  }, [filesOrEmpty, hasFiles, projectName, shareBusy, toast]);

  const handleRestore = useCallback(
    (version: Version) => {
      restoreVersion(version.id);
      setTab("preview");
      toast({ title: `已恢复到 ${version.label}`, tone: "success" });
    },
    [restoreVersion, toast],
  );

  const retryCopy = useCallback(async () => {
    if (!shareFallback) return;
    const copied = await copyText(shareFallback);
    toast(
      copied
        ? { title: "已复制到剪贴板", tone: "success" }
        : { title: "仍然无法复制", description: "请手动选择链接", tone: "error" },
    );
  }, [shareFallback, toast]);

  /* -------------------------------- render -------------------------------- */

  return (
    <div
      role="region"
      aria-label="应用预览面板"
      className="relative flex h-full min-h-0 flex-col"
    >
      <header className="flex shrink-0 flex-col gap-2 border-b border-white/[0.06] px-3 pb-2 pt-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/[0.12] text-accent-soft">
              <IconEye size={13} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-[13px] font-semibold tracking-tight text-fg">
                  {projectName}
                </h2>
                {busy ? (
                  <span className="badge badge-accent h-[18px] shrink-0 gap-1 px-1.5 text-[10px]">
                    <span className="typing-dot scale-75" />
                    生成中
                  </span>
                ) : hasFiles ? (
                  <span className="hidden shrink-0 items-center gap-1 text-[10px] text-ok sm:inline-flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                    运行中
                  </span>
                ) : null}
              </div>
              <p className="truncate text-[10.5px] leading-tight text-muted-2">
                {metaText}
              </p>
            </div>
          </div>

          <div className="flex w-full shrink-0 items-center justify-between gap-1 sm:ml-auto sm:w-auto sm:justify-end">
            <DeviceSwitch device={device} onChange={selectDevice} />
            <span className="mx-0.5 hidden h-4 w-px bg-white/[0.08] lg:block" />
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={!hasFiles}
                title="刷新预览"
                aria-label="刷新预览"
              >
                <IconRefresh size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleOpenWindow}
                disabled={!hasFiles}
                title="在新窗口打开"
                aria-label="在新窗口打开"
              >
                <IconExternal size={15} />
              </Button>
              <div ref={exportMenuRef} className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setExportOpen((open) => !open)}
                  disabled={!hasFiles}
                  title="导出应用"
                  aria-label="导出应用"
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                >
                  <IconDownload size={15} />
                </Button>
                {exportOpen ? (
                  <ExportMenu
                    onExport={(kind) => {
                      void handleExport(kind);
                    }}
                    onClose={() => setExportOpen(false)}
                  />
                ) : null}
              </div>
              <Button
                ref={fullscreenButtonRef}
                variant="ghost"
                size="icon"
                onClick={() => setFullscreen(true)}
                disabled={!hasFiles}
                title="全屏预览"
                aria-label="全屏预览"
              >
                <IconMaximize size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  void handleShare();
                }}
                loading={shareBusy}
                disabled={!hasFiles}
                title="复制分享链接"
                aria-label="复制分享链接"
              >
                {shareBusy ? null : <IconShare size={15} />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTab("versions")}
                disabled={!hasProject}
                title={`版本历史（${versionCount}）`}
                aria-label="版本历史"
                className={cn(tab === "versions" && "bg-white/[0.08] text-fg")}
              >
                <IconHistory size={15} />
              </Button>
            </div>
          </div>
        </div>

        {showWarnings ? <WarningStrip warnings={bundle.warnings} /> : null}
      </header>

      <UsageBar usage={usage} quota={quota} />

      <div className="relative min-h-0 flex-1">
        {/* Single preview surface — kept mounted across tab switches AND
            fullscreen toggles; fullscreen only changes its positioning. */}
        <div
          ref={surfaceRef}
          className={cn(
            "absolute inset-0",
            !fullscreen && tab !== "preview" && "hidden",
            fullscreen && "overflow-hidden bg-[#05050a]",
          )}
          style={
            fullscreen
              ? { position: "fixed", inset: 0, zIndex: 150 }
              : undefined
          }
          role={fullscreen ? "dialog" : undefined}
          aria-modal={fullscreen ? true : undefined}
          aria-label={fullscreen ? "全屏预览" : undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            {fullscreen ? (
              <FullscreenHeader
                key="fullscreen-header"
                projectName={projectName}
                hasFiles={hasFiles}
                busy={busy}
                device={device}
                onDeviceChange={selectDevice}
                onRefresh={handleRefresh}
                onClose={() => setFullscreen(false)}
                closeRef={closeFullscreenRef}
              />
            ) : null}
            {fullscreen ? (
              <UsageBar key="fullscreen-usage" usage={usage} quota={quota} />
            ) : null}
            <div key="preview-stage" className="relative min-h-0 flex-1">
              <PreviewStage
                html={bundle.html}
                hasFiles={hasFiles}
                hasProject={hasProject}
                device={device}
                busy={busy}
                phaseLabel={phaseLabel}
                error={error}
                reloadKey={reloadKey}
                address={address}
                iframeRef={iframeRef}
              />
            </div>
            {fullscreen ? <FullscreenFooter key="fullscreen-footer" /> : null}
          </div>
        </div>
        <div className={cn("absolute inset-0", tab !== "console" && "hidden")}>
          <ConsoleTab entries={consoleEntries} onClear={clearConsole} />
        </div>
        <div className={cn("absolute inset-0", tab !== "code" && "hidden")}>
          <CodeTab files={filesOrEmpty} projectName={projectName} />
        </div>
        <div className={cn("absolute inset-0", tab !== "versions" && "hidden")}>
          <VersionsTab
            versions={activeProject?.versions ?? EMPTY_VERSIONS}
            currentFiles={filesOrEmpty}
            onRestore={handleRestore}
          />
        </div>
      </div>

      <nav
        className="flex shrink-0 items-center gap-0.5 border-t border-white/[0.06] bg-black/25 px-1.5 py-1.5"
        role="tablist"
        aria-label="预览面板切换"
      >
        <TabButton
          active={tab === "preview"}
          onClick={() => setTab("preview")}
          icon={<IconEye size={13} />}
          label="预览"
        />
        <TabButton
          active={tab === "console"}
          onClick={() => setTab("console")}
          icon={<IconTerminal size={13} />}
          label="控制台"
          badge={
            errorCount > 0 ? (
              <Badge tone="err" className="h-[16px] px-1.5 text-[9.5px]">
                {errorCount}
              </Badge>
            ) : null
          }
        />
        <TabButton
          active={tab === "code"}
          onClick={() => setTab("code")}
          icon={<IconFileCode size={13} />}
          label="代码"
        />
        <TabButton
          active={tab === "versions"}
          onClick={() => setTab("versions")}
          icon={<IconHistory size={13} />}
          label="版本"
          badge={
            versionCount > 0 ? (
              <Badge className="h-[16px] px-1.5 text-[9.5px]">
                {versionCount}
              </Badge>
            ) : null
          }
        />
      </nav>

      <Modal
        open={shareFallback !== null}
        onClose={() => setShareFallback(null)}
        title="手动复制分享链接"
        description="浏览器不允许自动写入剪贴板，请选中下面的链接后复制。链接包含应用全部代码，所以比较长。"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShareFallback(null)}
            >
              关闭
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                void retryCopy();
              }}
            >
              <IconShare size={12} />
              重新复制
            </Button>
          </>
        }
      >
        <textarea
          readOnly
          value={shareFallback ?? ""}
          onFocus={(event) => event.currentTarget.select()}
          className="textarea scroll-thin h-28 font-mono text-[10.5px]"
          aria-label="分享链接"
        />
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              small subcomponents                           */
/* -------------------------------------------------------------------------- */

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-white/[0.09] text-fg"
          : "text-muted hover:bg-white/[0.04] hover:text-fg",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {badge}
    </button>
  );
}

function WarningStrip({ warnings }: { warnings: string[] }) {
  return (
    <div
      className="flex items-start gap-1.5 rounded-lg border border-warn/25 bg-warn/[0.07] px-2 py-1.5 text-[10.5px] leading-relaxed text-warn"
      title={warnings.join("\n")}
    >
      <IconAlert size={12} className="mt-[1px] shrink-0" />
      <span className="line-clamp-2">
        {warnings.slice(0, 2).join("；")}
        {warnings.length > 2 ? `；等 ${warnings.length} 项提示` : ""}
      </span>
    </div>
  );
}

function ExportMenu({
  onExport,
  onClose,
}: {
  onExport: (kind: "html" | "zip") => void;
  onClose: () => void;
}) {
  return (
    <div
      role="menu"
      className="absolute right-0 top-[calc(100%+6px)] z-40 w-[212px] overflow-hidden rounded-xl border border-white/[0.09] bg-surface/95 p-1 shadow-2xl backdrop-blur animate-[slide-up_0.16s_ease-out_both]"
    >
      <p className="px-2 pb-1 pt-1 text-[10px] tracking-[0.08em] text-muted-2">
        导出应用
      </p>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onExport("html");
          onClose();
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12px] text-fg/90 transition-colors hover:bg-white/[0.06]"
      >
        <IconFileCode size={14} className="shrink-0 text-muted-2" />
        <span className="flex-1">单文件 HTML</span>
        <span className="text-[10px] text-muted-2">.html</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onExport("zip");
          onClose();
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12px] text-fg/90 transition-colors hover:bg-white/[0.06]"
      >
        <IconArchive size={14} className="shrink-0 text-muted-2" />
        <span className="flex-1">ZIP 压缩包</span>
        <span className="text-[10px] text-muted-2">.zip</span>
      </button>
      <p className="px-2 pb-1 pt-1.5 text-[10px] leading-relaxed text-muted-2">
        包含原始文件与 README
      </p>
    </div>
  );
}
