/**
 * Inline icon set for the preview panel (stroke icons, currentColor).
 * Keeping them local avoids an icon dependency. OWNER: ui-preview.
 */

import type { SVGProps } from "react";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "strokeWidth"> {
  size?: number;
  strokeWidth?: number;
}

function Svg({ size = 16, strokeWidth = 1.8, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    />
  );
}

export function IconEye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.2 12S5.8 5.5 12 5.5 21.8 12 21.8 12 18.2 18.5 12 18.5 2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="2.7" />
    </Svg>
  );
}

export function IconMonitor(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="4" width="19" height="13" rx="2.2" />
      <path d="M8.5 21h7M12 17v4" />
    </Svg>
  );
}

export function IconTablet(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.8" y="2.5" width="14.4" height="19" rx="2.6" />
      <path d="M11 18.2h2" />
    </Svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.6" />
      <path d="M11 18.4h2" />
    </Svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M20.5 4v5h-5" />
    </Svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 3.5h6v6" />
      <path d="M20.5 3.5 11 13" />
      <path d="M18.5 13.5v5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h5" />
    </Svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5v10.5" />
      <path d="m7.5 10 4.5 4.5L16.5 10" />
      <path d="M4.5 20.5h15" />
    </Svg>
  );
}

export function IconShare(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="17.5" cy="5.5" r="2.5" />
      <circle cx="6.5" cy="12" r="2.5" />
      <circle cx="17.5" cy="18.5" r="2.5" />
      <path d="m8.7 10.8 6.6-4M8.7 13.2l6.6 4" />
    </Svg>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
      <path d="M3.5 3.5v5h5" />
      <path d="M12 7.5V12l3.2 1.9" />
    </Svg>
  );
}

export function IconTerminal(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.8" y="4" width="18.4" height="16" rx="2.4" />
      <path d="m7 9.5 2.7 2.5L7 14.5" />
      <path d="M12.5 15h4.2" />
    </Svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12.8 4.2 4.2L19 6.8" />
    </Svg>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19.5 12h-15" />
      <path d="m10 5.5-5.5 6.5 5.5 6.5" />
    </Svg>
  );
}

export function IconDiff(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.7}>
      <path d="M6 4.5v6M6 15v4.5M18 4.5V10M18 14.5v5" />
      <circle cx="6" cy="12.2" r="1.7" />
      <circle cx="18" cy="12.2" r="1.7" />
      <path d="M7.7 6.8h8.6M16.3 17.5H7.7" />
    </Svg>
  );
}

export function IconMaximize(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 3.5H3.5V9" />
      <path d="M15 3.5h5.5V9" />
      <path d="M20.5 15v5.5H15" />
      <path d="M3.5 15v5.5H9" />
    </Svg>
  );
}

export function IconMinimize(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 9H9V3.5" />
      <path d="M20.5 9H15V3.5" />
      <path d="M15 20.5V15h5.5" />
      <path d="M9 20.5V15H3.5" />
    </Svg>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 5.5h17L14 13v6.2l-4-2V13L3.5 5.5Z" />
    </Svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.7}>
      <path d="M12 3.2 2.6 20h18.8L12 3.2Z" />
      <path d="M12 9v4.6M12 17.2h.01" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.2A1.7 1.7 0 0 1 11.2 3.5h1.6a1.7 1.7 0 0 1 1.7 1.7V7" />
      <path d="m6 7 .9 12.2a1.7 1.7 0 0 0 1.7 1.6h6.8a1.7 1.7 0 0 0 1.7-1.6L18 7" />
    </Svg>
  );
}

export function IconSparkles(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.6}>
      <path d="M12 3.2 13.7 8l4.8 1.7-4.8 1.7L12 16.2l-1.7-4.8L5.5 9.7 10.3 8 12 3.2Z" />
      <path d="M18.6 15.2l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.7}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
      <path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" />
    </Svg>
  );
}

export function IconFileCode(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.7}>
      <path d="M14 3H7.5A2 2 0 0 0 5.5 5v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7.5L14 3Z" />
      <path d="M14 3v4.5h4.5" />
      <path d="m10.5 12.5-2 2.2 2 2.2M14 12.5l2 2.2-2 2.2" />
    </Svg>
  );
}

export function IconArchive(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.7}>
      <rect x="3" y="4" width="18" height="4.6" rx="1.2" />
      <path d="M4.7 8.6v9.9A1.6 1.6 0 0 0 6.3 20h11.4a1.6 1.6 0 0 0 1.6-1.5V8.6" />
      <path d="M10 12.6h4" />
    </Svg>
  );
}

export function IconRotate(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 3.5v5h-5" />
    </Svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.7}>
      <rect x="8.8" y="8.8" width="12" height="12" rx="2.2" />
      <path d="M6.2 15.2H5.6A2.1 2.1 0 0 1 3.5 13V5.6a2.1 2.1 0 0 1 2.1-2.1H13a2.1 2.1 0 0 1 2.1 2.1v.5" />
    </Svg>
  );
}

/** Small polymorphic dot used for status indicators. */
export function StatusDot({ tone }: { tone: "ok" | "warn" | "err" | "muted" }) {
  const color =
    tone === "ok"
      ? "bg-ok"
      : tone === "warn"
        ? "bg-warn"
        : tone === "err"
          ? "bg-err"
          : "bg-muted-2";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} aria-hidden />;
}
