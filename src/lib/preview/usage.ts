/**
 * Token usage / prompt-cache display helpers for the preview status bar.
 * OWNER: ui-preview.
 */

import type { ChatMessage, GenerationUsage } from "@/types";

/** Compact token count: 987 → "987", 1234 → "1.2k", 1234567 → "1.2M". */
export function formatTokens(value: number | null | undefined): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (number < 0) return "0";
  if (number < 1000) return String(Math.round(number));
  if (number < 1_000_000) {
    const thousands = number / 1000;
    return `${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1)}k`;
  }
  const millions = number / 1_000_000;
  return `${millions >= 100 ? Math.round(millions) : millions.toFixed(1)}M`;
}

/** Percentage of prompt tokens served from the provider cache (0-100). */
export function cacheHitRate(
  usage: GenerationUsage | null | undefined,
): number | null {
  if (!usage || usage.promptTokens <= 0) return null;
  if (usage.cachedTokens <= 0) return 0;
  return Math.min(100, Math.round((usage.cachedTokens / usage.promptTokens) * 100));
}

/** Most recent usage reported in the conversation (newest assistant message wins). */
export function pickLatestUsage(
  messages: ChatMessage[] | null | undefined,
): GenerationUsage | null {
  if (!messages || messages.length === 0) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const usage = messages[index]?.usage;
    if (usage) return usage;
  }
  return null;
}
