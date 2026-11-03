import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import type { Povezava } from "@/lib/povezavaPodjetja";
import type { MailZaOgled } from "@/lib/komunikacija";

/** Skupni gradniki zavihkov Komunikacije (Pregled, Poslano, Odgovori) in strani »Poglej mail«. */

export const POSEL_IME = { kodatim: "KodaTim", kompletko: "Kompletko" } as const;

export function kdaj(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString("sl-SI", {
    timeZone: "Europe/Ljubljana",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Opozorilo({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{children}</p>;
}

export function NaslovPosla({ posel, st, opis }: { posel: keyof typeof POSEL_IME; st?: number | null; opis?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-lg font-semibold text-zinc-900">
        {POSEL_IME[posel]}
        {st !== undefined ? (
          <span className="ml-2 font-normal text-zinc-500">({st === null ? "ni podatka" : st})</span>
        ) : null}
      </h2>
      {opis ? <p className="text-sm text-zinc-500">{opis}</p> : null}
    </div>
  );
}

const GUMB =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-300 hover:ring-zinc-500";

export function PogledMaila({ href }: { href: string | null }) {
  if (!href) return <span className="text-xs text-zinc-400">mail: ni podatka</span>;
  return (
    <Link href={href} className={GUMB}>
      Poglej mail
    </Link>
  );
}

export function PovezavaPodjetja({ povezava, ime }: { povezava?: Povezava; ime?: string }) {
  if (!povezava) return null;
  if (povezava.zunanja)
    return (
      <a href={povezava.href} target="_blank" rel="noopener noreferrer" className={GUMB}>
        {ime ?? povezava.href.replace(/^https:\/\//, "")} <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    );
  return (
    <Link href={povezava.href} className={GUMB}>
      Kartica podjetja
    </Link>
  );
}

/** Mail, kot je šel ven ali kot je prišel: iframe brez skript, priloge po imenu. */
export function OgledMaila({
  mail,
  nazaj,
  nazajIme,
  prilogaHref,
}: {
  mail: MailZaOgled;
  nazaj: string;
  nazajIme: string;
  prilogaHref?: (indeks: number) => string;
}) {
  return (
    <div className="max-w-4xl">
      <Link href={nazaj} className="text-sm text-zinc-500 hover:text-zinc-900">
        ← {nazajIme}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{mail.zadeva || "(brez zadeve)"}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {[mail.za ? `Za ${mail.za}` : "", mail.od ? `od ${mail.od}` : "", mail.datum ? kdaj(mail.datum) : ""]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {mail.priloge?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {mail.priloge.map((p, i) => {
            const ime = typeof p === "string" ? p : p.ime;
            const vsebina = (
              <>
                <FileText className="h-4 w-4 text-red-600" aria-hidden />
                {ime}
                {typeof p !== "string" ? (
                  <span className="text-xs text-zinc-400">{Math.max(1, Math.round(p.velikost / 1024))} KB</span>
                ) : null}
              </>
            );
            const razred =
              "inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-800 ring-1 ring-zinc-200";
            return typeof p !== "string" && prilogaHref ? (
              <a
                key={`${ime}-${i}`}
                href={prilogaHref(p.indeks)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${razred} hover:ring-zinc-400`}
              >
                {vsebina}
              </a>
            ) : (
              <span key={`${ime}-${i}`} className={razred}>
                {vsebina}
              </span>
            );
          })}
        </div>
      ) : null}
      <iframe
        title={`Mail ${mail.zadeva}`}
        srcDoc={mail.html}
        sandbox=""
        className="mt-5 h-[1500px] w-full rounded-xl bg-white ring-1 ring-zinc-200"
      />
    </div>
  );
}
