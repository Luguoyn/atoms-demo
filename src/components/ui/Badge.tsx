import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "default" | "accent" | "ok" | "warn" | "err";

const TONE_CLASS: Record<BadgeTone, string> = {
  default: "",
  accent: "badge-accent",
  ok: "badge-ok",
  warn: "badge-warn",
  err: "badge-err",
};

export function Badge({
  children,
  tone = "default",
  className,
  title,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
}) {
  return (
    <span title={title} className={cn("badge", TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}
