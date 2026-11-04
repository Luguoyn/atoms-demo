"use client";

import { useState } from "react";
import type { AppPlan } from "@/types";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { IconCheck, IconChevronDown, IconFile, IconSparkles } from "./icons";

export interface PlanCardProps {
  plan: AppPlan;
  defaultOpen?: boolean;
}

export function PlanCard({ plan, defaultOpen = false }: PlanCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const files = plan.files ?? [];

  return (
    <div className="overflow-hidden rounded-xl bg-gradient-to-br from-accent/10 via-surface-2/40 to-transparent ring-1 ring-accent/25">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-soft ring-1 ring-accent/25">
          <IconSparkles className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[13px] font-medium tracking-tight text-fg">
              {plan.name}
            </span>
            <Badge tone="accent" className="shrink-0">
              方案
            </Badge>
          </span>
          <span
            title={plan.summary}
            className={cn(
              "mt-0.5 block text-[11.5px] leading-relaxed text-muted",
              open ? "" : "line-clamp-1",
            )}
          >
            {plan.summary}
          </span>
        </span>
        <IconChevronDown
          className={cn(
            "mt-1 h-3.5 w-3.5 shrink-0 text-muted-2 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="animate-fade-in border-t border-white/5 px-3 pb-2.5 pt-2">
          {plan.features.length > 0 ? (
            <>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2">
                将实现
              </p>
              <ul className="space-y-1">
                {plan.features.map((feature, index) => (
                  <li
                    key={`${index}-${feature}`}
                    className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted"
                  >
                    <IconCheck className="mt-[3px] h-3 w-3 shrink-0 text-ok/80" />
                    <span className="min-w-0">{feature}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {files.length > 0 ? (
            <>
              <p className="mb-1 mt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2">
                文件
              </p>
              <ul className="space-y-0.5">
                {files.map((file) => (
                  <li
                    key={file.path}
                    className="flex min-w-0 items-center gap-1.5"
                    title={`${file.path} · ${file.purpose}`}
                  >
                    <IconFile className="h-3 w-3 shrink-0 text-muted-2" />
                    <code className="shrink-0 font-mono text-[10.5px] text-accent-soft">
                      {file.path}
                    </code>
                    <span className="truncate text-[10.5px] text-muted-2">
                      {file.purpose}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
