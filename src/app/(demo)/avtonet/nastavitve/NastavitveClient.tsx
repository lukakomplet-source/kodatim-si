"use client";

import { useActionState } from "react";
import { AlertTriangle, Bell, CheckCircle2, KeyRound, Loader2, Mail, Save, Settings } from "lucide-react";
import {
  spremeniEmail,
  spremeniGeslo,
  spremeniObvestila,
  type NastavitveResult,
} from "./actions";

/**
 * Three small independent forms rather than one big one.
 *
 * Each change has different consequences — a new address needs confirming by
 * mail, a new password takes effect at once — so each gets its own button and
 * its own message. One combined "Save" would report a single outcome for three
 * things that succeed and fail separately.
 */

const CARD = "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm";
const INPUT =
  "mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/10";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wide text-zinc-500";

export function NastavitveClient({
  email,
  obvestilaEmail,
  jeAdmin,
}: {
  email: string;
  obvestilaEmail: string;
  jeAdmin: boolean;
}) {
  const [stanjeEmail, akcijaEmail, tecEmail] = useActionState<NastavitveResult, FormData>(
    spremeniEmail,
    {}
  );
  const [stanjeGeslo, akcijaGeslo, tecGeslo] = useActionState<NastavitveResult, FormData>(
    spremeniGeslo,
    {}
  );
  const [stanjeObv, akcijaObv, tecObv] = useActionState<NastavitveResult, FormData>(
    spremeniObvestila,
    {}
  );

  return (
    <div>
      <header>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
          <Settings className="h-6 w-6 text-accent" />
          Nastavitve
        </h1>
        <p className="mt-2 text-[15px] text-zinc-500">
          Vaš račun{jeAdmin && " (imate skrbniške pravice)"}.
        </p>
      </header>

      <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <form action={akcijaObv} className={CARD}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Bell className="h-4 w-4 text-accent" />
            Kam naj pošiljamo obvestila
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Sem prihajajo obvestila o novih oglasih za <strong>vsa vaša spremljanja</strong> — nastavite
            enkrat tukaj in vam ga ni treba vpisovati pri vsakem spremljanju posebej. Če pri
            posameznem spremljanju vpišete drug naslov, ima ta prednost. Prazno pomeni, da obvestil ne
            prejemate.
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Pošiljatelj bo <strong>security@kompletko.com</strong> — dodajte ga med varne
            pošiljatelje, da obvestilo ne pade med neželeno pošto.
          </p>
          <label className={`${LABEL} mt-3`}>
            E-naslov za obvestila
            <input
              name="obvestila_email"
              type="email"
              defaultValue={obvestilaEmail}
              placeholder={email}
              className={INPUT}
            />
          </label>
          <Sporocilo stanje={stanjeObv} />
          <Gumb tece={tecObv} ikona={<Save className="h-4 w-4" />} besedilo="Shrani" />
        </form>

        <form action={akcijaEmail} className={CARD}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Mail className="h-4 w-4 text-accent" />
            E-naslov za prijavo
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Trenutno: <strong className="text-zinc-700">{email}</strong>. Na novi naslov pošljemo
            potrditveno povezavo — sprememba velja šele, ko jo potrdite.
          </p>
          <label className={`${LABEL} mt-3`}>
            Nov e-naslov
            <input name="email" type="email" required placeholder="novi@primer.si" className={INPUT} />
          </label>
          <Sporocilo stanje={stanjeEmail} />
          <Gumb tece={tecEmail} ikona={<Mail className="h-4 w-4" />} besedilo="Zamenjaj e-naslov" />
        </form>

        <form action={akcijaGeslo} className={`${CARD} lg:col-span-2`}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <KeyRound className="h-4 w-4 text-accent" />
            Geslo
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Vsaj 8 znakov. Gesla ne hranimo mi — zanj skrbi Supabase Auth, enako kot za prijavo.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={LABEL}>
              Novo geslo
              <input name="geslo" type="password" required minLength={8} className={INPUT} />
            </label>
            <label className={LABEL}>
              Ponovite geslo
              <input name="ponovi" type="password" required minLength={8} className={INPUT} />
            </label>
          </div>
          <Sporocilo stanje={stanjeGeslo} />
          <Gumb tece={tecGeslo} ikona={<KeyRound className="h-4 w-4" />} besedilo="Spremeni geslo" />
        </form>
      </div>
    </div>
  );
}

function Sporocilo({ stanje }: { stanje: NastavitveResult }) {
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

function Gumb({ tece, ikona, besedilo }: { tece: boolean; ikona: React.ReactNode; besedilo: string }) {
  return (
    <button
      type="submit"
      disabled={tece}
      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
    >
      {tece ? <Loader2 className="h-4 w-4 animate-spin" /> : ikona}
      {besedilo}
    </button>
  );
}
