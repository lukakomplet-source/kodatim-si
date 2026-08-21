import { redirect } from "next/navigation";
import { Layers } from "lucide-react";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { mejaObdobja } from "@/lib/avtonet/analiza";
import { preberiStatistike } from "@/lib/avtonet/statistikaBranje";
import {
  ZRNATOSTI,
  imeSkupine,
  kljucSkupine,
  mediana,
  type Zrnatost,
} from "@/lib/avtonet/konfiguracije";
import { zdruziPonovneObjave, dniNaTrguZdruzeno, type Zdruzeno } from "@/lib/avtonet/ponovneObjave";
import type { ZnamkaZModeli } from "../FiltriVozilForm";
import { KonfiguracijeClient, type Skupina, type Primerek } from "./KonfiguracijeClient";

/**
 * Katera TOČNA konfiguracija se najbolje prodaja.
 *
 * "Nissan Qashqai se prodaja v 4,8 dneh" ni uporaben podatek: pod tem imenom se
 * skriva trideset različnih avtomobilov. Tu je enota primerjave cel prstni odtis
 * vozila (izvedenka, motor, menjalnik, pogon, karoserija), po želji zožen na
 * letnik in razred kilometrov, oprema pa je filter — tako je vprašanje
 * "kako hitro gre BMW 320d 2021 s panoramo in avtomatom" mogoče postaviti
 * dobesedno.
 *
 * Vse temelji na oglasih, ki so ŽE izginili z oglasnika. Vir prodaje ne potrdi,
 * zato je zadnja zahtevana cena najboljši približek dosežene, ne prodajna cena.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Konfiguracije — SBN Auto" };

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
  ccm: number | null;
  gorivo: string | null;
  karoserija: string | null;
  cena_eur: number | string | null;
  cena_prvotna_eur: number | string | null;
  status: string;
  first_seen: string;
  status_spremenjen: string | null;
  je_dealer: boolean | null;
  lokacija: string | null;
  prstni_odtis: string | null;
  druzina_modela: string | null;
  generacija: string | null;
  serija_opis: string | null;
  izvedenka: string | null;
  pogon_norm: string | null;
  menjalnik_druzina: string | null;
  oprema_kljucna: Record<string, boolean> | null;
  oprema_teza: number | null;
  cena_primerljiva: boolean | null;
  vin: string | null;
};

const POLJA =
  "id, avtonet_id, url, naziv, znamka, model, letnik, km, kw, ccm, gorivo, karoserija, cena_eur, " +
  "cena_prvotna_eur, status, first_seen, status_spremenjen, je_dealer, lokacija, prstni_odtis, " +
  "druzina_modela, generacija, serija_opis, izvedenka, pogon_norm, menjalnik_druzina, " +
  "oprema_kljucna, oprema_teza, cena_primerljiva, vin";

const num = (v: number | string | null): number | null => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const seznam = (v: string | string[] | undefined): string[] =>
  typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

export default async function KonfiguracijePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/avtonet/konfiguracije"));

  const sp = await searchParams;
  const naj = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const stevilo = (k: string): number | null => {
    const n = Number(naj(k));
    return Number.isFinite(n) && naj(k) !== "" ? n : null;
  };

  const dni = Number(naj("dni") || 180) || 180;
  const zrnatost = (ZRNATOSTI.find((z) => z.kljuc === naj("zrnatost"))?.kljuc ?? "odtis_letnik") as Zrnatost;
  const najmanjVzorec = Math.max(2, Number(naj("vzorec") || 3) || 3);
  const razvrsti = naj("razvrsti") || "hitrost";
  const odprta = naj("skupina");

  const f = {
    znamka: naj("znamka"),
    model: naj("model"),
    izvedenka: naj("izvedenka"),
    gorivo: naj("gorivo"),
    menjalnik: naj("menjalnik"),
    pogon: naj("pogon"),
    karoserija: naj("karoserija"),
    letnikOd: stevilo("letnikOd"),
    letnikDo: stevilo("letnikDo"),
    kmOd: stevilo("kmOd"),
    kmDo: stevilo("kmDo"),
    cenaOd: stevilo("cenaOd"),
    cenaDo: stevilo("cenaDo"),
    kwOd: stevilo("kwOd"),
    kwDo: stevilo("kwDo"),
    ccmOd: stevilo("ccmOd"),
    ccmDo: stevilo("ccmDo"),
    prodajalec: naj("prodajalec"),
    barva: naj("barva"),
    vrata: naj("vrata"),
    sedezi: stevilo("sedezi"),
    usnje: naj("usnje") === "1",
    lastnikovMax: stevilo("lastnikovMax"),
    znacilke: seznam(sp.znacilke),
    oprema: seznam(sp.oprema),
  };

  const db = createAvtonetClient();
  const st = await preberiStatistike(["modeli_seznam"]);
  const znamkeModeli = ((st.modeli_seznam as { znamke: ZnamkaZModeli[] } | null)?.znamke ??
    []) as ZnamkaZModeli[];

  // Filtri, ki jih zna baza, gredo v poizvedbo; oprema in izvedenka se
  // presejeta tukaj, ker sta shranjeni kot jsonb oziroma normalizirano polje.
  const vrstice: Vrstica[] = [];
  for (let od = 0; ; od += 1000) {
    let q = db
      .from("avtonet_oglasi")
      .select(POLJA)
      .in("status", ["izginil", "prodano"])
      .gte("status_spremenjen", mejaObdobja(dni))
      .not("prstni_odtis", "is", null)
      .order("status_spremenjen", { ascending: false })
      .range(od, od + 999);
    if (f.znamka) q = q.ilike("znamka", f.znamka);
    if (f.model) q = q.or(`model.ilike.*${f.model}*,naziv.ilike.*${f.model}*`);
    if (f.gorivo) q = q.ilike("gorivo", `${f.gorivo}%`);
    if (f.pogon) q = q.eq("pogon_norm", f.pogon);
    if (f.menjalnik) q = q.eq("menjalnik_druzina", f.menjalnik);
    if (f.karoserija) q = q.ilike("karoserija", `%${f.karoserija}%`);
    if (f.letnikOd) q = q.gte("letnik", f.letnikOd);
    if (f.letnikDo) q = q.lte("letnik", f.letnikDo);
    if (f.kmOd) q = q.gte("km", f.kmOd);
    if (f.kmDo) q = q.lte("km", f.kmDo);
    if (f.cenaOd) q = q.gte("cena_eur", f.cenaOd);
    if (f.cenaDo) q = q.lte("cena_eur", f.cenaDo);
    if (f.kwOd) q = q.gte("kw", f.kwOd);
    if (f.kwDo) q = q.lte("kw", f.kwDo);
    if (f.ccmOd) q = q.gte("ccm", f.ccmOd);
    if (f.ccmDo) q = q.lte("ccm", f.ccmDo);
    if (f.prodajalec === "zasebnik") q = q.eq("je_dealer", false);
    if (f.prodajalec === "trgovec") q = q.eq("je_dealer", true);
    if (f.barva) q = q.ilike("barva", `%${f.barva}%`);
    if (f.vrata === "23") q = q.lte("stevilo_vrat", 3);
    if (f.vrata === "45") q = q.gte("stevilo_vrat", 4);
    if (f.sedezi) q = q.gte("stevilo_sedezev", f.sedezi);
    if (f.usnje) q = q.ilike("notranjost", "%usnj%");
    if (f.lastnikovMax) q = q.lte("lastnikov", f.lastnikovMax);
    // Vir sam normalizira te oznake (xenon, servisna_knjiga, slovensko_poreklo,
    // prvi_lastnik) — filter gre naravnost na polje oznak.
    if (f.znacilke.length > 0) q = q.contains("oprema_znacilke", f.znacilke);

    const { data } = await q;
    const paket = (data ?? []) as unknown as Vrstica[];
    vrstice.push(...paket);
    if (paket.length < 1000 || vrstice.length >= 12_000) break;
  }

  const izbrani = vrstice.filter((v) => {
    if (num(v.cena_eur) === null || v.cena_primerljiva === false) return false;
    if (f.izvedenka && (v.izvedenka ?? "").toLowerCase() !== f.izvedenka.toLowerCase()) return false;
    // Oprema je zahteva, ne želja: vse izbrane lastnosti morajo biti prisotne.
    for (const o of f.oprema) if (!v.oprema_kljucna?.[o]) return false;
    return true;
  });

  // Ponovne objave istega fizičnega avta (isti naziv, km, letnik oz. isti VIN)
  // se najprej zlijejo v en avto: brez tega je en Ford, objavljen trikrat,
  // štel kot trije avti, vsak "prodan" v dveh dneh — in lestvico hitrosti so
  // vodili trgovci, ki oglase najpogosteje obnavljajo.
  const vozila = zdruziPonovneObjave(izbrani);

  // Skupine po prstnem odtisu (+ letnik, + razred km).
  const skupineMap = new Map<string, Zdruzeno<Vrstica>[]>();
  for (const z of vozila) {
    const k = kljucSkupine(z.vrstica, zrnatost);
    if (!k) continue;
    (skupineMap.get(k) ?? skupineMap.set(k, []).get(k)!).push(z);
  }

  const skupine: Skupina[] = [];
  for (const [kljuc, clani] of skupineMap) {
    if (clani.length < najmanjVzorec) continue;
    const dnevi = clani.map(dniNaTrguZdruzeno).filter((d): d is number => d !== null);
    const cene = clani.map((z) => num(z.vrstica.cena_eur) as number);
    const znizali = clani.filter((z) => {
      const p = num(z.vrstica.cena_prvotna_eur);
      const c = num(z.vrstica.cena_eur);
      return p !== null && c !== null && p > c;
    });
    // Oprema, ki jo ima vsaj polovica avtov v skupini — po tem se skupini vidi
    // "kakšna je bila opremljenost", ne da bi jo bilo treba odpirati.
    const stetje = new Map<string, number>();
    for (const z of clani) for (const o of Object.keys(z.vrstica.oprema_kljucna ?? {})) {
      stetje.set(o, (stetje.get(o) ?? 0) + 1);
    }
    const znacilnaOprema = [...stetje.entries()]
      .filter(([, n]) => n / clani.length >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([o, n]) => ({ kljuc: o, delez: Math.round((n / clani.length) * 100) }));

    skupine.push({
      kljuc,
      ime: imeSkupine(clani[0].vrstica, zrnatost),
      znamka: clani[0].vrstica.znamka,
      stevilo: clani.length,
      medianaDni: mediana(dnevi),
      hitrih7: dnevi.length ? Math.round((dnevi.filter((d) => d <= 7).length / dnevi.length) * 100) : null,
      hitrih14: dnevi.length ? Math.round((dnevi.filter((d) => d <= 14).length / dnevi.length) * 100) : null,
      medianaCene: mediana(cene),
      najnizja: Math.min(...cene),
      najvisja: Math.max(...cene),
      znizaliPct: Math.round((znizali.length / clani.length) * 100),
      zasebnikovPct: Math.round((clani.filter((z) => z.vrstica.je_dealer === false).length / clani.length) * 100),
      medianaKm: mediana(clani.map((z) => z.vrstica.km).filter((x): x is number => x !== null)),
      znacilnaOprema,
    });
  }

  skupine.sort((a, b) => {
    switch (razvrsti) {
      case "vzorec": return b.stevilo - a.stevilo;
      case "cena": return (b.medianaCene ?? 0) - (a.medianaCene ?? 0);
      case "znizanja": return b.znizaliPct - a.znizaliPct;
      case "pocasnost": return (b.medianaDni ?? -1) - (a.medianaDni ?? -1);
      default: return (a.medianaDni ?? 9999) - (b.medianaDni ?? 9999);
    }
  });

  // Podrobnosti odprte skupine: vsak FIZIČNI avto enkrat, z zgodovino cen čez
  // vse svoje objave in s PDF-ji vseh objav.
  let primerki: Primerek[] = [];
  if (odprta && skupineMap.has(odprta)) {
    const clani = skupineMap.get(odprta)!.slice(0, 100);
    const vsiIdji = clani.flatMap((z) => z.ids).slice(0, 300);
    const zgodovina = new Map<string, { cena: number; ob: string }[]>();
    const { data } = await db
      .from("avtonet_posnetki")
      .select("oglas_id, cena_eur, zajeto")
      .in("oglas_id", vsiIdji)
      .order("zajeto", { ascending: true })
      .limit(4000);
    for (const p of (data ?? []) as { oglas_id: string; cena_eur: number | string | null; zajeto: string }[]) {
      const c = num(p.cena_eur);
      if (c === null) continue;
      const s = zgodovina.get(p.oglas_id) ?? [];
      s.push({ cena: c, ob: p.zajeto.slice(0, 10) });
      zgodovina.set(p.oglas_id, s);
    }
    primerki = clani
      .sort((a, b) => (dniNaTrguZdruzeno(a) ?? 9999) - (dniNaTrguZdruzeno(b) ?? 9999))
      .map((z) => {
        const v = z.vrstica;
        // Zlita pot cene čez vse objave, kronološko, brez zaporednih ponovitev.
        const tocke = z.ids
          .flatMap((id) => zgodovina.get(id) ?? [])
          .sort((a, b) => a.ob.localeCompare(b.ob))
          .filter((t, i, arr) => i === 0 || arr[i - 1].cena !== t.cena);
        return {
          avtonetId: v.avtonet_id,
          vsiAvtonetIds: z.avtonetIds,
          url: v.url,
          naziv: v.naziv,
          letnik: v.letnik,
          km: v.km,
          kw: v.kw,
          cena: num(v.cena_eur) as number,
          prvotnaCena: num(v.cena_prvotna_eur),
          zgodovinaCen: tocke,
          izginil: v.status_spremenjen?.slice(0, 10) ?? null,
          objavljen: z.prvaObjava.slice(0, 10),
          dniNaTrgu: dniNaTrguZdruzeno(z),
          objav: z.objav,
          jeDealer: v.je_dealer,
          lokacija: v.lokacija,
          oprema: Object.keys(v.oprema_kljucna ?? {}),
        };
      });
  }

  const izvedenke = [
    ...new Set(izbrani.map((v) => v.izvedenka).filter((x): x is string => x !== null && x !== "" && !x.startsWith("kw"))),
  ]
    .sort()
    .slice(0, 200);

  return (
    <div>
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <Layers className="h-6 w-6 text-accent" />
        Katera konfiguracija se najbolje prodaja
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-zinc-500">
        Ne po imenu modela — po <strong>točnem avtu</strong>. Enota primerjave je izvedenka z
        motorjem, menjalnikom, pogonom in karoserijo, po želji zožena na letnik in razred
        kilometrov; opremo pa izbereš kot pogoj, tako da lahko vprašaš dobesedno „BMW 320d 2021,
        100–125.000 km, panorama in avtomat“. Klik na vrstico odpre <strong>vse take avte</strong>,
        ki so šli z oglasnika — s ceno, potjo cene in PDF-jem, kjer ga imamo.
      </p>

      <KonfiguracijeClient
        skupine={skupine}
        primerki={primerki}
        odprta={odprta}
        znamkeModeli={znamkeModeli}
        izvedenke={izvedenke}
        filtri={{ ...f, dni, zrnatost, vzorec: najmanjVzorec, razvrsti }}
        pregledanih={izbrani.length}
      />
    </div>
  );
}
