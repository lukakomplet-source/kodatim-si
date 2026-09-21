"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Napredek, VrsticaRegistra } from "@/lib/registerPodjetij";
import { VrsticaNapredka } from "./VrsticaNapredka";

/**
 * Seznam podjetij, ki se nalaga ob drsenju, in vrstica napredka na dnu.
 *
 * Zakaj ne strani po sto: register ima ~253.000 vrstic in listanje po njih
 * pomeni, da človek nikoli ne dobi občutka celote. Ob drsenju se paketi
 * dodajajo sami, spodaj pa ves čas piše, koliko jih je naloženih od koliko.
 *
 * Zakaj vseeno obstaja meja: vsaka vrstica je dvanajst celic v DOM-u. Pri
 * desetih tisočih je brskalnik še spodoben, pri sto tisočih se ustavi — in
 * zamrznjena stran ni boljša od strani s številkami. Zato se nalaganje pri
 * meji ustavi in jasno pove, da je treba zožiti iskanje ali odpreti Excel,
 * ki ima vse.
 */

const MEJA_VRSTIC = 10_000;

function stevilo(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("sl-SI") : "—";
}

/**
 * Zakaj je polje prazno: še ni na vrsti, kartica nima podatka, ali pa se
 * kartica po treh poskusih ni odprla in se ne bo. „Čaka“ pri zadnjem primeru
 * bi obljubljalo nekaj, kar se ne bo zgodilo.
 */
function Stanje({ v }: { v: VrsticaRegistra }) {
  if (v.detajli_ob) return <span className="text-zinc-300">ni</span>;
  if ((v.detajli_poskusi ?? 0) >= 3) return <span className="text-zinc-400" title="kartica se po treh poskusih ni odprla">ne bo</span>;
  return <span className="text-amber-600">čaka</span>;
}

export function Seznam({
  zacetne,
  skupaj,
  zacetniZadnjiId,
  zacetnoSe,
  poizvedba,
  zacetniNapredek,
}: {
  zacetne: VrsticaRegistra[];
  skupaj: number | null;
  zacetniZadnjiId: number | null;
  zacetnoSe: boolean;
  /** Filtri v obliki iskalnega niza, da jih API dobi enake kot stran. */
  poizvedba: string;
  zacetniNapredek: Napredek | null;
}) {
  const [vrstice, setVrstice] = useState<VrsticaRegistra[]>(zacetne);
  const [zadnjiId, setZadnjiId] = useState<number | null>(zacetniZadnjiId);
  const [se, setSe] = useState(zacetnoSe);
  const [nalaga, setNalaga] = useState(false);
  const [napaka, setNapaka] = useState<string | null>(null);
  const strazar = useRef<HTMLDivElement | null>(null);
  // Brez te zastavice bi opazovalec ob hitrem drsenju sprožil tri zahteve za
  // isti paket, preden bi se prva vrnila, in vrstice bi se podvojile.
  const vTeku = useRef(false);

  const naloziNaslednje = useCallback(async () => {
    if (vTeku.current || !se || zadnjiId === null) return;
    if (vrstice.length >= MEJA_VRSTIC) return;
    vTeku.current = true;
    setNalaga(true);
    setNapaka(null);
    try {
      const url = `/api/admin/register-podjetij?${poizvedba}${poizvedba ? "&" : ""}po=${zadnjiId}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`strežnik je vrnil ${r.status}`);
      const telo = (await r.json()) as {
        vrstice: VrsticaRegistra[];
        zadnjiId: number | null;
        se: boolean;
      };
      setVrstice((prej) => {
        // Če bi paket iz kakršnegakoli razloga prinesel že naloženo vrstico,
        // jo tu spustimo — seznam se ne sme podvajati.
        const zeImamo = new Set(prej.map((v) => v.id));
        return [...prej, ...telo.vrstice.filter((v) => !zeImamo.has(v.id))];
      });
      setZadnjiId(telo.zadnjiId);
      setSe(telo.se);
    } catch (e) {
      setNapaka(e instanceof Error ? e.message : "Nalaganje ni uspelo.");
      // Ob napaki ne poskušamo znova sami: opazovalec bi v zanki bombardiral
      // strežnik. Uporabnik ima gumb.
      setSe(false);
    } finally {
      vTeku.current = false;
      setNalaga(false);
    }
  }, [poizvedba, se, zadnjiId, vrstice.length]);

  useEffect(() => {
    const el = strazar.current;
    if (!el || !se) return;
    const opazovalec = new IntersectionObserver(
      (vnosi) => {
        if (vnosi.some((v) => v.isIntersecting)) void naloziNaslednje();
      },
      // Naložimo, preden dno res pride na zaslon — drsenje tako ne zastane.
      { rootMargin: "600px" }
    );
    opazovalec.observe(el);
    return () => opazovalec.disconnect();
  }, [naloziNaslednje, se]);

  const dosezenaMeja = vrstice.length >= MEJA_VRSTIC;

  return (
    <>
      <div className="mt-4 overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200">
        <table className="w-full text-left text-xs">
          {/* Glava ni lepljiva: tabela je v vodoravnem drsniku, ki se navpično ne premika, zato se v praksi ne bi prijela. */}
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              {[
                "Naziv",
                "Matična",
                "Davčna",
                "Naslov",
                "Kraj",
                "Občina",
                "SKD",
                "E-pošta",
                "Telefon",
                "Splet",
                "Direktor",
                "Stanje",
              ].map((g) => (
                <th key={g} className="px-3 py-2 font-medium whitespace-nowrap">
                  {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vrstice.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-4 text-zinc-400">
                  Ni zadetkov za te filtre.
                </td>
              </tr>
            )}
            {vrstice.map((v) => (
              <tr key={v.id} className="border-t border-zinc-100 align-top text-zinc-800">
                <td className="max-w-[24rem] px-3 py-1.5">
                  <a
                    href={v.detail_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {v.naziv ?? "—"}
                  </a>
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">{v.maticna ?? "—"}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{v.davcna ?? "—"}</td>
                <td className="max-w-[16rem] px-3 py-1.5">{v.naslov ?? "—"}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{[v.posta, v.kraj].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{v.obcina ?? "—"}</td>
                <td className="px-3 py-1.5 whitespace-nowrap" title={v.skd_naziv ?? ""}>
                  {v.skd ?? "—"}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {v.eposta ? (
                    <a href={`mailto:${v.eposta}`} className="text-zinc-900 hover:underline">
                      {v.eposta}
                    </a>
                  ) : (
                    <Stanje v={v} />
                  )}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {v.telefon ?? <Stanje v={v} />}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-1.5">
                  {v.spletna_stran ? (
                    <a href={v.spletna_stran} target="_blank" rel="noreferrer" className="text-zinc-900 hover:underline">
                      {v.spletna_stran.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    <Stanje v={v} />
                  )}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-1.5">{v.direktor ?? "—"}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {v.ni_vec_od ? (
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-800">
                      ni več od {v.ni_vec_od.slice(0, 10)}
                    </span>
                  ) : (
                    <span className="text-zinc-400">v registru</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div ref={strazar} className="h-4" />

      <div className="mt-3 text-center text-xs text-zinc-500">
        {nalaga && "nalagam …"}
        {!nalaga && napaka && (
          <span className="text-red-700">
            {napaka}{" "}
            <button
              type="button"
              onClick={() => {
                setSe(true);
                void naloziNaslednje();
              }}
              className="underline"
            >
              poskusi znova
            </button>
          </span>
        )}
        {!nalaga && !napaka && dosezenaMeja && se && (
          <span className="text-amber-700">
            Naloženih {stevilo(vrstice.length)} vrstic — več jih brskalnik ne prenese gladko. Zoži iskanje ali odpri
            dnevni Excel, ki ima vse.
          </span>
        )}
        {!nalaga && !napaka && !se && vrstice.length > 0 && "naloženo vse, kar ustreza filtrom"}
      </div>

      <VrsticaNapredka zacetni={zacetniNapredek} nalozenih={vrstice.length} skupaj={skupaj} />
    </>
  );
}
