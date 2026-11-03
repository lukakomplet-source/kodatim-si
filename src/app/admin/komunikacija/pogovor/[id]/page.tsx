import Link from "next/link";
import { notFound } from "next/navigation";
import { zahtevajStran } from "@/lib/require-admin";
import { preberiMail } from "@/lib/komunikacija";
import { Opozorilo, kdaj } from "../../skupno";

/** »Poglej mail« za KodaTim odgovor: cel pogovor (njihovi maili in naši), iz Harveyjeve baze. Samo administrator. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Pogovor" };

type Pogovor = {
  id: string;
  podjetje: string;
  email: string;
  namen: string;
  sporocila: { od: "mi" | "oni"; besedilo: string; cas: string | null }[];
};

export default async function PogovorPage({ params }: { params: Promise<{ id: string }> }) {
  await zahtevajStran();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const { status, data } = await preberiMail("kodatim-pogovor", id);
  const p = data as Pogovor | null;
  return (
    <div className="max-w-3xl">
      <Link href="/admin/komunikacija/odgovori" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Odgovori
      </Link>
      {!p || !Array.isArray(p.sporocila) ? (
        <div className="mt-3">
          <Opozorilo>{status === 404 ? "Tega pogovora ni." : "Harvey KodaTim (5555) ne odgovarja ali še ni ponovno zagnan."}</Opozorilo>
        </div>
      ) : (
        <>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{p.podjetje || p.email}</h1>
          <p className="mt-1 text-sm text-zinc-500">{p.email}</p>
          <ol className="mt-5 space-y-3">
            {p.sporocila.map((s, i) => (
              <li
                key={i}
                className={`rounded-xl px-4 py-3 ring-1 ${s.od === "oni" ? "bg-emerald-50/60 ring-emerald-200" : "bg-white ring-zinc-200"}`}
              >
                <p className="text-xs font-medium text-zinc-500">
                  {s.od === "oni" ? "Oni" : "Mi"}
                  {s.cas ? ` · ${kdaj(s.cas)}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-zinc-800">{s.besedilo}</p>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
