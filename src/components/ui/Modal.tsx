"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        className={cn(
          "panel relative w-full max-w-lg p-5 animate-[slide-up_0.22s_ease-out_both]",
          className,
        )}
      >
        {(title || description) && (
          <div className="mb-4 pr-8">
            {title ? (
              <h2 className="text-[15px] font-semibold tracking-tight text-fg">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                {description}
              </p>
            ) : null}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="btn btn-icon absolute right-3 top-3"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {children}
        {footer ? (
          <div className="mt-5 flex items-center justify-end gap-2">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
