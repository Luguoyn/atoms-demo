"use client";

/**
 * Compact token-usage / prompt-cache / demo-quota status bar.
 * Hidden entirely when there is nothing to show. OWNER: ui-preview.
 */

import type { GenerationUsage, ServerStatus } from "@/types";
import { cacheHitRate, formatTokens } from "@/lib/preview/usage";
import { cn } from "@/lib/utils";

export interface UsageBarProps {
  usage: GenerationUsage | null;
  quota: ServerStatus["quota"] | null;
}

export function UsageBar({ usage, quota }: UsageBarProps) {
  if (!usage && !quota) return null;
  const hitRate = cacheHitRate(usage);

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-white/[0.04] bg-black/15 px-3 py-1 text-[10px] whitespace-nowrap text-muted-2">
      {usage ? (
        <div
          className="scroll-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
          title={usage.model ? `模型：${usage.model}` : undefined}
        >
          <span className="shrink-0 text-muted-2/70">最近用量</span>
          <Chip label={`输入 ${formatTokens(usage.promptTokens)}`} title="prompt tokens" />
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[1px]",
              usage.cachedTokens > 0
                ? "border-accent-2/25 bg-accent-2/[0.08] text-accent-2"
                : "border-white/[0.07] bg-white/[0.03] text-muted-2",
            )}
            title="命中服务端提示缓存的 prompt tokens（费用更低、首字更快）"
          >
            缓存命中 {formatTokens(usage.cachedTokens)}
            {hitRate !== null && hitRate > 0 ? (
              <span className="opacity-75">{hitRate}%</span>
            ) : null}
          </span>
          <Chip label={`输出 ${formatTokens(usage.completionTokens)}`} title="completion tokens" />
          {usage.reasoningTokens && usage.reasoningTokens > 0 ? (
            <Chip
              label={`推理 ${formatTokens(usage.reasoningTokens)}`}
              title="reasoning tokens"
            />
          ) : null}
        </div>
      ) : (
        <span className="min-w-0 flex-1" />
      )}

      {quota ? (
        <span
          className={cn(
            "ml-auto flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[1px]",
            quota.remaining <= 0
              ? "border-err/30 bg-err/[0.08] text-err"
              : quota.remaining <= 3
                ? "border-warn/30 bg-warn/[0.08] text-warn"
                : "border-white/[0.08] bg-white/[0.03] text-muted",
          )}
          title={`每 IP 每小时 ${quota.limitPerHour} 次 · ${new Date(quota.resetAt).toLocaleTimeString(
            "zh-CN",
            { hour: "2-digit", minute: "2-digit" },
          )} 重置`}
        >
          剩余演示额度 {quota.remaining}/{quota.limitPerHour}
        </span>
      ) : null}
    </div>
  );
}

function Chip({ label, title }: { label: string; title?: string }) {
  return (
    <span
      className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.03] px-1.5 py-[1px]"
      title={title}
    >
      {label}
    </span>
  );
}
