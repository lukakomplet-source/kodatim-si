import { Suspense } from "react";
import { preberiOdgovoreKodaTim, preberiOdgovoreKompletko } from "@/lib/komunikacija";
import { povezavaZa, povezavePodjetij } from "@/lib/povezavaPodjetja";
import { kontekstKomunikacije } from "../kontekst";
import { NaslovPosla, Opozorilo, PogledMaila, PovezavaPodjetja, kdaj } from "../skupno";

/**
 * Komunikacija › Odgovori (faza 5): kdo je odpisal, za oba posla po stikalu, z njihovimi besedami, »Poglej mail«
 * in povezavo na podjetje. KodaTim samo za administratorja. Stara stran /admin/prodajna-ekipa/bralec_odgovorov
 * pride sem.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Odgovori" };

const NAMENI: Record<string, string> = {
  interested: "zanima jih",
  not_interested: "ne zanima jih",
  objection: "pomislek",
  question: "vprašanje",
  meeting_request: "želijo sestanek",
  out_of_office: "odsotni",
  unsubscribe: "odjava",
  referral: "napotili na drugega",
};
const NALAGAM = <p className="text-sm text-zinc-400">Berem …</p>;

function Odlomek({ besedilo }: { besedilo: string }) {
  if (!besedilo) return null;
  return (
    <p className="mt-1.5 line-clamp-3 whitespace-pre-line rounded-lg border-l-2 border-emerald-400 bg-emerald-50/60 px-3 py-1.5 text-sm text-zinc-800">
      {besedilo}
    </p>
  );
}

async function Kompletko({ smeLeade }: { smeLeade: boolean }) {
  const o = await preberiOdgovoreKompletko();
  if (!o) return <Opozorilo>Kompletko: ni podatka. Harvey Kompletko (5556) ne odgovarja.</Opozorilo>;
  const povezave = await povezavePodjetij(o.odgovori, smeLeade);
  return (
    <div>
      <NaslovPosla posel="kompletko" st={o.skupaj} opis="odgovori na hladne maile panik gumba" />
      {o.odgovori.length ? (
        <ul className="divide-y divide-zinc-100 rounded-2xl bg-white ring-1 ring-zinc-200">
          {o.odgovori.map((r) => (
            <li key={r.domena} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">{r.podjetje || r.domena}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {r.email} · {kdaj(r.kdaj)}
                    {r.stanje ? ` · ${r.stanje.replace("_", " ")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <PogledMaila href={`/admin/komunikacija/odgovor/${encodeURIComponent(r.domena)}`} />
                  <PovezavaPodjetja povezava={povezavaZa(povezave, r)} />
                </div>
              </div>
              <Odlomek besedilo={r.odlomek} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Še nihče ni odpisal.</p>
      )}
    </div>
  );
}

async function KodaTim({ smeLeade }: { smeLeade: boolean }) {
  const o = await preberiOdgovoreKodaTim();
  if (!o) {
    return (
      <div>
        <NaslovPosla posel="kodatim" st={null} />
        <Opozorilo>KodaTim: ni podatka. Harvey KodaTim (5555) ne odgovarja ali še ni ponovno zagnan.</Opozorilo>
      </div>
    );
  }
  const povezave = await povezavePodjetij(o.odgovori, smeLeade);
  return (
    <div>
      <NaslovPosla posel="kodatim" st={o.skupaj} opis="Harvey in Hoteli" />
      {o.odgovori.length ? (
        <ul className="divide-y divide-zinc-100 rounded-2xl bg-white ring-1 ring-zinc-200">
          {o.odgovori.map((r) => {
            return (
              <li key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{r.podjetje || r.email}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {r.email} · {kdaj(r.kdaj)}
                      {r.namen ? ` · ${NAMENI[r.namen] ?? r.namen}` : ""}
                      {r.mapa ? ` · ${r.mapa}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <PogledMaila href={`/admin/komunikacija/pogovor/${encodeURIComponent(r.id)}`} />
                    <PovezavaPodjetja povezava={povezavaZa(povezave, r)} />
                  </div>
                </div>
                <Odlomek besedilo={r.odlomek} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Še nihče ni odpisal.</p>
      )}
    </div>
  );
}

export default async function KomunikacijaOdgovoriPage({ searchParams }: { searchParams: Promise<{ posel?: string }> }) {
  const k = await kontekstKomunikacije((await searchParams).posel);
  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Odgovori</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Kdo je odpisal in kaj. Klic po odgovoru je na Danes; tu prebereš cel mail.
      </p>
      <div className="mt-6 space-y-10">
        {k.kompletko ? (
          <section>
            <Suspense fallback={NALAGAM}>
              <Kompletko smeLeade={k.smeLeade} />
            </Suspense>
          </section>
        ) : null}
        {k.kodatim ? (
          <section>
            <Suspense fallback={NALAGAM}>
              <KodaTim smeLeade={k.smeLeade} />
            </Suspense>
          </section>
        ) : null}
      </div>
    </div>
  );
}
