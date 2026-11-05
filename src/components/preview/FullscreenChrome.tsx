"use client";

/**
 * Fullscreen chrome (header + footer). The preview stage itself lives in the
 * panel and is only repositioned/re-styled, so these are pure presentational
 * pieces rendered around it while fullscreen is active.
 * OWNER: ui-preview.
 */

import type { RefObject } from "react";
import { Button } from "@/components/ui";
import { DeviceSwitch } from "./DeviceSwitch";
import {
  IconEye,
  IconMinimize,
  IconRefresh,
  IconSparkles,
} from "./Icons";
import type { PreviewDevice } from "./PreviewStage";

export interface FullscreenHeaderProps {
  projectName: string;
  hasFiles: boolean;
  busy: boolean;
  device: PreviewDevice;
  onDeviceChange: (next: PreviewDevice) => void;
  onRefresh: () => void;
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}

export function FullscreenHeader({
  projectName,
  hasFiles,
  busy,
  device,
  onDeviceChange,
  onRefresh,
  onClose,
  closeRef,
}: FullscreenHeaderProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-white/[0.08] bg-[#0b0b13]/95 px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/[0.12] text-accent-soft">
        <IconEye size={13} />
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
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

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <DeviceSwitch device={device} onChange={onDeviceChange} size="md" />
        <span className="mx-0.5 hidden h-4 w-px bg-white/[0.08] sm:block" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={!hasFiles}
          title="刷新预览"
          aria-label="刷新预览"
        >
          <IconRefresh size={15} />
        </Button>
        <Button
          ref={closeRef}
          variant="ghost"
          size="icon"
          onClick={onClose}
          title="退出全屏（Esc）"
          aria-label="退出全屏"
        >
          <IconMinimize size={15} />
        </Button>
      </div>
    </header>
  );
}

export function FullscreenFooter() {
  return (
    <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-white/[0.06] bg-black/30 px-3 py-1 text-[10px] text-muted-2">
      <IconSparkles size={10} className="text-accent-soft" />
      按 Esc 退出全屏 · 设备与刷新保留在顶部
    </footer>
  );
}
