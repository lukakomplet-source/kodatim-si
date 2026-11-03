"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { VrsticaDanes } from "@/lib/danes";
import { datum } from "@/lib/klicPanik";
import { opisObsega } from "@/lib/obsegPrevoznika";
import { ObrazecIzida, Telefoni, type CiljKlica } from "./KlicIzid";
import { PreveriKontakt, RocniKlic } from "./KontaktOrodja";
import { ScenarijKlica } from "./ScenarijKlica";

/**
 * Danes › Klici: seznam klicev za danes, odprta je ena vrstica naenkrat. Po shranjenem izidu se odpre naslednja,
 * strežnik (revalidatePath v akciji) pa osveži seznam in številke dneva.
 */

const SKUPINE: { vrsta: VrsticaDanes["vrsta"]; naslov: string }[] = [
  { vrsta: "odgovor", naslov: "Odgovorili so: pokliči čim prej" },
  { vrsta: "dogovorjen", naslov: "Dogovorjeni klici" },
  { vrsta: "klic", naslov: "Klici: najprej večji" },
];

const POSEL: Record<VrsticaDanes["posel"], string> = { kodatim: "KodaTim", kompletko: "Kompletko" };

function ciljVrstice(v: VrsticaDanes, smeKompletko: boolean): CiljKlica | null {
  if (v.posel === "kompletko" && v.domena && smeKompletko) return { posel: "kompletko", domena: v.domena, hladni: v.hladni };
  if (v.posel === "kodatim" && v.targetId) return { posel: "kodatim", targetId: v.targetId, taskId: v.taskId ?? null };
  return null;
}

function Vrstica({
  v,
  odprta,
  oznaciPosel,
  onPreklop,
  onShranjeno,
  smeKompletko,
}: {
  v: VrsticaDanes;
  odprta: boolean;
  oznaciPosel: boolean;
  onPreklop: () => void;
  onShranjeno: () => void;
  smeKompletko: boolean;
}) {
  const cilj = ciljVrstice(v, smeKompletko);
  const obseg = v.obseg ? opisObsega(v.obseg) : "";
  const podrobnosti = [
    v.kraj,
    v.email,
    v.oseba ? `odloča: ${v.oseba}` : "",
    v.vrsta === "dogovorjen" && v.kdaj ? `dogovorjeno za ${datum(v.kdaj)}` : "",
  ].filter(Boolean);
  return (
    <li className={`py-3 ${odprta ? "bg-white" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-base font-semibold text-zinc-900">
          {v.podjetje}
          {oznaciPosel ? (
            <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600">{POSEL[v.posel]}</span>
          ) : null}
        </p>
        <span className="text-sm font-medium text-zinc-700">{v.razlog}</span>
      </div>
      {podrobnosti.length ? <p className="mt-0.5 text-sm text-zinc-500">{podrobnosti.join(" · ")}</p> : null}
      {obseg ? <p className="mt-0.5 text-sm font-medium text-zinc-700">{obseg}</p> : null}
      {v.odlomek ? <p className="mt-1 text-sm italic text-zinc-700">»{v.odlomek}«</p> : null}
      {v.opomba ? <p className="mt-0.5 text-sm text-zinc-500">Opomba: {v.opomba}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Telefoni telefon={v.telefon} />
        {cilj ? (
          <button
            type="button"
            onClick={onPreklop}
            aria-expanded={odprta}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
          >
            Vpiši izid
            <ChevronDown className={`h-4 w-4 transition-transform ${odprta ? "rotate-180" : ""}`} aria-hidden />
          </button>
        ) : null}
        {v.povezava ? (
          <Link href={v.povezava} className="text-sm font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-900">
            Odpri v Promocijah
          </Link>
        ) : null}
      </div>
      {v.najprejKlic ? (
        <p className="mt-1 text-sm text-zinc-500">
          Če ne dvigne, vpiši »Ni dvignil«; follow-up mail pripravim šele potem, med maili za pregled.
        </p>
      ) : null}
      {odprta && cilj ? (
        <ObrazecIzida key={v.kljuc} cilj={cilj} oseba={v.oseba} onShranjeno={onShranjeno} />
      ) : null}
    </li>
  );
}

export function KlicniPanel({
  vrstice,
  imeKlicatelja,
  kompletko,
  klici,
}: {
  vrstice: VrsticaDanes[];
  imeKlicatelja: string;
  /** Pokaži scenarij klica Kompletko. */
  kompletko: boolean;
  /** Sme vpisati izid klica Kompletko, preveriti kontakt in vpisati klic zunaj seznama (kompletko.calls). */
  klici: boolean;
}) {
  const [odprta, setOdprta] = useState<string | null>(vrstice[0]?.kljuc ?? null);
  const [scenarij, setScenarij] = useState(false);
  const [rocni, setRocni] = useState(false);
  const oznaciPosel = new Set(vrstice.map((v) => v.posel)).size > 1;

  const naslednja = (kljuc: string) => {
    const i = vrstice.findIndex((v) => v.kljuc === kljuc);
    setOdprta(vrstice[i + 1]?.kljuc ?? null);
  };

  const gumb =
    "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50";

  return (
    <div className="space-y-4">
      {kompletko ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setScenarij((s) => !s)} aria-expanded={scenarij} className={gumb}>
              Scenarij klica
              <ChevronDown className={`h-4 w-4 transition-transform ${scenarij ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {klici ? (
              <button type="button" onClick={() => setRocni((s) => !s)} aria-expanded={rocni} className={gumb}>
                Klic, ki ga ni na seznamu
                <ChevronDown className={`h-4 w-4 transition-transform ${rocni ? "rotate-180" : ""}`} aria-hidden />
              </button>
            ) : null}
          </div>
          {scenarij ? (
            <div className="rounded-xl bg-zinc-50 p-4">
              <ScenarijKlica ime={imeKlicatelja} />
            </div>
          ) : null}
          {klici && rocni ? <RocniKlic /> : null}
          {klici ? <PreveriKontakt /> : null}
        </div>
      ) : null}

      {vrstice.length ? (
        SKUPINE.map((s) => {
          const njene = vrstice.filter((v) => v.vrsta === s.vrsta);
          if (!njene.length) return null;
          return (
            <section key={s.vrsta} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 sm:p-5">
              <h2 className="text-base font-semibold text-zinc-900">
                {s.naslov} ({njene.length})
              </h2>
              <ul className="mt-1 divide-y divide-zinc-100">
                {njene.map((v) => (
                  <Vrstica
                    key={v.kljuc}
                    v={v}
                    odprta={odprta === v.kljuc}
                    oznaciPosel={oznaciPosel}
                    onPreklop={() => setOdprta((o) => (o === v.kljuc ? null : v.kljuc))}
                    onShranjeno={() => naslednja(v.kljuc)}
                    smeKompletko={klici}
                  />
                ))}
              </ul>
            </section>
          );
        })
      ) : (
        <p className="rounded-xl bg-white px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200">
          Danes ni več klicev na vrsti.
        </p>
      )}
    </div>
  );
}
