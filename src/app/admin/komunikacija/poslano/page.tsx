import { Suspense } from "react";
import { preberiPoslanoKodaTim, preberiPoslanoKompletko, type IzAdmina } from "@/lib/komunikacija";
import { povezavaZa, povezavePodjetij } from "@/lib/povezavaPodjetja";
import { kontekstKomunikacije } from "../kontekst";
import { NaslovPosla, Opozorilo, PogledMaila, PovezavaPodjetja, kdaj } from "../skupno";

/**
 * Komunikacija › Poslano (faza 5): poslani maili obeh poslov, po stikalu. Vsaka vrstica ima »Poglej mail« in
 * povezavo na podjetje (kartica leada, če ga imamo, sicer njihova stran). KodaTim samo za administratorja.
 * Stara stran /admin/prodajna-ekipa/posiljatelj pride sem.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Poslano" };

const VRSTA = { prvi: "prvi mail", follow_up: "follow-up", odgovor: "odgovor" } as const;
const NALAGAM = <p className="text-sm text-zinc-400">Berem …</p>;

/** Pošiljanje iz admina: prvi (edini) prejemnik vrstice dnevnika. */
function prejemnik(a: IzAdmina): { email: string; domena: string } {
  return { email: a.komu.split(",")[0]?.trim() ?? "", domena: a.domena };
}

async function Kompletko({ smeLeade }: { smeLeade: boolean }) {
  const p = await preberiPoslanoKompletko();
  if (!p) return <Opozorilo>Kompletko: ni podatka. Harvey Kompletko (5556) ne odgovarja.</Opozorilo>;
  const povezave = await povezavePodjetij([...p.poslano, ...p.izAdmina.map(prejemnik)], smeLeade);
  return (
    <div className="space-y-4">
      <NaslovPosla posel="kompletko" st={p.skupaj} opis="panik gumb, luka@kompletko.com" />
      {p.izAdmina.length ? (
        <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-200">
          <p className="text-sm font-semibold text-zinc-900">Poslano iz admina ({p.izAdmina.length})</p>
          <ul className="mt-1 divide-y divide-zinc-100 text-sm">
            {p.izAdmina.map((a, i) => (
              <li key={a.id ?? `${a.cas}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-zinc-800">
                    {a.komu} <span className="text-zinc-500">· {a.zadeva}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {kdaj(a.cas)} · {a.kdo}
                    {a.v_poslano ? "" : " · kopija v Poslano ni uspela"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {a.id && a.v_poslano ? <PogledMaila href={`/admin/komunikacija/poslano/${a.id}`} /> : null}
                  <PovezavaPodjetja povezava={povezavaZa(povezave, prejemnik(a))} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.poslano.length ? (
        <ul className="divide-y divide-zinc-100 rounded-2xl bg-white ring-1 ring-zinc-200">
          {p.poslano.map((r) => (
            <li key={r.domena} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">{r.podjetje || r.domena}</p>
                <p className="truncate text-xs text-zinc-500">
                  {r.email} · {kdaj(r.zadnje_poslano || r.poslano)}
                  {r.stevilo_poslanih > 1 ? ` · ${r.stevilo_poslanih} mailov` : ""}
                  {r.varianta ? ` · varianta ${r.varianta}` : ""}
                </p>
                {r.zadeva ? <p className="truncate text-xs text-zinc-600">Zadeva: {r.zadeva}</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <PogledMaila href={`/admin/prodajna-ekipa/poslano/${encodeURIComponent(r.domena)}`} />
                <PovezavaPodjetja povezava={povezavaZa(povezave, r)} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Še nič poslano.</p>
      )}
    </div>
  );
}

async function KodaTim({ smeLeade }: { smeLeade: boolean }) {
  const p = await preberiPoslanoKodaTim();
  if (!p) {
    return (
      <div>
        <NaslovPosla posel="kodatim" st={null} />
        <Opozorilo>KodaTim: ni podatka. Harvey KodaTim (5555) ne odgovarja ali še ni ponovno zagnan.</Opozorilo>
      </div>
    );
  }
  const povezave = await povezavePodjetij(p.poslano, smeLeade);
  return (
    <div>
      <NaslovPosla posel="kodatim" st={p.skupaj} opis="Harvey in Hoteli iz Outlooka, luka@kodatim.si" />
      {p.poslano.length ? (
        <ul className="divide-y divide-zinc-100 rounded-2xl bg-white ring-1 ring-zinc-200">
          {p.poslano.map((r) => {
            // Outlook (Hoteli) first mail: the copy from Sent, exactly as it went out (Harvey's viewer reads the step-1
            // mail of that company, so only for »prvi«); a follow-up, a reply and Harvey's own mails: this row's text.
            const mail =
              r.kanal === "outlook" && r.prospect_id && r.vrsta === "prvi"
                ? `/admin/prodajna-ekipa/poslano-kodatim/${encodeURIComponent(r.prospect_id)}`
                : `/admin/komunikacija/mail/${encodeURIComponent(r.id)}`;
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">{r.podjetje || r.email}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {r.email} · {kdaj(r.poslano)} · {VRSTA[r.vrsta] ?? r.vrsta}
                    {r.mapa ? ` · ${r.mapa}` : ""}
                    {r.kanal === "outlook" ? " · iz Outlooka" : ""}
                  </p>
                  {r.zadeva ? <p className="truncate text-xs text-zinc-600">Zadeva: {r.zadeva}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <PogledMaila href={mail} />
                  <PovezavaPodjetja povezava={povezavaZa(povezave, r)} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Še nič poslano.</p>
      )}
    </div>
  );
}

export default async function KomunikacijaPoslanoPage() {
  const k = await kontekstKomunikacije();
  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Poslano</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">Kaj je šlo ven, komu in kdaj. Najnovejše zgoraj.</p>
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
