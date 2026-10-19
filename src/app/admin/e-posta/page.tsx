import Link from "next/link";
import { ExternalLink, Mail, Send, Users2, ShieldCheck, Workflow } from "lucide-react";
import { requireAdmin } from "@/lib/require-admin";
import { preberiEkipo } from "@/lib/prodajna-ekipa";

/**
 * "E-pošta" — the entry point in the KodaTim admin to the email system.
 *
 * The actual campaign/template editing lives in Listmonk (the email management
 * tool), reached at listmonk.kodatim.si through the Cloudflare tunnel. This page
 * is the bridge the user asked for: manage emails "from inside kodatim.si"
 * rather than remembering a separate address. It deliberately does not try to
 * reproduce Listmonk's editor — it links to it and explains what to do there.
 *
 * The URL is env-configurable so the tunnel hostname can change without a code
 * edit; it falls back to the hostname we set up.
 */

const LISTMONK_URL = process.env.NEXT_PUBLIC_LISTMONK_URL || "https://listmonk.kodatim.si";

export const metadata = { title: "E-pošta — KodaTim admin" };
export const dynamic = "force-dynamic";

export default async function EPostaPage() {
  // Prodajna ekipa (hladna pošta podjetjem) je samo za administratorja.
  let ekipa: Awaited<ReturnType<typeof preberiEkipo>> | null = null;
  try {
    await requireAdmin();
    ekipa = await preberiEkipo();
  } catch {
    ekipa = null;
  }
  const p = ekipa?.povzetek ?? null;
  const cakajo = p?.delavci.find((d) => d.kljuc === "odobritev")?.glavna.vrednost ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-900">
          <Mail className="h-6 w-6 text-indigo-600" />
          E-pošta
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Dve vrsti pošte: <strong>prodajna ekipa</strong> piše podjetjem, ki jih je našla (hladna
          pošta, vsako sporočilo odobriš ti), <strong>novice</strong> v Listmonku pa gredo samo
          prejemnikom, ki so se prijavili.
        </p>
      </header>

      {p ? (
        <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
            <Workflow className="h-5 w-5 text-indigo-600" />
            Prodajna ekipa — pošta podjetjem
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Čaka na tvojo odobritev</p>
              <p className="text-2xl font-semibold text-zinc-900">{cakajo}</p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Poslano danes</p>
              <p className="text-2xl font-semibold text-zinc-900">
                {p.posiljanje.danes} / {p.posiljanje.na_dan}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Pošiljanje</p>
              <p className="text-sm font-semibold text-zinc-900">
                {p.posiljanje.vklopljeno ? "vklopljeno" : `izklopljeno — ${p.posiljanje.razlog}`}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/admin/prodajna-ekipa/odobritev"
              className="inline-flex items-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Odobri osnutke
            </Link>
            <Link
              href="/admin/prodajna-ekipa/posiljatelj"
              className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300"
            >
              Poslana sporočila
            </Link>
          </div>
        </div>
      ) : null}

      <h2 className="mb-2 text-base font-semibold text-zinc-900">Novice (Listmonk)</h2>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-700">
          Klikni za odprtje urejevalnika e-pošte. Prijava z računom, ki si ga nastavil ob prvem
          zagonu (uporabnik <code className="rounded bg-zinc-100 px-1">admin</code>).
        </p>
        <a
          href={LISTMONK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Odpri urejevalnik e-pošte
          <ExternalLink className="h-4 w-4" />
        </a>
        <p className="mt-3 text-xs text-zinc-400">{LISTMONK_URL}</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <InfoCard
          icon={<Send className="h-5 w-5 text-indigo-600" />}
          title="Kampanje"
          text="Sestavi mail, izberi seznam prejemnikov in pošlji — ali razporedi za pozneje."
        />
        <InfoCard
          icon={<Users2 className="h-5 w-5 text-indigo-600" />}
          title="Seznami"
          text="Naročniki s privolitvijo (opt-in). Odjava se obravnava samodejno."
        />
        <InfoCard
          icon={<ShieldCheck className="h-5 w-5 text-indigo-600" />}
          title="Dostavljivost"
          text="Pošiljatelj info@kodatim.si, s SPF/DKIM. Postopno pošiljanje in sledenje odjavam/zavrnitvam."
        />
      </div>

      <div className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200">
        <strong>Pomembno za dostavo v predal (ne v spam):</strong> pošiljaj le prejemnikom, ki so
        privolili. Množično pošiljanje na zbrane/kupljene naslove sproži pritožbe in te filtri
        vržejo v spam — ne glede na nastavitve.
      </div>
    </div>
  );
}

function InfoCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-2">{icon}</div>
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600">{text}</p>
    </div>
  );
}
