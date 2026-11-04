/** Lightweight inline icons for the chat-side UI. All icons inherit `currentColor`. */
import type { ReactNode } from "react";

export interface IconProps {
  className?: string;
}

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconSparkles({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.5 13.7 8.3 18.5 10 13.7 11.7 12 16.5 10.3 11.7 5.5 10 10.3 8.3 12 3.5Z" />
      <path
        d="M18.6 15.2l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"
        strokeWidth={1.2}
      />
    </Svg>
  );
}

export function IconArrowUp({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 19V5M12 5 6 11M12 5l6 6" />
    </Svg>
  );
}

export function IconArrowDown({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M12 19l-6-6M12 19l6-6" />
    </Svg>
  );
}

export function IconArrowUpRight({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M7 17 17 7M9 7h8v8" />
    </Svg>
  );
}

export function IconStop({ className }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
    </svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 13.5a7.9 7.9 0 0 0 0-3l1.7-1.3-1.9-3.3-2 .8a8 8 0 0 0-2.6-1.5L14.3 3h-4.6l-.3 2.2A8 8 0 0 0 6.8 6.7l-2-.8-1.9 3.3 1.7 1.3a7.9 7.9 0 0 0 0 3l-1.7 1.3 1.9 3.3 2-.8a8 8 0 0 0 2.6 1.5l.3 2.2h4.6l.3-2.2a8 8 0 0 0 2.6-1.5l2 .8 1.9-3.3-1.7-1.3Z" />
    </Svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 11.2A1.8 1.8 0 0 0 9.1 20h5.8a1.8 1.8 0 0 0 1.8-1.8L17.5 7" />
      <path d="M10 11v5M14 11v5" />
    </Svg>
  );
}

export function IconPencil({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.4 19.6l4.3-1 9.6-9.6a2 2 0 0 0 0-2.8l-1.5-1.5a2 2 0 0 0-2.8 0L4.4 14.3v5.3Z" />
      <path d="M13.4 6.6l4 4" />
    </Svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.8 12.4l4.6 4.6L19.2 7.2" />
    </Svg>
  );
}

export function IconX({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconChevronDown({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 9.5l6 6 6-6" />
    </Svg>
  );
}

export function IconAlertTriangle({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.8 21 19.6H3L12 3.8Z" />
      <path d="M12 9.4v4.2M12 16.6v.1" />
    </Svg>
  );
}

export function IconInfo({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 11v5.2M12 7.9v.1" />
    </Svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6V12l3 1.9" />
    </Svg>
  );
}

export function IconFile({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 3.6H7.4A1.6 1.6 0 0 0 5.8 5.2v13.6a1.6 1.6 0 0 0 1.6 1.6h9.2a1.6 1.6 0 0 0 1.6-1.6V7.4L14 3.6Z" />
      <path d="M13.8 3.9v3.3h3.4" />
    </Svg>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.6 20.4 8 12 12.4 3.6 8 12 3.6Z" />
      <path d="M4.4 12.4 12 16.4l7.6-4M4.4 16.4 12 20.4l7.6-4" />
    </Svg>
  );
}

export function IconFolder({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.8 7.2A1.6 1.6 0 0 1 5.4 5.6h3.8l2 2.4h7.4a1.6 1.6 0 0 1 1.6 1.6v7.2a1.6 1.6 0 0 1-1.6 1.6H5.4a1.6 1.6 0 0 1-1.6-1.6V7.2Z" />
    </Svg>
  );
}

export function IconEye({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2.8 12S6 6.8 12 6.8 21.2 12 21.2 12 18 17.2 12 17.2 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  );
}

export function IconEyeOff({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c6 0 9.2 5.2 9.2 5.2a16 16 0 0 1-3 3.5M6.2 7.4A15 15 0 0 0 2.8 12S6 17.2 12 17.2c1.2 0 2.3-.2 3.3-.6" />
      <path d="M9.8 9.9a3 3 0 0 0 4.2 4.2" />
    </Svg>
  );
}

export function IconList({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.6" cy="6.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="17.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconWallet({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 8a1.9 1.9 0 0 1 1.9-1.9H18a1.6 1.6 0 0 1 1.6 1.6v8.6A1.9 1.9 0 0 1 17.7 18H5.9A1.9 1.9 0 0 1 4 16.1V8Z" />
      <path d="M4 9.4h15.6" />
      <circle cx="16.4" cy="13.2" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconChart({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 19.4V11.6M10 19.4V5.2M15 19.4V13.4M20 19.4V8.4" strokeWidth={2.1} />
      <path d="M3.6 19.4h16.8" strokeWidth={1.4} />
    </Svg>
  );
}

export function IconMonitor({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.4" y="4.6" width="17.2" height="11.6" rx="1.8" />
      <path d="M9.2 20.2h5.6M12 16.2v4" />
    </Svg>
  );
}

export function IconShieldCheck({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.6 19 6v5.4c0 4.2-2.9 7.5-7 9.1-4.1-1.6-7-4.9-7-9.1V6l7-2.4Z" />
      <path d="M8.9 11.9l2.1 2.1 4.1-4.2" />
    </Svg>
  );
}

export function IconKey({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8.5" cy="8.5" r="3.5" />
      <path d="M11.2 11.2 19.5 19.5M16.2 16.2l2.4-2.4M18.6 18.6l2.4-2.4" />
    </Svg>
  );
}
