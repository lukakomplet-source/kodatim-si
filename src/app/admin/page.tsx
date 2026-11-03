import { Suspense } from "react";
import Link from "next/link";
import { Folder, Inbox, Mail, Phone } from "lucide-react";
import ResumeCard from "@/components/dashboard/ResumeCard";
import {
  preberiCakaKodaTim,
  preberiDanesKodaTim,
  preberiDanesKompletko,
  preberiStevilkeKodaTim,
  preberiStevilkeKompletko,
  zdruziVrstice,
  type VrsticaDanes,
} from "@/lib/danes";
import { datum } from "@/lib/klicPanik";
import { preberiCaka, type CakaPosel } from "@/lib/komunikacija";
import { opisObsega } from "@/lib/obsegPrevoznika";
import { Osvezevanje } from "./nadzor/Osvezevanje";
import { kontekstDanes } from "./danes/kontekst";
import { NiPodatka, StevilkeDneva } from "./danes/StevilkeDneva";

/**
 * Danes (faza 4 »Danes in klici«, 3. 11. 2026): en seznam za oba posla, po stikalu posla, v vrstnem redu dela:
 * 1) odgovori, 2) dogovorjeni klici za danes, 3) klici (večji najprej), 4) maili za pregled. Zgoraj štiri številke
 * dneva proti cilju 10 + 10. Vsak vir, ki ne odgovori, pokaže »ni podatka«. Prodaja Kompletko vidi samo Kompletko.
 * Predajo v Promocije in sinhronizacijo leadov dela opravilo »KodaTim - Harvey predaja« vsakih 15 minut, ne stran.
 */

export const dynamic = "force-dynamic";

const NA_DANES = 5;
const POSEL = { kodatim: "KodaTim", kompletko: "Kompletko" } as const;

function Kratka({ v, oznaciPosel }: { v: VrsticaDanes; oznaciPosel: boolean }) {
  const obseg = v.obseg ? opisObsega(v.obseg) : "";
  const telefon = v.telefon.split(",")[0]?.trim();
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">
          {v.podjetje}
          {oznaciPosel ? <span className="ml-2 text-xs font-medium text-zinc-500">{POSEL[v.posel]}</span> : null}
        </p>
        <p className="text-sm text-zinc-500">
          {[v.razlog, v.vrsta === "dogovorjen" && v.kdaj ? datum(v.kdaj) : "", obseg].filter(Boolean).join(" · ")}
        </p>
        {v.odlomek ? <p className="mt-0.5 line-clamp-2 text-sm italic text-zinc-700">»{v.odlomek}«</p> : null}
      </div>
      {telefon ? (
        <a
          href={`tel:${telefon.replace(/[^\d+]/g, "")}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          <Phone className="h-4 w-4" aria-hidden />
          {telefon}
        </a>
      ) : (
        <span className="shrink-0 text-sm text-zinc-400">telefon: ni podatka</span>
      )}
    </li>
  );
}

function Skupina({
  st,
  naslov,
  vrstice,
  prikazi,
  oznaciPosel,
  prazno,
}: {
  st: number;
  naslov: string;
  vrstice: VrsticaDanes[];
  prikazi?: number;
  oznaciPosel: boolean;
  prazno: string;
}) {
  const vidne = prikazi ? vrstice.slice(0, prikazi) : vrstice;
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">
          {st}. {naslov} <span className="font-normal text-zinc-500">({vrstice.length})</span>
        </h2>
        {vrstice.length ? (
          <Link href="/admin/danes/klici" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            {prikazi && vrstice.length > prikazi ? `Vseh ${vrstice.length} v Klici →` : "Pokliči →"}
          </Link>
        ) : null}
      </div>
      {vidne.length ? (
        <ul className="mt-1 divide-y divide-zinc-100">
          {vidne.map((v) => (
            <Kratka key={v.kljuc} v={v} oznaciPosel={oznaciPosel} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-zinc-500">{prazno}</p>
      )}
    </section>
  );
}

/**
 * Maili za pregled (faza 5): ENA številka »čaka« iz lib/komunikacija.ts, ista kot v Komunikaciji in v meniju.
 * Kompletko: za poslat (najprej klic in dogovorjeni dan sta zraven); KodaTim: Odobritev + Hoteli v Outlooku.
 */
function VrsticaCaka({ ime, c, zraven }: { ime: string; c: CakaPosel | null; zraven: string }) {
  return (
    <span className="block text-sm text-zinc-700">
      {ime}: <NiPodatka vrednost={c?.caka} />
      {c?.caka != null && c.zraven ? (
        <span className="text-zinc-500">
          {" "}
          (+ {c.zraven} {zraven})
        </span>
      ) : null}
    </span>
  );
}

/** KodaTim (Harvey KodaTim, lahko traja): izriše se posebej, da Kompletko del ne čaka nanj. Mape so samo povezave. */
async function CakaKodaTim({ zMapami }: { zMapami: boolean }) {
  const [{ kodatim: c }, caka] = await Promise.all([
    preberiCaka({ kodatim: true, kompletko: false }),
    zMapami ? preberiCakaKodaTim().catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <>
      <VrsticaCaka ime="KodaTim" c={c} zraven="follow-upov čaka na prvi mail" />
      {zMapami && caka?.mape.length ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {caka.mape.map((m) => (
            <Link
              key={m.kljuc}
              href={`/admin/komunikacija?mapa=${encodeURIComponent(m.kljuc)}#mapa-${m.kljuc}`}
              className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition hover:border-zinc-400"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
                <Folder className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-zinc-900">{m.ime}</span>
                <span className="block text-xs text-zinc-500">
                  {m.zaPoslat} za poslat · {m.poslano} poslanih · {m.odgovoril} odpisalo
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ posel?: string }> }) {
  const k = await kontekstDanes((await searchParams).posel);
  if (!k.kompletko && !k.kodatim) {
    return (
      <div>
        <h1 className="text-3xl font-semibold text-zinc-900">Danes</h1>
        <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200">
          Za ta seznam nimate dodeljenega posla. Če ga potrebujete, pišite administratorju.
        </p>
      </div>
    );
  }
  const [kompletko, kodatim, stKompletko, stKodaTim, { kompletko: cakaKompletko }] = await Promise.all([
    k.kompletko ? preberiDanesKompletko() : Promise.resolve(null),
    k.kodatim ? preberiDanesKodaTim().catch(() => null) : Promise.resolve(null),
    k.kompletko ? preberiStevilkeKompletko(k.email) : Promise.resolve(null),
    k.kodatim ? preberiStevilkeKodaTim().catch(() => null) : Promise.resolve(null),
    preberiCaka({ kodatim: false, kompletko: k.kompletko }),
  ]);

  const vse = zdruziVrstice(kompletko?.seznam.danes, kodatim?.seznam.danes);
  const odgovori = vse.filter((v) => v.vrsta === "odgovor");
  const dogovorjeni = vse.filter((v) => v.vrsta === "dogovorjen");
  const klici = vse.filter((v) => v.vrsta === "klic");
  const oba = k.kompletko && k.kodatim;

  return (
    <div>
      <Osvezevanje vsakoS={90} />
      <h1 className="text-3xl font-semibold text-zinc-900">Danes</h1>
      <p className="mt-2 text-base text-zinc-500">
        {oba ? "KodaTim in Kompletko" : k.kodatim ? "KodaTim" : "Kompletko"}: najprej odgovori, potem dogovorjeni klici,
        klici in maili za pregled.
      </p>

      <StevilkeDneva kompletko={k.kompletko && stKompletko} kodatim={k.kodatim && stKodaTim} />

      {(k.kompletko && !kompletko) || (k.kodatim && !kodatim) ? (
        <div className="mt-4 space-y-2">
          {k.kompletko && !kompletko ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              Kompletko: ni podatka. Harvey Kompletko (5556) ne odgovarja ali še ne pozna seznama Danes.
            </p>
          ) : null}
          {k.kodatim && !kodatim ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              KodaTim: ni podatka. Promocij ni bilo mogoče prebrati.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        <Skupina
          st={1}
          naslov="Odgovori"
          vrstice={odgovori}
          oznaciPosel={oba}
          prazno="Danes ni novih odgovorov."
        />
        <Skupina
          st={2}
          naslov="Dogovorjeni klici za danes"
          vrstice={dogovorjeni}
          oznaciPosel={oba}
          prazno="Za danes ni dogovorjenih klicev."
        />
        <Skupina
          st={3}
          naslov="Klici, najprej večji"
          vrstice={klici}
          prikazi={NA_DANES}
          oznaciPosel={oba}
          prazno={kompletko || !k.kompletko ? "Danes ni več klicev na vrsti." : "ni podatka"}
        />

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
              <Mail className="h-4 w-4 text-zinc-400" aria-hidden />
              4. Maili za pregled
            </h2>
            <Link href="/admin/komunikacija" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
              Komunikacija › Pregled →
            </Link>
          </div>
          <p className="mt-1 text-sm text-zinc-500">Vse, kar čaka, da ga človek pregleda in pošlje.</p>
          <div className="mt-2 space-y-1">
            {k.kompletko ? (
              <VrsticaCaka ime="Kompletko za poslat" c={cakaKompletko} zraven="danes ne more (klic, dan, odgovor)" />
            ) : null}
            {k.kodatim ? (
              <Suspense fallback={<span className="block text-sm text-zinc-400">KodaTim: berem …</span>}>
                <CakaKodaTim zMapami={k.posel === "kodatim"} />
              </Suspense>
            ) : null}
          </div>
        </section>

        {k.kodatim && kodatim ? (
          <Link
            href="/admin/leads"
            className="group flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-400"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Inbox className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-zinc-900">
                {kodatim.leadovIzKlepeta} novih leadov iz klepeta (7 dni)
              </span>
              <span className="block text-sm text-zinc-500">KodaTim spletna stran</span>
            </span>
            <span className="shrink-0 text-sm font-medium text-zinc-400 group-hover:text-zinc-900">Poglej →</span>
          </Link>
        ) : null}
      </div>

      {k.posel === "kodatim" ? <ResumeCard /> : null}
    </div>
  );
}
