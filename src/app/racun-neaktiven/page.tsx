import Link from "next/link";
import { redirect } from "next/navigation";
import { UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/**
 * Where /admin and /partner send an account whose status is »Neaktiven«
 * (set in /admin/uporabniki). Public on purpose: it must not sit under a
 * protected layout, or the redirect would loop.
 */

export const metadata = { title: "Račun ni aktiven" };

async function odjava() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/prijava");
}

export default function RacunNeaktivenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfbfd] px-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <UserX className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-zinc-900">Vaš račun ni aktiven</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Dostop do administracije in partnerskega portala je izklopljen. Če menite, da je to napaka, se obrnite na
          skrbnika sistema.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <form action={odjava}>
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
            >
              Odjava
            </button>
          </form>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
            Na domačo stran
          </Link>
        </div>
      </div>
    </main>
  );
}
