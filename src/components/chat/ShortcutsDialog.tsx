"use client";

import { Modal } from "@/components/ui";
import { SHORTCUTS, isMacPlatform, type ShortcutSpec } from "@/lib/hotkeys";
import { IconSparkles } from "./icons";

export interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const GROUP_ORDER: ShortcutSpec["group"][] = ["对话", "项目", "界面"];

const GROUP_HINT: Record<ShortcutSpec["group"], string> = {
  对话: "输入与生成",
  项目: "应用管理",
  界面: "面板与浮层",
};

function keyTokens(keys: string, mac: boolean): string[] {
  return keys.split("+").map((part) => {
    const lower = part.toLowerCase();
    if (lower === "mod") return mac ? "⌘" : "Ctrl";
    if (lower === "shift") return mac ? "⇧" : "Shift";
    if (lower === "alt") return mac ? "⌥" : "Alt";
    if (lower === "enter") return "Enter";
    if (lower === "esc" || lower === "escape") return "Esc";
    return part.length === 1 ? part.toUpperCase() : part;
  });
}

function KeyCaps({ keys, mac }: { keys: string; mac: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keyTokens(keys, mac).map((token, index) => (
        <kbd key={`${token}-${index}`} className="kbd">
          {token}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const mac = isMacPlatform();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="快捷键"
      description="用键盘更快地完成常用操作；在输入框内同样生效。"
    >
      <div className="space-y-4">
        {GROUP_ORDER.map((group) => {
          const items = SHORTCUTS.filter((shortcut) => shortcut.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <h3 className="text-[12px] font-medium text-fg">{group}</h3>
                <span className="text-[10.5px] text-muted-2">{GROUP_HINT[group]}</span>
              </div>
              <div className="overflow-hidden rounded-xl bg-white/[0.025] ring-1 ring-white/[0.06]">
                {items.map((shortcut, index) => (
                  <div
                    key={shortcut.keys}
                    className={
                      index === 0
                        ? "flex items-center justify-between gap-3 px-3 py-2"
                        : "flex items-center justify-between gap-3 border-t border-white/5 px-3 py-2"
                    }
                  >
                    <span className="min-w-0 truncate text-[12.5px] text-muted">
                      {shortcut.label}
                    </span>
                    <KeyCaps keys={shortcut.keys} mac={mac} />
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <p className="flex items-start gap-1.5 rounded-xl bg-accent/[0.06] px-3 py-2 text-[11px] leading-relaxed text-muted ring-1 ring-accent/15">
          <IconSparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-soft" />
          <span>
            <span className="font-medium text-fg">mod</span> 在 macOS 上是 ⌘，在
            Windows / Linux 上是 Ctrl。按 <kbd className="kbd">?</kbd> 可随时打开本面板，
            <kbd className="kbd">Esc</kbd> 关闭。
          </span>
        </p>
      </div>
    </Modal>
  );
}
