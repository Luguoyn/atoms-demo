"use client";

/**
 * Preview stage: device shell + sandboxed srcDoc iframe + stage-level overlays.
 * The iframe stays mounted while switching tabs/devices so the running app is
 * not reset; only the reload token forces a document reload.
 * OWNER: ui-preview.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { IconLock } from "./Icons";
import { PreviewEmpty } from "./PreviewEmpty";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

export interface PreviewDeviceOption {
  key: PreviewDevice;
  label: string;
  width: number | null;
}

export const PREVIEW_DEVICES: PreviewDeviceOption[] = [
  { key: "desktop", label: "桌面", width: null },
  { key: "tablet", label: "平板", width: 820 },
  { key: "mobile", label: "手机", width: 390 },
];

export interface PreviewStageProps {
  html: string;
  hasFiles: boolean;
  hasProject: boolean;
  device: PreviewDevice;
  busy: boolean;
  phaseLabel: string | null;
  error: string | null;
  reloadKey: number;
  address: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
}

const STAGE_INSET = 12;
const MIN_SHELL = 220;

const SANDBOX = "allow-scripts allow-forms allow-modals allow-popups";

export function PreviewStage({
  html,
  hasFiles,
  hasProject,
  device,
  busy,
  phaseLabel,
  error,
  reloadKey,
  address,
  iframeRef,
}: PreviewStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      // Hidden tabs report a zero box. Keep the last size so the iframe is not
      // unmounted (that would wipe the generated app's in-memory state).
      if (rect.width < 24 || rect.height < 24) return;
      setStage((prev) =>
        Math.abs(prev.width - rect.width) < 1 &&
        Math.abs(prev.height - rect.height) < 1
          ? prev
          : { width: rect.width, height: rect.height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const selected = PREVIEW_DEVICES.find((option) => option.key === device);
  const frameWidth = selected?.width ?? null;
  const availableWidth = Math.max(stage.width - STAGE_INSET * 2, MIN_SHELL);
  const availableHeight = Math.max(stage.height - STAGE_INSET * 2, MIN_SHELL);
  const scale = frameWidth ? Math.min(1, availableWidth / frameWidth) : 1;
  const shellWidth = frameWidth ?? availableWidth;
  const shellHeight = frameWidth ? availableHeight / scale : availableHeight;
  const measured = stage.width > 0 && stage.height > 0;

  const shellClass =
    device === "desktop"
      ? "rounded-xl border border-white/10 bg-[#0c0c14] shadow-[0_28px_70px_-40px_rgba(0,0,0,0.95)]"
      : device === "tablet"
        ? "rounded-[26px] border-[6px] border-[#16161f] bg-[#0d0d15] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.95)]"
        : "rounded-[36px] border-[7px] border-[#15151f] bg-[#0d0d15] shadow-[0_34px_90px_-40px_rgba(0,0,0,0.98)]";

  const screenClass =
    device === "desktop"
      ? "bg-white"
      : device === "tablet"
        ? "rounded-[20px] bg-white"
        : "rounded-[29px] bg-white";

  return (
    <div
      ref={stageRef}
      role="region"
      aria-label="应用预览"
      data-device={device}
      className="relative h-full w-full overflow-hidden"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(30rem 20rem at 50% -12%, rgba(139,92,246,0.1), transparent 62%), linear-gradient(180deg, #0a0a11 0%, #08080d 100%)",
        }}
      />

      {hasFiles ? (
        measured ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ padding: STAGE_INSET }}
          >
            <div
              className="relative"
              style={{ width: shellWidth * scale, height: shellHeight * scale }}
            >
              <div
                className="absolute left-0 top-0"
                style={{
                  width: shellWidth,
                  height: shellHeight,
                  transform: scale < 0.999 ? `scale(${scale})` : undefined,
                  transformOrigin: "top left",
                }}
              >
                <div
                  className={cn(
                    "flex h-full w-full flex-col overflow-hidden",
                    shellClass,
                    busy && "ring-1 ring-accent/25",
                  )}
                >
                  {device === "desktop" ? (
                    <div
                      key="chrome"
                      className="flex h-8 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#101018] px-2.5"
                    >
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]/70" />
                        <span className="h-[7px] w-[7px] rounded-full bg-[#febc2e]/60" />
                        <span className="h-[7px] w-[7px] rounded-full bg-[#28c840]/55" />
                      </div>
                      <div className="mx-auto flex h-[19px] w-full max-w-[300px] items-center justify-center gap-1 rounded-md border border-white/[0.05] bg-black/35 px-2 text-[10px] text-muted-2">
                        <IconLock size={9} className="shrink-0" />
                        <span className="truncate">{address}</span>
                      </div>
                      <div className="w-[38px] shrink-0" />
                    </div>
                  ) : null}

                  <div
                    key="screen"
                    className={cn(
                      "relative min-h-0 flex-1 overflow-hidden",
                      screenClass,
                    )}
                  >
                    <iframe
                      ref={iframeRef}
                      key={`preview-frame-${reloadKey}`}
                      title="应用预览"
                      className="h-full w-full border-0 bg-white"
                      sandbox={SANDBOX}
                      srcDoc={html}
                      referrerPolicy="no-referrer"
                    />
                    {device === "mobile" ? (
                      <>
                        <div
                          key="notch"
                          className="pointer-events-none absolute left-1/2 top-0 z-10 h-[18px] w-[100px] -translate-x-1/2 rounded-b-[13px] bg-[#15151f]"
                        />
                        <div
                          key="home"
                          className="pointer-events-none absolute bottom-1.5 left-1/2 z-10 h-[3px] w-[86px] -translate-x-1/2 rounded-full bg-black/20"
                        />
                      </>
                    ) : null}
                    {device === "tablet" ? (
                      <div
                        key="tablet-camera"
                        className="pointer-events-none absolute left-1/2 top-1.5 z-10 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/30"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0" />
        )
      ) : (
        <PreviewEmpty
          busy={busy}
          phaseLabel={phaseLabel}
          hasProject={hasProject}
          error={error}
        />
      )}

      {busy && hasFiles ? <BusyBadge phaseLabel={phaseLabel} /> : null}
    </div>
  );
}

function BusyBadge({ phaseLabel }: { phaseLabel: string | null }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 w-full -translate-x-1/2 px-3">
      <div className="mx-auto flex w-fit max-w-full items-center gap-2 rounded-full border border-accent/30 bg-[#0b0b13]/95 px-3 py-1.5 shadow-[0_12px_32px_-14px_rgba(0,0,0,0.9)] backdrop-blur">
        <span className="spinner h-3 w-3 border-[1.5px]" />
        <span className="max-w-[220px] truncate text-[11.5px] font-medium text-accent-soft">
          {phaseLabel ?? "正在生成应用"}
        </span>
        <span className="hidden shrink-0 text-[10.5px] text-muted-2 sm:inline">
          · 预览将自动更新
        </span>
      </div>
    </div>
  );
}
