"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClassName = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-6 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`w-full ${maxWidthClassName} rounded-2xl bg-white p-7 shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4">
          {title && (
            <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Zapri"
            className="ml-auto rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
