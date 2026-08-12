import { ExternalLink, Mail, Send, Users2, ShieldCheck } from "lucide-react";

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

export default function EPostaPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-900">
          <Mail className="h-6 w-6 text-indigo-600" />
          E-pošta
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Tu urejaš in pošiljaš e-pošto (obvestila, info, promocije) iz domene{" "}
          <strong>kodatim.si</strong>. Urejevalnik predlog, seznamov in kampanj je Listmonk —
          odpre se na tvoji domeni.
        </p>
      </header>

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
