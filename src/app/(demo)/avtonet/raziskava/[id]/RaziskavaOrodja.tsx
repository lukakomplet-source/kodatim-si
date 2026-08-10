"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { izbrisiRaziskavo } from "../actions";

/**
 * Deleting a research, with the consequence spelled out before the click.
 *
 * The confirmation says what survives, not just what goes. "Are you sure?" tells
 * someone nothing about whether they are about to lose months of collected price
 * history — which they are not, and they deserve to know that before deciding.
 */
export function RaziskavaOrodja({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [napaka, setNapaka] = useState<string | null>(null);

  const tece = status === "tece" || status === "zahtevano";

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={isPending || tece}
        title={tece ? "Raziskava še teče — najprej jo prekličite" : "Izbriši raziskavo"}
        onClick={() => {
          const ok = confirm(
            "Izbrisati to raziskavo?\n\nIzbriše se samo zapis o pregledu in njegov dnevnik.\nZbrani oglasi, cene in zgodovina OSTANEJO."
          );
          if (!ok) return;
          start(async () => {
            const out = await izbrisiRaziskavo(id);
            if (out.error) {
              setNapaka(out.error);
              return;
            }
            router.push("/avtonet/pregled");
            router.refresh();
          });
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Izbriši raziskavo
      </button>

      {napaka && (
        <p className="flex max-w-xs items-start gap-1.5 text-right text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {napaka}
        </p>
      )}
    </div>
  );
}
