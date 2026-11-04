"use client";

import type { AgentStep } from "@/types";
import { cn } from "@/lib/utils";
import { IconCheck, IconLayers, IconX } from "./icons";

export function StepList({ steps }: { steps: AgentStep[] }) {
  const done = steps.filter((step) => step.status === "done").length;

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2">
        <IconLayers className="h-3 w-3" />
        <span>执行步骤</span>
        <span className="tabular-nums">
          {done}/{steps.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {steps.map((step) => (
          <div key={step.id} className="step">
            {step.status === "running" ? (
              <span className="spinner shrink-0" aria-hidden />
            ) : step.status === "done" ? (
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
                <IconCheck className="h-2.5 w-2.5" />
              </span>
            ) : (
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-err/15 text-err">
                <IconX className="h-2.5 w-2.5" />
              </span>
            )}
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                step.status === "error" && "text-err/90",
              )}
            >
              {step.label}
            </span>
            {step.summary ? (
              <span
                className="hidden max-w-[45%] shrink-0 truncate text-[11px] text-muted-2 sm:block"
                title={step.summary}
              >
                {step.summary}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
