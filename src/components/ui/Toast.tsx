"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn, uid } from "@/lib/utils";

export type ToastTone = "info" | "success" | "error";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastItem extends Required<Omit<ToastInput, "description">> {
  id: string;
  description?: string;
}

interface ToastApi {
  toast: (input: string | ToastInput) => string;
  dismiss: (id?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 2600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id?: string) => {
    setItems((prev) => {
      const next = id ? prev.filter((item) => item.id !== id) : [];
      return next;
    });
    if (id) {
      const timer = timersRef.current.get(id);
      if (timer) clearTimeout(timer);
      timersRef.current.delete(id);
    } else {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    }
  }, []);

  const toast = useCallback(
    (input: string | ToastInput) => {
      const raw: ToastInput = typeof input === "string" ? { title: input } : input;
      const id = uid("t_");
      const item: ToastItem = {
        id,
        title: raw.title,
        description: raw.description,
        tone: raw.tone ?? "info",
        durationMs: raw.durationMs ?? DEFAULT_DURATION,
      };
      setItems((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), item]);
      const timer = setTimeout(() => dismiss(id), item.durationMs);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    },
    [],
  );

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-5 right-5 z-[200] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-xl backdrop-blur-md animate-[slide-up_0.2s_ease-out_both]",
              item.tone === "success" &&
                "border-emerald-400/30 bg-emerald-500/12 text-emerald-100",
              item.tone === "error" &&
                "border-rose-400/30 bg-rose-500/12 text-rose-100",
              item.tone === "info" && "border-white/12 bg-[#14141f]/95 text-fg",
            )}
          >
            <span className="mt-0.5 text-[13px] leading-5">
              {item.tone === "success" ? "✓" : item.tone === "error" ? "!" : "·"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium leading-5">{item.title}</div>
              {item.description ? (
                <div className="mt-0.5 break-words text-[11.5px] leading-4 opacity-75">
                  {item.description}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="关闭提示"
              className="mt-0.5 shrink-0 rounded px-1 text-[12px] leading-4 opacity-50 transition-opacity hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
