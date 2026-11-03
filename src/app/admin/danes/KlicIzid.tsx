"use client";

import { useState, useTransition } from "react";
import { Phone } from "lucide-react";
import { IZIDI, ZAVRNITVE, jutriLj, danesLj, preveriDogovorInSestanek, type IzidKlica } from "@/lib/klicPanik";
import { zabeleziKlicAkcija } from "../prodajna-ekipa/actions";
import { zabeleziKlicKodaTimAkcija } from "./actions";

/**
 * Vpis izida klica (prej KlicIzid v PanikKoraki.tsx). Faza 4: nov izid »Pokliči kasneje« z datumom (tudi za hladne
 * klice), pri »Sestanek« datum, ura in kraj, po shranjevanju `onShranjeno` (panel odpre naslednjo vrstico).
 * Kompletko gre v Harvey Kompletko (5556), KodaTim v Promocije.
 */

export const POLJE = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";

export type CiljKlica =
  | { posel: "kompletko"; domena: string; hladni: boolean }
  | { posel: "kodatim"; targetId: string; taskId: string | null };

/** Številke kot tel: gumbi; »ni podatka«, ko številke nimamo. */
export function Telefoni({ telefon }: { telefon?: string }) {
  const stevilke = (telefon ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!stevilke.length) return <span className="text-sm text-zinc-500">Telefon: ni podatka</span>;
  return (
    <>
      {stevilke.map((t) => (
        <a
          key={t}
          href={`tel:${t.replace(/[^\d+]/g, "")}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          <Phone className="h-4 w-4" aria-hidden />
          {t}
        </a>
      ))}
    </>
  );
}

const DODATNA_POLJA: IzidKlica[] = ["sestanek", "poklici_kasneje"];

export function ObrazecIzida({
  cilj,
  oseba: zacetnaOseba,
  komu: zacetniKomu,
  onShranjeno,
}: {
  cilj: CiljKlica;
  oseba?: string;
  komu?: string;
  onShranjeno?: () => void;
}) {
  const kompletko = cilj.posel === "kompletko";
  const [oseba, setOseba] = useState(zacetnaOseba ?? "");
  const [komu, setKomu] = useState(zacetniKomu ?? "");
  const [skrb, setSkrb] = useState("");
  const [opomba, setOpomba] = useState("");
  const [ocena, setOcena] = useState("");
  const [cena, setCena] = useState("");
  const [ugovor, setUgovor] = useState("");
  const [izbran, setIzbran] = useState<IzidKlica | null>(null);
  const [dogovor, setDogovor] = useState("");
  const [sDatum, setSDatum] = useState("");
  const [sUra, setSUra] = useState("");
  const [sKraj, setSKraj] = useState("");
  const [napaka, setNapaka] = useState("");
  const [poteka, zacni] = useTransition();

  const shrani = (izid: IzidKlica) => {
    const sestanek = izid === "sestanek" ? { sestanek_kdaj: sUra ? `${sDatum} ${sUra}` : sDatum, sestanek_kraj: sKraj } : {};
    const d = izid === "poklici_kasneje" ? dogovor : "";
    const preverjeno = preveriDogovorInSestanek(izid, d, sestanek);
    if ("napaka" in preverjeno) {
      setNapaka(preverjeno.napaka);
      return;
    }
    zacni(async () => {
      const r =
        cilj.posel === "kompletko"
          ? await zabeleziKlicAkcija(
              cilj.domena,
              izid,
              oseba,
              opomba,
              komu,
              skrb,
              cilj.hladni,
              { ocena, cena, ugovor },
              d,
              sestanek,
            )
          : await zabeleziKlicKodaTimAkcija(cilj.targetId, cilj.taskId, izid, opomba, d, sestanek);
      setNapaka(r.ok ? "" : (r.napaka ?? "Ni uspelo."));
      if (r.ok) {
        setIzbran(null);
        onShranjeno?.();
      }
    });
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-zinc-50 p-3">
      {kompletko ? (
        <>
          <label className="block text-sm text-zinc-700">
            Kaj jih skrbi (njihove besede)
            <input
              value={skrb}
              onChange={(e) => setSkrb(e.target.value)}
              placeholder="npr. kraja goriva na parkiriščih v Italiji"
              className={POLJE}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm text-zinc-700">
              Kako varni so vozniki danes (njihova ocena)
              <select value={ocena} onChange={(e) => setOcena(e.target.value)} className={POLJE}>
                <option value="">ni povedal</option>
                <option value="1">1, sploh ne</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5, povsem</option>
              </select>
            </label>
            <label className="block text-sm text-zinc-700">
              Glavni ugovor
              <select value={ugovor} onChange={(e) => setUgovor(e.target.value)} className={POLJE}>
                <option value="">brez ugovora</option>
                {ZAVRNITVE.map((z) => (
                  <option key={z.rece} value={z.rece}>
                    {z.rece}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {ugovor ? (
            <p className="rounded-lg bg-white px-3 py-2 text-sm text-zinc-700 ring-1 ring-zinc-200">
              »{ZAVRNITVE.find((z) => z.rece === ugovor)?.odgovor}«
              <span className="mt-0.5 block text-zinc-500">
                Zakaj deluje: {ZAVRNITVE.find((z) => z.rece === ugovor)?.zakaj}
              </span>
            </p>
          ) : null}
          <label className="block text-sm text-zinc-700">
            Koliko bi jih stal tak dogodek (njihove besede)
            <input
              value={cena}
              onChange={(e) => setCena(e.target.value)}
              placeholder="npr. vozilo dva dni stoji, stranka čaka"
              className={POLJE}
            />
          </label>
          <label className="block text-sm text-zinc-700">
            Kdo odloča (kar ti povedo)
            <input
              value={oseba}
              onChange={(e) => setOseba(e.target.value)}
              placeholder="npr. gospod Novak, vodja voznega parka"
              className={POLJE}
            />
          </label>
          <label className="block text-sm text-zinc-700">
            Komu pisati (mail, ki ti ga povedo)
            <input
              type="email"
              value={komu}
              onChange={(e) => setKomu(e.target.value)}
              placeholder="npr. novak@podjetje.si"
              className={POLJE}
            />
            <span className="mt-1 block text-xs text-zinc-500">
              Pri »Pošljite na mail« pripravim mail na ime: »vaš sodelavec mi je svetoval, naj vam pišem«. Za nagovor
              zgoraj napiši »gospod« ali »gospa« in priimek.
            </span>
          </label>
        </>
      ) : null}
      <label className="block text-sm text-zinc-700">
        Opomba
        <input
          value={opomba}
          onChange={(e) => setOpomba(e.target.value)}
          placeholder="npr. zanima ga cena za 5 vozil"
          className={POLJE}
        />
      </label>

      {izbran === "poklici_kasneje" ? (
        <label className="block text-sm text-zinc-700">
          Rekli so, naj pokličem dne
          <input
            type="date"
            min={jutriLj()}
            value={dogovor}
            onChange={(e) => setDogovor(e.target.value)}
            className={POLJE}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Do tega dne jim ne gre noben mail, na ta dan so na Danes med dogovorjenimi klici.
          </span>
        </label>
      ) : null}
      {izbran === "sestanek" ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block text-sm text-zinc-700">
            Datum sestanka
            <input type="date" min={danesLj()} value={sDatum} onChange={(e) => setSDatum(e.target.value)} className={POLJE} />
          </label>
          <label className="block text-sm text-zinc-700">
            Ura
            <input type="time" value={sUra} onChange={(e) => setSUra(e.target.value)} className={POLJE} />
          </label>
          <label className="block text-sm text-zinc-700">
            Kraj
            <input
              value={sKraj}
              onChange={(e) => setSKraj(e.target.value)}
              placeholder="npr. Teams ali pri njih v Celju"
              className={POLJE}
            />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        {izbran ? (
          <>
            <button
              type="button"
              disabled={poteka}
              onClick={() => shrani(izbran)}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              Shrani: {IZIDI.find((i) => i.izid === izbran)?.besedilo}
            </button>
            <button
              type="button"
              disabled={poteka}
              onClick={() => {
                setIzbran(null);
                setNapaka("");
              }}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 ring-1 ring-zinc-300 hover:bg-zinc-100 disabled:opacity-50"
            >
              Nazaj
            </button>
          </>
        ) : (
          IZIDI.map((i) => (
            <button
              key={i.izid}
              type="button"
              disabled={poteka}
              onClick={() => {
                setNapaka("");
                if (DODATNA_POLJA.includes(i.izid)) setIzbran(i.izid);
                else shrani(i.izid);
              }}
              title={i.razlaga}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 ring-1 ring-zinc-300 hover:bg-zinc-100 disabled:opacity-50"
            >
              {i.besedilo}
            </button>
          ))
        )}
      </div>
      {napaka ? <p className="text-sm text-red-700">{napaka}</p> : null}
    </div>
  );
}
