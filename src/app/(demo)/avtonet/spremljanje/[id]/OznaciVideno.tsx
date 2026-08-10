"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { oznaciKotVideno } from "../../spremljanja-actions";

/**
 * Clears the "N novih" badge.
 *
 * A button rather than a side effect of opening the page: Next.js prefetches
 * links, so marking the listings seen during render would clear the badge before
 * the person ever looked at it.
 */
export function OznaciVideno({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        start(async () => {
          await oznaciKotVideno(id);
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      Označi kot pregledano
    </button>
  );
}
