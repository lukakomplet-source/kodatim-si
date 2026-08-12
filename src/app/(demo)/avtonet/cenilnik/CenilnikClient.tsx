"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Camera,
  ExternalLink,
  Gauge,
  Link2,
  Loader2,
  Pencil,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { Cenitev, Primerljiv } from "@/lib/avtonet/cenilnik/cenitev";
import type { BranjeRezultat } from "@/lib/avtonet/cenilnik/branje";
import type { AiRazlaga } from "@/lib/avtonet/cenilnik/aiPrimerjava";
import {
  OZNAKE_GORIVA,
  OZNAKE_KAROSERIJE,
  OZNAKE_MENJALNIKA,
  OZNAKE_POGONA,
  oznakaZnacilke,
} from "@/lib/avtonet/cenilnik/vozilo";

/**
 * The valuation screen.
 *
 * Two things drive the layout. First, the headline number has to be readable at
 * a glance, because that is what the user came for. Second — and this is the
 * part that makes it usable for a dealer — every number is followed by what it
 * was computed from: how many cars, how similar, how spread out. A confident
 * figure with no sample size behind it is exactly the thing this product must
 * not ship.
 */

type Odgovor = { branje: BranjeRezultat; cenitev: Cenitev; razlaga: AiRazlaga | null };

type Nacin = "povezava" | "slika" | "rocno";

const eur = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Math.round(v).toLocaleString("sl-SI")} €`;

const stevilo = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : Math.round(v).toLocaleString("sl-SI");

export function CenilnikClient() {
  const [nacin, setNacin] = useState<Nacin>("povezava");
  const [url, setUrl] = useState("");
  const [slike, setSlike] = useState<string[]>([]);
  const [rocno, setRocno] = useState({
    znamka: "", model: "", verzija: "", letnik: "", km: "", kw: "", gorivo: "", menjalnik: "",
    pogon: "", karoserija: "",
  });
  const [rocnoBesedilo, setRocnoBesedilo] = useState("");
  const [tece, setTece] = useState(false);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [odgovor, setOdgovor] = useState<Odgovor | null>(null);
  const datotekaRef = useRef<HTMLInputElement>(null);

  async function naloziSlike(files: FileList | null) {
    if (!files) return;
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      // 8 MB is generous for a screenshot and keeps the request well inside
      // what the API route will accept.
      if (f.size > 8 * 1024 * 1024) {
        setNapaka(`Slika ${f.name} je prevelika (največ 8 MB).`);
        continue;
      }
      out.push(
        await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error("Branje slike ni uspelo."));
          r.readAsDataURL(f);
        })
      );
    }
    setSlike(out);
  }

  async function oceni() {
    setTece(true);
    setNapaka(null);
    setOdgovor(null);
    try {
      const telo =
        nacin === "povezava"
          ? { nacin: "povezava", url }
          : nacin === "slika"
            ? { nacin: "slika", slike }
            : { nacin: "rocno", vozilo: rocno, besedilo: rocnoBesedilo, slike };

      const res = await fetch("/api/avtonet/cenitev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telo),
      });
      const data = await res.json();
      if (!res.ok) {
        setNapaka(data?.napaka ?? "Cenitev ni uspela.");
        return;
      }
      setOdgovor(data as Odgovor);
    } catch (err) {
      setNapaka(err instanceof Error ? err.message : "Cenitev ni uspela.");
    } finally {
      setTece(false);
    }
  }

  const pripravljen =
    nacin === "povezava" ? /^https?:\/\//i.test(url.trim())
      : nacin === "slika" ? slike.length > 0
        : rocno.znamka.trim().length > 1 || rocnoBesedilo.trim().length > 20 || slike.length > 0;

  return (
    <div className="mt-6">
      {/* ---------- Vnos ---------- */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {([
            ["povezava", "Povezava do oglasa", Link2],
            ["slika", "Posnetek zaslona", Camera],
            ["rocno", "Ročni vnos", Pencil],
          ] as const).map(([k, oznaka, Ikona]) => (
            <button
              key={k}
              type="button"
              onClick={() => setNacin(k)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                nacin === k
                  ? "bg-accent text-white"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              <Ikona className="h-3.5 w-3.5" />
              {oznaka}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {nacin === "povezava" && (
            <div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://suchen.mobile.de/…  ali  https://www.avto.net/Ads/details.asp?id=…"
                className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                Če je oglas z Avto.neta in ga že imamo v bazi, uporabimo svoje podatke — brez ugibanja.
              </p>
            </div>
          )}

          {nacin === "slika" && (
            <div>
              <input
                ref={datotekaRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void naloziSlike(e.target.files)}
                className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
              />
              {slike.length > 0 && (
                <p className="mt-2 text-xs text-zinc-500">Naloženih posnetkov: {slike.length}</p>
              )}
              <p className="mt-1.5 text-xs text-zinc-500">
                Najbolje deluje posnetek, na katerem je vidna tabela s podatki (letnik, km, moč, menjalnik).
              </p>
            </div>
          )}

          {nacin === "rocno" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-3">
                <p className="text-xs font-medium text-zinc-600">
                  Hitro (neobvezno): prilepi celotno besedilo oglasa in/ali naloži slike vozila — opremo
                  in podatke prepoznamo samodejno, ročna polja spodaj imajo prednost.
                </p>
                <textarea
                  value={rocnoBesedilo}
                  onChange={(e) => setRocnoBesedilo(e.target.value)}
                  rows={4}
                  placeholder="Prilepi celotno besedilo strani oglasa (na strani Ctrl+A → Ctrl+C)…"
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => void naloziSlike(e.target.files)}
                  className="mt-2 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
                />
                {slike.length > 0 && (
                  <p className="mt-1.5 text-xs text-zinc-500">Naloženih slik: {slike.length}</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  ["znamka", "Znamka *", "BMW"],
                ["model", "Model", "serija 3"],
                ["verzija", "Verzija / motor", "320d xDrive M Sport"],
                ["letnik", "Letnik", "2021"],
                ["km", "Kilometri", "118000"],
                ["kw", "Moč (kW)", "140"],
                ["gorivo", "Gorivo", "diesel"],
                ["menjalnik", "Menjalnik", "avtomatski"],
                ["karoserija", "Karoserija", "limuzina"],
              ] as const).map(([k, oznaka, primer]) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600">{oznaka}</span>
                  <input
                    value={rocno[k]}
                    onChange={(e) => setRocno((r) => ({ ...r, [k]: e.target.value }))}
                    placeholder={primer}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </label>
              ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void oceni()}
          disabled={!pripravljen || tece}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {tece ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
          {tece ? "Iščem primerljiva vozila …" : "Oceni vrednost"}
        </button>

        {tece && (
          <p className="mt-2 text-xs text-zinc-500">
            Preberem oglas → poiščem primerljiva vozila v bazi → izračunam statistiko → AI preveri ujemanje.
            Traja običajno 15–40 sekund.
          </p>
        )}

        {napaka && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {napaka}
          </p>
        )}
      </div>

      {odgovor && <Rezultat odgovor={odgovor} />}
    </div>
  );
}

function Rezultat({ odgovor }: { odgovor: Odgovor }) {
  const { branje, cenitev, razlaga } = odgovor;
  const v = cenitev.cilj;

  return (
    <div className="mt-6 space-y-6">
      {/* ---------- Prebrano vozilo ---------- */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Prebrano vozilo</h2>
        <p className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">{cenitev.opisCilja}</p>

        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          <Podatek oznaka="Znamka" vrednost={v.znamka} />
          <Podatek oznaka="Model" vrednost={v.model} />
          <Podatek oznaka="Verzija" vrednost={v.verzija} />
          <Podatek oznaka="Letnik" vrednost={v.letnik} />
          <Podatek oznaka="Kilometri" vrednost={v.km === null ? null : `${stevilo(v.km)} km`} />
          <Podatek oznaka="Moč" vrednost={v.kw === null ? null : `${v.kw} kW`} />
          <Podatek oznaka="Gorivo" vrednost={v.gorivo ? OZNAKE_GORIVA[v.gorivo] : null} />
          <Podatek oznaka="Menjalnik" vrednost={v.menjalnik ? OZNAKE_MENJALNIKA[v.menjalnik] : null} />
          <Podatek oznaka="Pogon" vrednost={v.pogon ? OZNAKE_POGONA[v.pogon] : null} />
          <Podatek oznaka="Karoserija" vrednost={v.karoserija ? OZNAKE_KAROSERIJE[v.karoserija] : null} />
          <Podatek oznaka="Cena v oglasu" vrednost={v.cena === null ? null : eur(v.cena)} />
        </dl>

        {v.znacilke.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {v.znacilke.map((z) => (
              <span key={z} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700">
                {oznakaZnacilke(z)}
              </span>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-zinc-500">{branje.opomba}</p>
      </section>

      {/* ---------- Ocena ---------- */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Ocenjena vrednost v Sloveniji</h2>
            <p className="mt-1 text-4xl font-semibold tracking-tight text-zinc-900">
              {eur(cenitev.ocenjenaVrednost)}
            </p>
            {cenitev.razponSpodaj !== null && (
              <p className="mt-1 text-sm text-zinc-600">
                Realni razpon: {eur(cenitev.razponSpodaj)} – {eur(cenitev.razponZgoraj)}
              </p>
            )}
          </div>
          <Zanesljivost odstotek={cenitev.zanesljivost} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
            <p className="text-xs font-medium text-zinc-500">Priporočena cena oglasa</p>
            <p className="mt-0.5 text-xl font-semibold text-zinc-900">{eur(cenitev.priporocenaCena)}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Zgornji kvartil primerljivih oglasov — še vedno znotraj tega, kar zahtevajo drugi.
            </p>
          </div>
          <div className="rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
            <p className="text-xs font-medium text-zinc-500">Za hitro prodajo</p>
            <p className="mt-0.5 text-xl font-semibold text-zinc-900">{eur(cenitev.hitraProdaja)}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Spodnji kvartil — pod večino primerljivih oglasov.
            </p>
          </div>
        </div>

        {cenitev.popravekKm && (
          <p className="mt-3 rounded-xl bg-blue-50 px-4 py-3 text-xs text-blue-900 ring-1 ring-blue-200">
            <strong>Popravek zaradi kilometrine:</strong> {cenitev.popravekKm.razlaga}
          </p>
        )}

        {cenitev.opozorila.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {cenitev.opozorila.map((o, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {o}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-zinc-500">
          Osnova: {cenitev.aktivni.vzorec} aktivnih oglasov z objavljeno ceno od{" "}
          {cenitev.primerljivi.length} primerljivih vozil ({cenitev.pregledanih} pregledanih v bazi).
          {cenitev.opomba ? ` Iskanje: ${cenitev.opomba}.` : ""}
        </p>
      </section>

      {/* ---------- AI razlaga ---------- */}
      {razlaga && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Sparkles className="h-4 w-4 text-accent" />
            Razlaga
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">{razlaga.povzetek}</p>
          {razlaga.dejavniki?.length > 0 && (
            <ul className="mt-3 space-y-1">
              {razlaga.dejavniki.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                  <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-accent" />
                  {d}
                </li>
              ))}
            </ul>
          )}
          {razlaga.opozorilo && (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
              {razlaga.opozorilo}
            </p>
          )}
          <p className="mt-3 text-xs text-zinc-400">
            Besedilo je napisal AI iz že izračunanih številk. Cene ne izračuna in je ne more spremeniti.
          </p>
        </section>
      )}

      {/* ---------- Čas na oglasniku ---------- */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Gauge className="h-4 w-4 text-accent" />
          Kako hitro taka vozila izginejo z oglasnika
        </h2>
        {cenitev.cas.vzorec === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            Noben primerljiv oglas še ni zaključen, zato časa še ni mogoče izmeriti. Podatek se bo pojavil,
            ko bodo prvi taki oglasi izginili z Avto.neta.
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <Stat oznaka="Mediana" vrednost={`${Math.round(cenitev.cas.medianaDni ?? 0)} dni`} />
              <Stat oznaka="Povprečje" vrednost={`${Math.round(cenitev.cas.povprecjeDni ?? 0)} dni`} />
              <Stat
                oznaka="V 14 dneh"
                vrednost={`${Math.round((cenitev.cas.delez14 ?? 0) * 100)} %`}
              />
              <Stat oznaka="Vzorec" vrednost={`${cenitev.cas.vzorec} vozil`} />
            </div>
            {cenitev.hitroIzginuli.vzorec > 0 && (
              <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-900 ring-1 ring-emerald-200">
                <strong>Sodba trga:</strong> {cenitev.hitroIzginuli.vzorec} primerljivih vozil je izginilo
                v manj kot {cenitev.hitroIzginuli.pragDni} dneh — njihova mediana zadnje cene je{" "}
                <strong>{eur(cenitev.hitroIzginuli.medianaZadnjeCene)}</strong>. To je najboljši javni
                približek dejanske prodajne cene in v izračunu šteje več kot zahtevane cene aktivnih
                oglasov.
              </p>
            )}
            <p className="mt-3 text-xs text-zinc-500">
              Vir ne pove zagotovo, ali je bil avto <strong>prodan</strong> ali le <strong>umaknjen</strong>.
              Zato vsak izginuli oglas ocenimo posebej: poceni avto, ki hitro izgine, je skoraj zagotovo
              prodan; oglas, ki je bil dolgo gor ali precej dražji od ostalih, je bolj verjetno umaknjen ali
              potekel. Bolj ko je prodaja verjetna, več šteje pri oceni cene.
              {cenitev.zakljuceni.vzorec > 0 && (
                <>
                  {" "}
                  Mediana zadnje cene pred izginotjem (vsi zaključeni): {eur(cenitev.zakljuceni.mediana)} (
                  {cenitev.zakljuceni.vzorec} vozil).
                </>
              )}
            </p>
          </>
        )}
      </section>

      {/* ---------- Primerljiva vozila ---------- */}
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4">
          <TrendingUp className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-zinc-900">
            Primerljiva vozila ({cenitev.primerljivi.length})
          </h2>
        </div>
        {cenitev.primerljivi.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-zinc-600">
            V bazi ni dovolj podobnih vozil za primerjavo. To je pošten odgovor — raje povemo, da ne vemo,
            kot da bi ugibali.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-y border-zinc-100 bg-zinc-50 text-left text-xs font-medium text-zinc-500">
                <tr>
                  <th className="px-5 py-2.5">Vozilo</th>
                  <th className="px-3 py-2.5 text-right">Cena</th>
                  <th className="px-3 py-2.5 text-right">Km</th>
                  <th className="px-3 py-2.5 text-right">Letnik</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Podobnost</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {cenitev.primerljivi.map((p) => (
                  <Vrstica key={p.avtonetId} p={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Import margin worksheet: for any foreign / manually-entered car — a
          mobile.de link, a screenshot, pasted text or a manual entry. Hidden
          only for a domestic avto.net ad already in our own market, where there
          is nothing to import. */}
      {branje.izvor !== "baza" && branje.izvor !== "avtonet" && <UvoznaKalkulacija cenitev={cenitev} />}
    </div>
  );
}

/** Sale-confidence badge for a finished advert (izginil / prodano). */
const PRODAJA_OZNAKA: Record<string, { kratko: string; barva: string }> = {
  potrjeno: { kratko: "prodan", barva: "bg-blue-50 text-blue-700" },
  zelo_verjetno: { kratko: "verjetno prodan", barva: "bg-blue-50 text-blue-700" },
  verjetno: { kratko: "verjetno prodan", barva: "bg-sky-50 text-sky-700" },
  negotovo: { kratko: "morda umaknjen", barva: "bg-amber-50 text-amber-700" },
};

function Vrstica({ p }: { p: Primerljiv }) {
  const [odprto, setOdprto] = useState(false);
  const skupna = p.aiPodobnost === null ? p.podobnost : Math.round((p.podobnost + p.aiPodobnost) / 2);

  const dniOznaka = p.dniNaTrgu !== null ? ` · ${Math.round(p.dniNaTrgu)} dni` : "";
  const videz =
    p.status === "aktiven"
      ? { besedilo: "aktiven", barva: "bg-emerald-50 text-emerald-700" }
      : p.status === "prodano"
        ? { besedilo: "označen prodan", barva: "bg-blue-50 text-blue-700" }
        : p.prodaja
          ? { besedilo: `${PRODAJA_OZNAKA[p.prodaja.stopnja].kratko}${dniOznaka}`, barva: PRODAJA_OZNAKA[p.prodaja.stopnja].barva }
          : { besedilo: `izginil${dniOznaka}`, barva: "bg-zinc-100 text-zinc-600" };

  return (
    <>
      <tr className="hover:bg-zinc-50">
        <td className="px-5 py-2.5">
          <p className="font-medium text-zinc-900">
            {[p.znamka, p.model].filter(Boolean).join(" ")}
          </p>
          <p className="text-xs text-zinc-500">{p.verzija ?? p.naziv ?? "—"}</p>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">{eur(p.cena)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{stevilo(p.km)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{p.letnik ?? "—"}</td>
        <td className="px-3 py-2.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${videz.barva}`}>
            {videz.besedilo}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className="font-semibold tabular-nums text-zinc-900">{skupna} %</span>
        </td>
        <td className="px-5 py-2.5 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={() => setOdprto((o) => !o)}
            className="mr-2 text-xs font-medium text-accent hover:underline"
          >
            {odprto ? "skrij" : "zakaj?"}
          </button>
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
          >
            oglas <ExternalLink className="h-3 w-3" />
          </a>
        </td>
      </tr>
      {odprto && (
        <tr className="bg-zinc-50/60">
          <td colSpan={7} className="px-5 py-3 text-xs text-zinc-600">
            <p>
              <strong>Zakaj je primerljiv:</strong> {p.ocena.razlaga}.
            </p>
            {p.aiRazlog && (
              <p className="mt-1">
                <strong>AI presoja ({p.aiPodobnost} %):</strong> {p.aiRazlog}
              </p>
            )}
            {p.prodaja && p.status !== "aktiven" && (
              <p className="mt-1">
                <strong>Sodba trga:</strong> {p.prodaja.razlog}.
              </p>
            )}
            <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-zinc-500">
              <span>konfiguracija {p.ocena.sestavine.konfiguracija} %</span>
              <span>motor {p.ocena.sestavine.motor} %</span>
              <span>letnik {p.ocena.sestavine.letnik} %</span>
              <span>kilometri {p.ocena.sestavine.kilometri} %</span>
              <span>oprema {p.ocena.sestavine.oprema} %</span>
            </p>
            {p.znacilke.length > 0 && (
              <p className="mt-1.5 text-zinc-500">
                Oprema: {p.znacilke.slice(0, 16).map(oznakaZnacilke).join(", ")}
                {p.znacilke.length > 16 ? " …" : ""}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * The import worksheet.
 *
 * Deliberately empty of default costs. Slovenian DMV depends on emissions and
 * fuel and changes by regulation; inventing a figure here would produce a
 * confident margin that is simply wrong. So the user fills in what they know,
 * and the sheet does the arithmetic and nothing else.
 */
function UvoznaKalkulacija({ cenitev }: { cenitev: Cenitev }) {
  const [stroski, setStroski] = useState({ nakup: "", prevoz: "", dmv: "", registracija: "", drugo: "" });

  const n = (v: string) => {
    const x = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(x) ? x : 0;
  };
  const nakup = stroski.nakup ? n(stroski.nakup) : (cenitev.cilj.cena ?? 0);
  const skupaj = nakup + n(stroski.prevoz) + n(stroski.dmv) + n(stroski.registracija) + n(stroski.drugo);
  const razlika = cenitev.ocenjenaVrednost === null ? null : cenitev.ocenjenaVrednost - skupaj;
  const manjka = [
    !stroski.prevoz && "prevoz",
    !stroski.dmv && "DMV",
    !stroski.registracija && "registracija",
  ].filter(Boolean) as string[];

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Uvoz iz tujine — izračun</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Zneskov ne ugibamo. Vnesite stroške, ki jih poznate; izračun sešteje samo to, kar vpišete.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        {([
          ["nakup", "Nakupna cena"],
          ["prevoz", "Prevoz"],
          ["dmv", "DMV"],
          ["registracija", "Registracija"],
          ["drugo", "Drugo"],
        ] as const).map(([k, oznaka]) => (
          <label key={k} className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600">{oznaka}</span>
            <input
              inputMode="numeric"
              value={k === "nakup" && !stroski.nakup && cenitev.cilj.cena ? String(cenitev.cilj.cena) : stroski[k]}
              onChange={(e) => setStroski((s) => ({ ...s, [k]: e.target.value }))}
              placeholder="0"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat oznaka="Skupni strošek" vrednost={eur(skupaj)} />
        <Stat oznaka="Ocenjena vrednost v SI" vrednost={eur(cenitev.ocenjenaVrednost)} />
        <Stat
          oznaka="Razlika"
          vrednost={razlika === null ? "—" : `${razlika > 0 ? "+" : ""}${eur(razlika)}`}
        />
      </div>

      {manjka.length > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
          Manjkajo stroški: {manjka.join(", ")}. Dokler jih ne vnesete, je razlika previsoka.
        </p>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        Razlika je bruto — ne vključuje vašega časa, garancije, popravil ali morebitnega DDV.
      </p>
    </section>
  );
}

function Zanesljivost({ odstotek }: { odstotek: number }) {
  const barva =
    odstotek >= 75 ? "text-emerald-700 bg-emerald-50 ring-emerald-200"
      : odstotek >= 55 ? "text-amber-700 bg-amber-50 ring-amber-200"
        : "text-red-700 bg-red-50 ring-red-200";
  return (
    <div className={`rounded-xl px-4 py-3 text-center ring-1 ${barva}`}>
      <p className="text-2xl font-semibold tabular-nums">{odstotek} %</p>
      <p className="text-xs font-medium">zanesljivost</p>
    </div>
  );
}

function Stat({ oznaka, vrednost }: { oznaka: string; vrednost: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
      <p className="text-xs font-medium text-zinc-500">{oznaka}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">{vrednost}</p>
    </div>
  );
}

function Podatek({ oznaka, vrednost }: { oznaka: string; vrednost: string | number | null }) {
  return (
    <div className="flex justify-between gap-3 border-b border-zinc-100 py-1 sm:border-0">
      <dt className="text-zinc-500">{oznaka}</dt>
      <dd className={vrednost === null ? "text-zinc-400" : "font-medium text-zinc-900"}>
        {vrednost === null ? "ni podatka" : vrednost}
      </dd>
    </div>
  );
}
