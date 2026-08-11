"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
} from "lucide-react";
import {
  dodajUporabnika,
  odstraniUporabnika,
  posljiVabiloZnova,
  preklopiDostop,
  spremeniVlogo,
  type UporabnikResult,
} from "./actions";

/**
 * Access management for SBN Auto.
 *
 * The screen says out loud what it does not do — set passwords — because that is
 * the first thing an admin looks for here, and not finding it should read as a
 * deliberate design rather than a missing feature.
 */

export type Vrstica = {
  id: string;
  email: string;
  ime: string | null;
  vloga: string;
  aktiven: boolean;
  obvestilaEmail: string | null;
  createdAt: string;
};

const CARD = "rounded-2xl border border-zinc-200 bg-white shadow-sm";
const INPUT =
  "mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/10";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wide text-zinc-500";

export function UporabnikiClient({
  vrstice,
  migracijaManjka,
  napaka,
}: {
  vrstice: Vrstica[];
  migracijaManjka: boolean;
  napaka: string | null;
}) {
  const router = useRouter();
  const [stanje, akcija, tece] = useActionState<UporabnikResult, FormData>(dodajUporabnika, {});
  const [isPending, start] = useTransition();
  const [sporocilo, setSporocilo] = useState<UporabnikResult | null>(null);

  const uporabi = (fn: () => Promise<UporabnikResult>) => {
    start(async () => {
      setSporocilo(await fn());
      router.refresh();
    });
  };

  return (
    <div>
      <header>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
          <UserCog className="h-6 w-6 text-accent" />
          Uporabniki
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-zinc-500">
          Kdo lahko uporablja SBN Auto. Vsak vidi samo svoja spremljanja; skrbnik vidi vsa in ima
          dostop do baze, konzole in AI urejanja.
        </p>
      </header>

      {migracijaManjka && (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Tabela uporabnikov še ne obstaja — poženite{" "}
          <code>supabase/migration_avtonet_uporabniki.sql</code>.
        </p>
      )}
      {napaka && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {napaka}
        </p>
      )}

      <form action={akcija} className={`${CARD} mt-6 p-5`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <UserPlus className="h-4 w-4 text-accent" />
          Dodaj uporabnika
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Vpišite e-naslov. Če osebe še ni v sistemu, ji Supabase pošlje vabilo in si{" "}
          <strong>geslo nastavi sama</strong> — gesel tu ne nastavljamo in jih nikjer ne hranimo.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <label className={LABEL}>
            E-naslov
            <input name="email" type="email" required placeholder="oseba@primer.si" className={INPUT} />
          </label>
          <label className={LABEL}>
            Vloga
            <select name="vloga" defaultValue="stranka" className={INPUT}>
              <option value="stranka">Stranka</option>
              <option value="admin">Skrbnik</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={tece}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {tece ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Povabi
          </button>
        </div>
        <Sporocilo stanje={stanje} />
      </form>

      <Sporocilo stanje={sporocilo ?? {}} />

      <div className="mt-6 space-y-2">
        {vrstice.length === 0 ? (
          <div className={`${CARD} px-6 py-10 text-center`}>
            <p className="text-sm text-zinc-500">
              Nihče še nima dostopa. Vi kot skrbnik KodaTim ga imate vedno — tudi brez zapisa tukaj.
            </p>
          </div>
        ) : (
          vrstice.map((v) => (
            <article key={v.id} className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-4`}>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-900">
                  {v.ime ?? v.email}
                  {v.vloga === "admin" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                      <ShieldCheck className="h-3 w-3" />
                      Skrbnik
                    </span>
                  )}
                  {!v.aktiven && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                      Dostop odvzet
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {v.ime ? `${v.email} · ` : ""}
                  obvestila: {v.obvestilaEmail ?? "na prijavni e-naslov"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={v.vloga}
                  disabled={isPending}
                  onChange={(e) => uporabi(() => spremeniVlogo(v.id, e.target.value))}
                  className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs"
                >
                  <option value="stranka">Stranka</option>
                  <option value="admin">Skrbnik</option>
                </select>
                <button
                  type="button"
                  disabled={isPending}
                  title="Pošlje e-pošto s povezavo za nastavitev gesla in prijavo"
                  onClick={() => uporabi(() => posljiVabiloZnova(v.id))}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Pošlji povezavo za prijavo
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => uporabi(() => preklopiDostop(v.id, !v.aktiven))}
                  className="rounded-full border border-zinc-200 px-3.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  {v.aktiven ? "Odvzemi dostop" : "Vrni dostop"}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  title="Odstrani iz SBN Auto"
                  onClick={() => {
                    if (confirm(`Odstraniti ${v.email} iz SBN Auto? Račun v KodaTim ostane.`)) {
                      uporabi(() => odstraniUporabnika(v.id));
                    }
                  }}
                  className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function Sporocilo({ stanje }: { stanje: UporabnikResult }) {
  if (stanje.error) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {stanje.error}
      </p>
    );
  }
  if (stanje.success) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {stanje.success}
      </p>
    );
  }
  return null;
}
