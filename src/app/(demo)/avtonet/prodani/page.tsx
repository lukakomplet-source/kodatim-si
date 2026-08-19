import { redirect } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { mejaObdobja } from "@/lib/avtonet/analiza";
import { ProdaniClient, type Prodan } from "./ProdaniClient";

/**
 * Kaj je z oglasnika ŽE ŠLO — in po kakšni ceni.
 *
 * Aktivni oglasi povedo, kaj prodajalci zahtevajo; ta stran pove, kaj je trg
 * dejansko požrl. Zadnja zahtevana cena pred izginotjem je najboljši približek
 * dosežene cene, ki ga vir da, in je izrecno tako označena — avto.net prodaje
 * ne potrdi, zato je "izginil" tu vedno "izginil", nikoli "prodan za X".
 *
 * Zraven stoji oprema, ki jo je avto imel, ker se prav po njej loči, zakaj sta
 * dva enaka avta šla po različni ceni. Kjer obstaja PDF arhiv, se odpre kopija
 * oglasa s slikami — takrat izvirnika ni več.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Prodani — SBN Auto" };

const NA_STRAN = 60;

type Vrstica = {
  avtonet_id: string;
  url: string;
  naziv: string | null;
  znamka: string | null;
  model: string | null;
  letnik: number | null;
  km: number | null;
  kw: number | null;
  gorivo: string | null;
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
  "avtonet_id, url, naziv, znamka, model, letnik, km, kw, gorivo, cena_eur, cena_prvotna_eur, " +
  "status, first_seen, status_spremenjen, je_dealer, lokacija, izvedenka, generacija, serija_opis, " +
  "pogon_norm, menjalnik_druzina, oprema_kljucna, oprema_teza, cena_primerljiva";

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

export default async function ProdaniPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/avtonet/prodani"));

  const sp = await searchParams;
  const naj = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const znamka = naj("znamka");
  const model = naj("model");
  const dni = Number(naj("dni") || 90);
  const stran = Math.max(1, Number(naj("stran") || 1));

  const db = createAvtonetClient();
  const odKdaj = mejaObdobja(dni);

  // Celoten nabor za izbrano obdobje: 6–7 tisoč vrstic je dovolj malo, da se
  // statistika in stran izračunata iz istih podatkov (in ne razideta).
  const vrstice: Vrstica[] = [];
  for (let od = 0; ; od += 1000) {
    let q = db
      .from("avtonet_oglasi")
      .select(POLJA)
      .in("status", ["izginil", "prodano"])
      .gte("status_spremenjen", odKdaj)
      .order("status_spremenjen", { ascending: false })
      .range(od, od + 999);
    if (znamka) q = q.eq("znamka", znamka);
    if (model) q = q.eq("model", model);
    const { data } = await q;
    const paket = (data ?? []) as unknown as Vrstica[];
    vrstice.push(...paket);
    if (paket.length < 1000 || vrstice.length >= 8000) break;
  }

  const uporabni = vrstice.filter((v) => num(v.cena_eur) !== null && v.cena_primerljiva !== false);
  const dnevi = uporabni.map(dniNaTrgu).filter((d): d is number => d !== null);
  const cene = uporabni.map((v) => num(v.cena_eur) as number);
  const znizali = uporabni.filter((v) => {
    const p = num(v.cena_prvotna_eur);
    const c = num(v.cena_eur);
    return p !== null && c !== null && p > c;
  });

  // Katera oprema se pojavlja pri HITRO prodanih pogosteje kot pri počasnih.
  // To je edina poštena oblika te primerjave: absolutna pogostost bi izmerila
  // le, kaj je na trgu splošno, ne kaj prodajo pospeši.
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

  const znamke = [...new Set(vrstice.map((v) => v.znamka).filter((z): z is string => Boolean(z)))].sort(
    (a, b) => a.localeCompare(b, "sl")
  );

  const zacetek = (stran - 1) * NA_STRAN;
  const prikazani: Prodan[] = uporabni.slice(zacetek, zacetek + NA_STRAN).map((v) => ({
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
        Avti, ki so <strong>šli z oglasnika</strong> — z zadnjo zahtevano ceno pred izginotjem,
        dnevi na trgu in opremo, ki so jo imeli. Vir prodaje ne potrdi, zato je to najboljši
        približek dosežene cene, ne potrjena prodajna cena. Kjer imamo arhiviran PDF, si oglas
        lahko ogledaš s slikami tudi potem, ko ga na avto.netu ni več.
      </p>

      <ProdaniClient
        prodani={prikazani}
        znamke={znamke}
        izbranaZnamka={znamka}
        izbranModel={model}
        dni={dni}
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
                    (s, v) => s + ((num(v.cena_prvotna_eur) as number) - (num(v.cena_eur) as number)) / (num(v.cena_prvotna_eur) as number),
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
        opremaUcinek={opremaUcinek}
      />
    </div>
  );
}
