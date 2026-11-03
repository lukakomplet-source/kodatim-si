"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Friendly screen instead of Next's generic error for every admin page.
 * Server errors arrive here without their message (only `digest`), so the
 * text stays general; the digest is shown so it can be found in the server log.
 */
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-20 text-center shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-zinc-900">Strani trenutno ni bilo mogoče naložiti</h1>
      <p className="mt-2 max-w-md text-sm text-zinc-500">
        Morda kakšen sistem v ozadju (baza ali Harvey) ta trenutek ne odgovarja. Poskusite znova čez nekaj sekund.
        Če se ponavlja, sporočite skrbniku sistema.
      </p>
      {error.digest && <p className="mt-2 text-xs text-zinc-400">Oznaka napake: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
        >
          Poskusi znova
        </button>
        <Link
          href="/admin"
          className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
        >
          Nazaj na pregled
        </Link>
      </div>
    </div>
  );
}
