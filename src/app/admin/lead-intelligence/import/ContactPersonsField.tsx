"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

function parseNames(defaultValue?: string): string[] {
  const names = (defaultValue ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return names.length ? names : [""];
}

export default function ContactPersonsField({
  defaultValue,
  disabled,
}: {
  defaultValue?: string;
  disabled?: boolean;
}) {
  const [names, setNames] = useState<string[]>(() => parseNames(defaultValue));

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Kontaktne osebe
        </label>
        {!disabled && (
          <button
            type="button"
            onClick={() => setNames((prev) => [...prev, ""])}
            className="flex items-center gap-1 text-xs font-medium text-accent"
          >
            <Plus className="h-3.5 w-3.5" /> Dodaj osebo
          </button>
        )}
      </div>
      <div className="mt-1 space-y-2">
        {names.map((name, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              name="contact_person"
              value={name}
              disabled={disabled}
              onChange={(e) =>
                setNames((prev) =>
                  prev.map((n, idx) => (idx === i ? e.target.value : n))
                )
              }
              placeholder="Ime in priimek"
              className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
            />
            {!disabled && names.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setNames((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
