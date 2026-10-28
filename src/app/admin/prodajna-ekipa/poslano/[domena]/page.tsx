import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Poslan mail za panik gumb, točno tak, kot je šel ven (Luka, 28. 10. 2026: »da tule lahka vidim te poslane
 * pač kak so zgledali pa animacija pa datoteke pa vse«). Vir je Poslano na luka@kompletko.com (Harvey bere
 * samo za branje); besedilo je v iframe brez skript, slike so vgrajene, priloge se odprejo posamično.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Poslan mail" };

const HARVEY = process.env.HARVEY_KODATIM_URL ?? "http://127.0.0.1:5555";

type PoslanMail = {
  za: string;
  od: string;
  zadeva: string;
  datum: string;
  html: string;
  priloge: { indeks: number; ime: string; tip: string; velikost: number }[];
};

export default async function PoslanMailPage({ params }: { params: Promise<{ domena: string }> }) {
  await requireAdmin();
  const { domena } = await params;
  if (!/^[a-z0-9][a-z0-9.-]{1,80}\.[a-z]{2,}$/.test(domena)) notFound();

  let mail: PoslanMail | null = null;
  let napaka = "";
  try {
    const r = await fetch(`${HARVEY}/api/mape/poslano/${domena}`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
    if (r.ok) mail = (await r.json()) as PoslanMail;
    else napaka = r.status === 404 ? "Tega maila ni v mapi Poslano." : "Predal luka@kompletko.com trenutno ni dosegljiv.";
  } catch {
    napaka = "Harvey ne odgovarja (5555).";
  }

  return (
    <div className="max-w-4xl">
      <Link href="/admin/prodajna-ekipa/odobritev" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Odobritev
      </Link>
      {mail ? (
        <>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{mail.zadeva}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Za {mail.za} · od {mail.od} ·{" "}
            {new Date(mail.datum).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })}
          </p>
          {mail.priloge.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {mail.priloge.map((p) => (
                <a
                  key={p.indeks}
                  href={`/api/admin/prodajna-ekipa/poslano/${domena}/priloga/${p.indeks}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-800 ring-1 ring-zinc-200 hover:ring-zinc-400"
                >
                  <FileText className="h-4 w-4 text-red-600" aria-hidden />
                  {p.ime}
                  <span className="text-xs text-zinc-400">{Math.max(1, Math.round(p.velikost / 1024))} KB</span>
                </a>
              ))}
            </div>
          ) : null}
          <iframe
            title={`Mail za ${mail.za}`}
            srcDoc={mail.html}
            sandbox=""
            className="mt-5 h-[1500px] w-full rounded-xl bg-white ring-1 ring-zinc-200"
          />
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{napaka}</p>
      )}
    </div>
  );
}
