"use client";

/**
 * Desktop / tablet / phone switch — shared by the panel toolbar and the
 * fullscreen preview header. OWNER: ui-preview.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconMonitor, IconPhone, IconTablet } from "./Icons";
import { PREVIEW_DEVICES, type PreviewDevice } from "./PreviewStage";

const DEVICE_ICONS: Record<PreviewDevice, ReactNode> = {
  desktop: <IconMonitor size={13} />,
  tablet: <IconTablet size={13} />,
  mobile: <IconPhone size={13} />,
};

export interface DeviceSwitchProps {
  device: PreviewDevice;
  onChange: (next: PreviewDevice) => void;
  /** Bigger hit area for the fullscreen header. */
  size?: "sm" | "md";
}

export function DeviceSwitch({ device, onChange, size = "sm" }: DeviceSwitchProps) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-[10px] border border-white/[0.08] bg-black/25 p-0.5"
      role="group"
      aria-label="预览设备"
    >
      {PREVIEW_DEVICES.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={device === option.key}
          title={`${option.label}预览${option.width ? `（${option.width}px）` : ""}`}
          className={cn(
            "flex items-center justify-center rounded-lg transition-colors",
            size === "md" ? "h-7 w-7" : "h-[26px] w-[26px]",
            device === option.key
              ? "bg-white/[0.1] text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              : "text-muted-2 hover:bg-white/[0.05] hover:text-fg",
          )}
        >
          {DEVICE_ICONS[option.key]}
        </button>
      ))}
    </div>
  );
}
