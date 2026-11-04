"use client";

/**
 * Empty state for the preview stage: a "blank canvas" browser mock-up plus
 * guidance copy. It doubles as the first-generation progress view.
 * OWNER: ui-preview.
 */

import { cn, truncate } from "@/lib/utils";
import { IconSparkles } from "./Icons";

export interface PreviewEmptyProps {
  busy: boolean;
  phaseLabel: string | null;
  /** True when a project exists but it has no generated files yet. */
  hasProject: boolean;
  /** Last generation error (already surfaced in chat, repeated here for context). */
  error?: string | null;
}

const CAPABILITIES = ["真实交互", "浏览器本地存储", "一键分享 / 导出"];

export function PreviewEmpty({
  busy,
  phaseLabel,
  hasProject,
  error,
}: PreviewEmptyProps) {
  const failed = !busy && !!error;
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-4 py-6">
      {/* ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        aria-hidden
        style={{
          background:
            "radial-gradient(24rem 18rem at 50% 0%, rgba(139,92,246,0.16), transparent 65%), radial-gradient(20rem 16rem at 80% 100%, rgba(34,211,238,0.08), transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-[400px] animate-[slide-up_0.3s_ease-out_both]">
        {/* mock window */}
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border bg-[#0b0b13]/80 shadow-[0_30px_70px_-40px_rgba(0,0,0,0.95)] backdrop-blur-sm",
            busy
              ? "border-accent/35 shadow-[0_0_0_1px_rgba(139,92,246,0.18),0_30px_70px_-40px_rgba(0,0,0,0.95)]"
              : failed
                ? "border-err/30"
                : "border-white/[0.09]",
          )}
        >
          <div className="flex h-7 items-center gap-1.5 border-b border-white/[0.06] bg-black/30 px-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
            <div className="mx-auto flex h-4 w-[52%] items-center justify-center rounded-md bg-white/[0.05]">
              <span className="text-[9px] tracking-wide text-muted-2">
                {busy ? "正在搭建…" : "preview"}
              </span>
            </div>
            <span className="w-6" />
          </div>

          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-accent/60 to-accent-2/40",
                  busy && "animate-[pulse-soft_1.6s_ease-in-out_infinite]",
                )}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="skeleton h-2 w-[46%] rounded-full" />
                <div className="h-2 w-[28%] rounded-full bg-white/[0.05]" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className={cn(
                    "h-14 rounded-lg border border-white/[0.05] bg-white/[0.025]",
                    busy && "skeleton border-transparent",
                  )}
                  style={busy ? { animationDelay: `${index * 120}ms` } : undefined}
                />
              ))}
            </div>

            <div className="space-y-1.5">
              {[92, 74, 58].map((width) => (
                <div
                  key={width}
                  className={cn(
                    "h-2 rounded-full bg-white/[0.045]",
                    busy && "skeleton",
                  )}
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
          </div>

          {busy ? (
            <div className="flex items-center gap-2 border-t border-white/[0.06] bg-black/25 px-4 py-2.5">
              <span className="spinner h-3 w-3 border-[1.5px]" />
              <span className="truncate text-[11.5px] text-accent-soft">
                {phaseLabel ?? "Agent 正在编写代码"}
              </span>
              <span className="ml-auto shrink-0 text-[10.5px] text-muted-2">
                完成后自动预览
              </span>
            </div>
          ) : null}
        </div>

        {/* copy */}
        <div className="mt-5 text-center">
          <div
            className={cn(
              "mb-2 flex items-center justify-center gap-1.5",
              failed ? "text-err" : "text-accent-soft",
            )}
          >
            <IconSparkles size={13} />
            <span className="text-[10.5px] font-medium tracking-[0.14em] uppercase">
              {failed ? "Generation failed" : "Live preview"}
            </span>
          </div>
          <h3 className="text-[14.5px] font-semibold tracking-tight text-fg">
            {failed
              ? "这次没有生成成功"
              : busy
                ? "正在构建你的应用"
                : hasProject
                  ? "这个应用还没有可预览的内容"
                  : "预览会在这里实时运行"}
          </h3>
          <p className="mx-auto mt-1.5 max-w-[330px] text-[12px] leading-relaxed text-muted">
            {failed
              ? truncate(
                  error ?? "生成过程出错了，可以在左侧重试或换一种描述。",
                  160,
                )
              : busy
                ? "Agent 正在规划与编写代码，生成完成后会自动加载可交互的预览，无需刷新。"
                : hasProject
                  ? "在左侧继续描述你的改动，生成完成后预览会自动出现。"
                  : "在左侧用一句话描述你想要的应用，Agent 会规划、写代码，并在这里运行它。"}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {(failed ? ["重试一次", "换一种更具体的描述"] : CAPABILITIES).map(
              (capability) => (
                <span
                  key={capability}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[10.5px] text-muted"
                >
                  {capability}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
