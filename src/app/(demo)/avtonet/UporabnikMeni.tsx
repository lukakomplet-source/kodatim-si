"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Account controls, top right.
 *
 * Settings and sign-out are not places you navigate to while working — they are
 * things you reach for once and leave. Sitting in the tab strip they competed
 * with Moja spremljanja and Analiza trga, which are the actual work. Here they
 * are out of the way and where every other application puts them.
 *
 * Renders nothing for a visitor: the public analysis page should not show an
 * account menu to someone who has no account.
 */
export function UporabnikMeni() {
  const router = useRouter();
  const [dostop, setDostop] = useState<{ jeUporabnik: boolean; email: string | null } | null>(null);
  const [odjavljam, setOdjavljam] = useState(false);

  useEffect(() => {
    let ustavljeno = false;
    void (async () => {
      try {
        const res = await fetch("/api/avtonet/dostop", { cache: "no-store" });
        if (!res.ok || ustavljeno) return;
        const data = (await res.json()) as { jeUporabnik?: boolean; email?: string | null };
        if (!ustavljeno) {
          setDostop({ jeUporabnik: data.jeUporabnik === true, email: data.email ?? null });
        }
      } catch {
        // No menu is the safe default.
      }
    })();
    return () => {
      ustavljeno = true;
    };
  }, []);

  if (!dostop?.jeUporabnik) return null;

  const odjava = async () => {
    setOdjavljam(true);
    // Same path the admin shell uses: end the Supabase session, then send the
    // browser to the login page and refresh so server components re-render
    // without the session.
    await createClient().auth.signOut();
    router.push("/prijava");
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      {dostop.email && (
        <span className="hidden max-w-[14rem] truncate text-xs text-zinc-400 sm:inline">
          {dostop.email}
        </span>
      )}
      <Link
        href="/avtonet/nastavitve"
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
      >
        <Settings className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Nastavitve</span>
      </Link>
      <button
        type="button"
        onClick={odjava}
        disabled={odjavljam}
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 hover:text-red-600 disabled:opacity-50"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{odjavljam ? "Odjavljam…" : "Odjava"}</span>
      </button>
    </div>
  );
}
