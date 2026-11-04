import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("h-7 w-7", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="atoms-mark" x1="4" y1="4" x2="28" y2="28">
          <stop stopColor="#a78bfa" />
          <stop offset="0.55" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="9"
        fill="url(#atoms-mark)"
        fillOpacity="0.14"
        stroke="url(#atoms-mark)"
        strokeOpacity="0.65"
        strokeWidth="1.2"
      />
      <ellipse
        cx="16"
        cy="16"
        rx="9.2"
        ry="4.2"
        transform="rotate(-32 16 16)"
        stroke="url(#atoms-mark)"
        strokeWidth="1.4"
      />
      <ellipse
        cx="16"
        cy="16"
        rx="9.2"
        ry="4.2"
        transform="rotate(52 16 16)"
        stroke="url(#atoms-mark)"
        strokeWidth="1.4"
        strokeOpacity="0.85"
      />
      <circle cx="16" cy="16" r="2.4" fill="#e9e3ff" />
    </svg>
  );
}
