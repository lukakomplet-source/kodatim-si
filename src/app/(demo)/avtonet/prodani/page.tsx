import { redirect } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { mejaObdobja } from "@/lib/avtonet/analiza";
import { preberiStatistike } from "@/lib/avtonet/statistikaBranje";
import {
  filtriIzParams,
  steviloFiltrov,
  uporabiFiltre,
  type FiltrirljivaPoizvedba,
} from "@/lib/avtonet/filtriVozil";
import type { ZnamkaZModeli } from "../FiltriVozilForm";
import { ProdaniClient, type Prodan } from "./ProdaniClient";

/**
 * Kaj je z oglasnika ŽE ŠLO — in po kakšni ceni.
 *
 * Aktivni oglasi povedo, kaj prodajalci zahtevajo; ta stran pove, kaj je trg
 * dejansko požrl. Zadnja zahtevana cena pred izginotjem je najboljši približek
 * dosežene cene, ki ga vir da, in je izrecno tako označena — avto.net prodaje
 * ne potrdi, zato je "izginil" tu vedno "izginil", nikoli "prodan za X".
 *
 * Filtri so ISTI kot na Bazi in kot jih pozna avto.net (skupni filtriVozil.ts),
 * da se iskanje po prodanih in po aktivnih nikoli ne razideta.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Prodani — SBN Auto" };

const NA_STRAN = 60;

type Vrstica = {
  id: string;
  avtonet_id: string;
  url: string;
  naziv: string | null;
  znamka: string | null;
  model: string | null;
  letnik: number | null;
  km: number | null;
  kw: number | null;
  gorivo: string | null;
  menjalnik: string | null;
  cena_eur: number | string | null;
  cena_prvotna_eur: number | string | null;
  status: string;
  first_seen: string;
  status_spremenjen: string | null;
  je_dealer: boolean | null;
  lokacija: string | null;
  izvedenka: string | null;
  generacija: string | null;
  serija_opis: string | null;
  pogon_norm: string | null;
  menjalnik_druzina: string | null;
  oprema_kljucna: Record<string, boolean> | null;
  oprema_teza: number | null;
  cena_primerljiva: boolean | null;
};

const POLJA =
  "id, avtonet_id, url, naziv, znamka, model, letnik, km, kw, gorivo, menjalnik, cena_eur, " +
  "cena_prvotna_eur, status, first_seen, status_spremenjen, je_dealer, lokacija, izvedenka, " +
  "generacija, serija_opis, pogon_norm, menjalnik_druzina, oprema_kljucna, oprema_teza, cena_primerljiva";

const num = (v: number | string | null): number | null => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function dniNaTrgu(v: Vrstica): number | null {
  if (!v.status_spremenjen) return null;
  const d = (new Date(v.status_spremenjen).getTime() - new Date(v.first_seen).getTime()) / 86_400_000;
  return d >= 0 && d < 3000 ? Math.round(d) : null;
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Razvrstitve, ki imajo smisel šele, ko je oglas že šel z oglasnika. */
const RAZVRSTITVE = [
  { kljuc: "izginil", oznaka: "Nazadnje izginuli" },
  { kljuc: "najhitrejsi", oznaka: "Najhitreje prodani" },
  { kljuc: "najpocasnejsi", oznaka: "Najdlje na trgu" },
  { kljuc: "padec", oznaka: "Največji padec cene" },
  { kljuc: "cena_visja", oznaka: "Cena: najvišja" },
  { kljuc: "cena_nizja", oznaka: "Cena: najnižja" },
  { kljuc: "km_manj", oznaka: "Kilometri: najmanj" },
  { kljuc: "letnik_novejsi", oznaka: "Letnik: najnovejši" },
] as const;

type Razvrstitev = (typeof RAZVRSTITVE)[number]["kljuc"];

export default async function ProdaniPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/avtonet/prodani"));

  const sp = await searchParams;
  const naj = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const dni = Number(naj("dni") || 90) || 90;
  const stran = Math.max(1, Number(naj("stran") || 1));
  const razvrsti = (RAZVRSTITVE.find((r) => r.kljuc === naj("razvrsti"))?.kljuc ?? "izginil") as Razvrstitev;
  const filtri = filtriIzParams(sp);

  const db = createAvtonetClient();
  const odKdaj = mejaObdobja(dni);

  const st = await preberiStatistike(["modeli_seznam"]);
  const znamkeModeli = ((st.modeli_seznam as { znamke: ZnamkaZModeli[] } | null)?.znamke ??
    []) as ZnamkaZModeli[];

  // Celoten nabor za obdobje in filtre: povzetek in seznam morata izhajati iz
  // istih vrstic, sicer števci zgoraj ne ustrezajo temu, kar je spodaj.
  const vrstice: Vrstica[] = [];
  for (let od = 0; ; od += 1000) {
    const osnova = db
      .from("avtonet_oglasi")
      .select(POLJA)
      .in("status", ["izginil", "prodano"])
      .gte("status_spremenjen", odKdaj);
    const q = uporabiFiltre(osnova as unknown as FiltrirljivaPoizvedba, filtri) as unknown as typeof osnova;
    const { data } = await q.order("status_spremenjen", { ascending: false }).range(od, od + 999);
    const paket = (data ?? []) as unknown as Vrstica[];
    vrstice.push(...paket);
    if (paket.length < 1000 || vrstice.length >= 9000) break;
  }

  const uporabni = vrstice.filter((v) => num(v.cena_eur) !== null && v.cena_primerljiva !== false);
  const dnevi = uporabni.map(dniNaTrgu).filter((d): d is number => d !== null);
  const cene = uporabni.map((v) => num(v.cena_eur) as number);
  const znizali = uporabni.filter((v) => {
    const p = num(v.cena_prvotna_eur);
    const c = num(v.cena_eur);
    return p !== null && c !== null && p > c;
  });

  // Kako hitro so šli: razporeditev, ne le mediana. Mediana 4 dni in mediana
  // 4 dni z repom pri 200 dneh sta dva različna trga.
  const kosi = [
    { oznaka: "≤ 7 dni", od: 0, do: 7 },
    { oznaka: "8–14 dni", od: 8, do: 14 },
    { oznaka: "15–30 dni", od: 15, do: 30 },
    { oznaka: "31–90 dni", od: 31, do: 90 },
    { oznaka: "nad 90 dni", od: 91, do: 99_999 },
  ].map((k) => {
    const n = dnevi.filter((d) => d >= k.od && d <= k.do).length;
    return { oznaka: k.oznaka, stevilo: n, delez: dnevi.length ? Math.round((n / dnevi.length) * 100) : 0 };
  });

  // Mediana dni po cenovnem razredu — odgovor na "kdaj so se prodali" tam, kjer
  // je razlika največja: poceni avti gredo drugače kot dragi.
  const razredi = [
    { oznaka: "do 5.000 €", od: 0, do: 5000 },
    { oznaka: "5–15.000 €", od: 5000, do: 15_000 },
    { oznaka: "15–30.000 €", od: 15_000, do: 30_000 },
    { oznaka: "30–60.000 €", od: 30_000, do: 60_000 },
    { oznaka: "nad 60.000 €", od: 60_000, do: 9_999_999 },
  ]
    .map((r) => {
      const v = uporabni.filter((x) => {
        const c = num(x.cena_eur) as number;
        return c >= r.od && c < r.do;
      });
      const d = v.map(dniNaTrgu).filter((x): x is number => x !== null);
      return {
        oznaka: r.oznaka,
        stevilo: v.length,
        medianaDni: mediana(d),
        medianaCene: mediana(v.map((x) => num(x.cena_eur) as number)),
      };
    })
    .filter((r) => r.stevilo >= 5);

  // Katera oprema se pojavlja pri HITRO prodanih pogosteje kot pri počasnih.
  const hitri = uporabni.filter((v) => (dniNaTrgu(v) ?? 99) <= 14);
  const pocasni = uporabni.filter((v) => (dniNaTrgu(v) ?? 0) >= 45);
  const opremaUcinek: { ime: string; hitriPct: number; pocasniPct: number; razlika: number }[] = [];
  if (hitri.length >= 20 && pocasni.length >= 20) {
    const vseLastnosti = new Set<string>();
    for (const v of uporabni) for (const k of Object.keys(v.oprema_kljucna ?? {})) vseLastnosti.add(k);
    for (const ime of vseLastnosti) {
      const h = (hitri.filter((v) => v.oprema_kljucna?.[ime]).length / hitri.length) * 100;
      const p = (pocasni.filter((v) => v.oprema_kljucna?.[ime]).length / pocasni.length) * 100;
      if (h < 4 && p < 4) continue;
      opremaUcinek.push({ ime, hitriPct: Math.round(h), pocasniPct: Math.round(p), razlika: Math.round(h - p) });
    }
    opremaUcinek.sort((a, b) => b.razlika - a.razlika);
  }

  const padec = (v: Vrstica): number => {
    const p = num(v.cena_prvotna_eur);
    const c = num(v.cena_eur);
    return p !== null && c !== null && p > c ? (p - c) / p : 0;
  };
  const urejeni = [...uporabni].sort((a, b) => {
    switch (razvrsti) {
      case "najhitrejsi": return (dniNaTrgu(a) ?? 9999) - (dniNaTrgu(b) ?? 9999);
      case "najpocasnejsi": return (dniNaTrgu(b) ?? -1) - (dniNaTrgu(a) ?? -1);
      case "padec": return padec(b) - padec(a);
      case "cena_visja": return (num(b.cena_eur) as number) - (num(a.cena_eur) as number);
      case "cena_nizja": return (num(a.cena_eur) as number) - (num(b.cena_eur) as number);
      case "km_manj": return (a.km ?? 9e9) - (b.km ?? 9e9);
      case "letnik_novejsi": return (b.letnik ?? 0) - (a.letnik ?? 0);
      default:
        return (b.status_spremenjen ?? "").localeCompare(a.status_spremenjen ?? "");
    }
  });

  const zacetek = (stran - 1) * NA_STRAN;
  const stranske = urejeni.slice(zacetek, zacetek + NA_STRAN);

  // Zgodovina cen za prikazane vrstice: ena poizvedba, ne ena na vrstico.
  // Posnetek se zapiše samo ob spremembi, zato je to točno veriga cen.
  const zgodovina = new Map<string, { cena: number; ob: string }[]>();
  if (stranske.length > 0) {
    const { data } = await db
      .from("avtonet_posnetki")
      .select("oglas_id, cena_eur, zajeto")
      .in("oglas_id", stranske.map((v) => v.id))
      .order("zajeto", { ascending: true })
      .limit(2000);
    for (const p of (data ?? []) as { oglas_id: string; cena_eur: number | string | null; zajeto: string }[]) {
      const c = num(p.cena_eur);
      if (c === null) continue;
      const seznam = zgodovina.get(p.oglas_id) ?? [];
      // Samo dejanske spremembe: zaporedne enake cene so isti podatek.
      if (seznam.length === 0 || seznam[seznam.length - 1].cena !== c) {
        seznam.push({ cena: c, ob: p.zajeto.slice(0, 10) });
      }
      zgodovina.set(p.oglas_id, seznam);
    }
  }

  const prikazani: Prodan[] = stranske.map((v) => ({
    avtonetId: v.avtonet_id,
    url: v.url,
    naziv: v.naziv,
    znamka: v.znamka,
    model: v.model,
    letnik: v.letnik,
    km: v.km,
    kw: v.kw,
    gorivo: v.gorivo,
    zadnjaCena: num(v.cena_eur) as number,
    prvotnaCena: num(v.cena_prvotna_eur),
    zgodovinaCen: zgodovina.get(v.id) ?? [],
    izginil: v.status_spremenjen?.slice(0, 10) ?? null,
    objavljen: v.first_seen.slice(0, 10),
    dniNaTrgu: dniNaTrgu(v),
    jeDealer: v.je_dealer,
    lokacija: v.lokacija,
    izvedenka: v.izvedenka,
    generacija: v.generacija,
    serijaOpis: v.serija_opis,
    pogon: v.pogon_norm,
    menjalnik: v.menjalnik_druzina,
    oprema: Object.keys(v.oprema_kljucna ?? {}),
    opremaTeza: v.oprema_teza,
    oznacenProdano: v.status === "prodano",
  }));

  return (
    <div>
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <PackageCheck className="h-6 w-6 text-accent" />
        Prodani
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-zinc-500">
        Avti, ki so <strong>šli z oglasnika</strong> — z zgodovino cene, dnevi na trgu in opremo, ki
        so jo imeli. Vir prodaje ne potrdi, zato je zadnja zahtevana cena najboljši približek
        dosežene, ne potrjena prodajna cena. Filtri so isti kot na avto.netu; kjer imamo arhiviran
        PDF, si oglas ogledaš s slikami tudi potem, ko ga na avto.netu ni več.
      </p>

      <ProdaniClient
        prodani={prikazani}
        znamkeModeli={znamkeModeli}
        privzetiFiltri={filtri}
        steviloFiltrov={steviloFiltrov(filtri)}
        dni={dni}
        razvrsti={razvrsti}
        razvrstitve={RAZVRSTITVE.map((r) => ({ kljuc: r.kljuc, oznaka: r.oznaka }))}
        stran={stran}
        naStran={NA_STRAN}
        skupaj={uporabni.length}
        povzetek={{
          medianaCene: mediana(cene),
          medianaDni: mediana(dnevi),
          hitrihPct: dnevi.length > 0 ? Math.round((dnevi.filter((d) => d <= 14).length / dnevi.length) * 100) : null,
          znizaliPct: uporabni.length > 0 ? Math.round((znizali.length / uporabni.length) * 100) : null,
          povprecnoZnizanje:
            znizali.length > 0
              ? Math.round(
                  (znizali.reduce(
                    (s, v) =>
                      s + ((num(v.cena_prvotna_eur) as number) - (num(v.cena_eur) as number)) / (num(v.cena_prvotna_eur) as number),
                    0
                  ) /
                    znizali.length) *
                    100
                )
              : null,
          zasebnikovPct:
            uporabni.length > 0
              ? Math.round((uporabni.filter((v) => v.je_dealer === false).length / uporabni.length) * 100)
              : null,
        }}
        hitrost={{ kosi, razredi }}
        opremaUcinek={opremaUcinek}
      />
    </div>
  );
}
