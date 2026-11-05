"use client";

import { useEffect } from "react";

/**
 * Global keyboard shortcut helpers (single source of truth for the UI dialog and docs).
 * Combos: "mod" = Ctrl (Windows/Linux) or Cmd (macOS).
 */

export interface ShortcutSpec {
  keys: string;
  label: string;
  group: "对话" | "项目" | "界面";
}

export const SHORTCUTS: ShortcutSpec[] = [
  { keys: "Enter", label: "发送消息", group: "对话" },
  { keys: "Shift+Enter", label: "输入换行", group: "对话" },
  { keys: "mod+Enter", label: "发送消息（任意输入框）", group: "对话" },
  { keys: "mod+k", label: "聚焦输入框", group: "对话" },
  { keys: "Esc", label: "停止生成 / 关闭浮层", group: "界面" },
  { keys: "?", label: "打开快捷键面板", group: "界面" },
  { keys: "mod+shift+n", label: "新建应用", group: "项目" },
  { keys: "mod+.", label: "停止生成", group: "对话" },
];

export const FOCUS_COMPOSER_EVENT = "atoms:focus-composer";

export function focusComposer(): void {
  window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT));
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

/** Human-readable representation, e.g. `mod+k` → `⌘ K` or `Ctrl K`. */
export function formatShortcut(keys: string, mac = isMacPlatform()): string {
  if (keys === "?") return "?";
  const parts = keys.split("+");
  return parts
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "mod") return mac ? "⌘" : "Ctrl";
      if (lower === "shift") return mac ? "⇧" : "Shift";
      if (lower === "alt") return mac ? "⌥" : "Alt";
      if (lower === "enter") return "↵";
      if (lower === "escape" || lower === "esc") return "Esc";
      if (lower === "arrowup") return "↑";
      if (lower === "arrowdown") return "↓";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(mac ? " " : " + ");
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function matches(combo: string, event: KeyboardEvent): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const wantsMod = parts.includes("mod");
  const wantsShift = parts.includes("shift");
  const wantsAlt = parts.includes("alt");

  const mod = event.ctrlKey || event.metaKey;
  if (wantsMod !== mod) return false;
  if (wantsAlt !== event.altKey) return false;

  // "?" is produced with Shift+Slash on most layouts, so the combo is
  // "unshifted by definition" and must not require event.shiftKey === false.
  if (key === "?") return event.key === "?";
  if (wantsShift !== event.shiftKey) return false;

  if (key === "escape" || key === "esc") return event.key === "Escape";
  if (key === "enter") return event.key === "Enter";
  if (key === "tab") return event.key === "Tab";
  if (key === ".") return event.key === ".";
  return event.key.toLowerCase() === key;
}

export interface HotkeyOptions {
  enabled?: boolean;
  /** Default true. Set false for shortcuts inside text fields you handle yourself. */
  preventDefault?: boolean;
  /** Default false: plain-key combos are ignored while typing in inputs/textareas. */
  allowInInput?: boolean;
}

export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  options: HotkeyOptions = {},
): void {
  const { enabled = true, preventDefault = true, allowInInput = false } = options;

  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent): void => {
      if (!matches(combo, event)) return;
      const hasMod = combo.toLowerCase().includes("mod");
      if (!allowInInput && isTypingTarget(event.target) && !hasMod && combo !== "escape") {
        return;
      }
      if (preventDefault) event.preventDefault();
      handler(event);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [combo, handler, enabled, preventDefault, allowInInput]);
}
