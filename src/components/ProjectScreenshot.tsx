"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, ZoomIn } from "lucide-react";

export default function ProjectScreenshot({
  src,
  alt,
  label,
  width = 2000,
  height = 999,
}: {
  src: string;
  alt: string;
  label: string;
  width?: number;
  height?: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b12] text-left shadow-2xl shadow-zinc-900/20 transition hover:border-accent/30"
      >
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="ml-3 text-xs font-medium text-zinc-500">
            {label}
          </span>
          <span className="ml-auto flex items-center gap-1 text-[11px] text-zinc-600 transition group-hover:text-zinc-300">
            <ZoomIn className="h-3.5 w-3.5" />
            Povečaj
          </span>
        </div>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="w-full"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/85 p-6 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Zapri"
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
