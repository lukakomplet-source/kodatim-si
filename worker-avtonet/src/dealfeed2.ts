import type { Db } from "./db.js";
import { identiteta as izracunajIdentiteto } from "./identiteta.js";
import {
  ujemanje, koeficienti, prilagojenaCena, mediana, razprsenost, zaporaKandidata,
  imeStopnje, type Vozilo, type Posel, type Primerljivec, type Zavrnjen, type Stopnja,
} from "./posli.js";

/**
 * Izračun poslov 2.0 — teče po normalizaciji identitete.
 *
 * Zaporedje je namerno: identiteta → primerljivci → trg → cena. Vsak korak
 * lahko posel ustavi, in kadar ga ustavi, se razlog zapiše. Tako je za vsak
 * avto mogoče odgovoriti na obe vprašanji, ki sta prej ostali brez odgovora:
 * zakaj je to posel, in zakaj so bili drugi avti zavrnjeni kot primerljivci.
 */

type Log = (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;

const POLJA =
  "id, avtonet_id, url, naziv, znamka, model, letnik, km, kw, gorivo, menjalnik, karoserija, pogon, " +
  "cena_eur, je_dealer, status, status_spremenjen, first_seen, oprema, opis, oprema_znacilke, " +
  "dodatni_podatki, ddv_odbitek, cena_brez_ddv_eur, druzina_modela, generacija, izvedenka, " +
  "izvedenka_vir, identiteta_zaupanje, pogon_norm, menjalnik_druzina, vin, oprema_kljucna, " +
  "oprema_teza, prstni_odtis, cena_primerljiva, razlog_izkljucitve, serija, serija_opis, facelift";

type Vrstica = {
  id: string; avtonet_id: string; url: string; naziv: string | null; znamka: string | null;
  model: string | null; letnik: number | null; km: number | null; kw: number | null;
  gorivo: string | null; menjalnik: string | null; karoserija: string | null; pogon: string | null;
  cena_eur: number | string | null; je_dealer: boolean | null; status: string;
  status_spremenjen: string | null; first_seen: string; oprema: string | null; opis: string | null;
  oprema_znacilke: string[] | null; dodatni_podatki: Record<string, unknown> | null;
  ddv_odbitek: boolean | null; cena_brez_ddv_eur: number | string | null;
  druzina_modela: string | null; generacija: string | null; izvedenka: string | null;
  izvedenka_vir: string | null; identiteta_zaupanje: number | null; pogon_norm: string | null;
  menjalnik_druzina: string | null; vin: string | null;
  oprema_kljucna: Record<string, boolean> | null; oprema_teza: number | null;
  prstni_odtis: string | null; cena_primerljiva: boolean | null; razlog_izkljucitve: string | null;
  serija: number | null; serija_opis: string | null; facelift: boolean | null;
};

const num = (v: number | string | null): number | null => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Vrstica iz baze → vozilo z identiteto (iz stolpcev, sicer izračunano sproti). */
function vVozilo(r: Vrstica): Vozilo | null {
  const cena = num(r.cena_eur);
  if (cena === null) return null;
  const shranjena = r.druzina_modela !== null;
  const i = shranjena
    ? {
        druzinaModela: r.druzina_modela as string,
        generacija: r.generacija,
        izvedenka: r.izvedenka,
        izvedenkaVir: (r.izvedenka_vir ?? "ni") as "vin" | "naziv-znamka" | "naziv-motor" | "moc" | "ni",
        zaupanje: r.identiteta_zaupanje ?? 0,
        pogon: (r.pogon_norm ?? "?") as "awd" | "rwd" | "fwd" | "?",
        menjalnikDruzina: r.menjalnik_druzina ?? "?",
        karoserija: (r.karoserija ?? "?").toLowerCase().split("/")[0].trim(),
        gorivo: (r.gorivo ?? "?").split(" ")[0].toLowerCase(),
        vin: r.vin,
        oprema: r.oprema_kljucna ?? {},
        opremaTeza: r.oprema_teza ?? 0,
      }
    : izracunajIdentiteto(r);
  return {
    id: r.id, avtonetId: r.avtonet_id, url: r.url, naziv: r.naziv, znamka: r.znamka,
    model: r.model, letnik: r.letnik, km: r.km, kw: r.kw, cena,
    jeDealer: r.je_dealer, status: r.status, statusSpremenjen: r.status_spremenjen,
    firstSeen: r.first_seen, identiteta: i,
    serija: r.serija, serijaOpis: r.serija_opis, faceliftTrditev: r.facelift,
    cenaPrimerljiva: r.cena_primerljiva ?? true,
    razlogIzkljucitve: r.razlog_izkljucitve,
    ddvOdbitek: r.ddv_odbitek === true,
    cenaBrezDdv: num(r.cena_brez_ddv_eur),
  };
}

async function preberi(db: Db, aktivni: boolean): Promise<Vozilo[]> {
  const out: Vozilo[] = [];
  for (let od = 0; ; od += 1000) {
    let q = db.from("avtonet_oglasi").select(POLJA).order("id").range(od, od + 999);
    q = aktivni ? q.eq("status", "aktiven") : q.in("status", ["izginil", "prodano"]);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const paket = (data ?? []) as unknown as Vrstica[];
    for (const r of paket) {
      const v = vVozilo(r);
      if (v) out.push(v);
    }
    if (paket.length < 1000) break;
  }
  return out;
}

function dniNaTrgu(v: Vozilo): number | null {
  if (!v.statusSpremenjen) return null;
  const d = (new Date(v.statusSpremenjen).getTime() - new Date(v.firstSeen).getTime()) / 86_400_000;
  return d >= 0 && d < 2000 ? Math.round(d) : null;
}

export async function izracunajPosle(db: Db, log: Log): Promise<void> {
  const aktivni = await preberi(db, true);
  const zakljuceni = await preberi(db, false);
  log("info", `Posli 2.0: ${aktivni.length} aktivnih, ${zakljuceni.length} zaključenih.`);

  // Skupine po družini modela — ožje razlike razsodi ujemanje(), zato tu
  // zadošča groba delitev, da primerjav ni kvadratno veliko.
  const poDruzini = new Map<string, Vozilo[]>();
  for (const v of aktivni) {
    const k = v.identiteta.druzinaModela;
    (poDruzini.get(k) ?? poDruzini.set(k, []).get(k)!).push(v);
  }
  const zakljuceniPoDruzini = new Map<string, Vozilo[]>();
  for (const v of zakljuceni) {
    const k = v.identiteta.druzinaModela;
    (zakljuceniPoDruzini.get(k) ?? zakljuceniPoDruzini.set(k, []).get(k)!).push(v);
  }

  // Likvidnost: kako hitro se ta specifikacija umika s trga.
  const likvidnostOdtisa = new Map<string, number>();
  {
    const skupaj = new Map<string, { hitrih: number; vseh: number }>();
    for (const z of zakljuceni) {
      const d = dniNaTrgu(z);
      if (d === null) continue;
      const k = z.identiteta.druzinaModela;
      const s = skupaj.get(k) ?? { hitrih: 0, vseh: 0 };
      s.vseh++;
      if (d <= 21) s.hitrih++;
      skupaj.set(k, s);
    }
    for (const [k, s] of skupaj) {
      if (s.vseh >= 5) likvidnostOdtisa.set(k, s.hitrih / s.vseh);
    }
  }

  const posli: Posel[] = [];
  const zavrnitve = new Map<string, number>();
  const zabelezi = (razlog: string) => zavrnitve.set(razlog, (zavrnitve.get(razlog) ?? 0) + 1);

  for (const k of aktivni) {
    const zapora = zaporaKandidata(k);
    if (zapora) {
      zabelezi(zapora);
      continue;
    }

    const druzina = poDruzini.get(k.identiteta.druzinaModela) ?? [];
    const ocenjeni: { v: Vozilo; u: ReturnType<typeof ujemanje> }[] = [];
    const zavrnjeniPrimerljivci: Zavrnjen[] = [];

    for (const p of druzina) {
      if (p.id === k.id) continue;
      if (!p.cenaPrimerljiva || p.km === null || p.letnik === null) continue;
      const u = ujemanje(k, p);
      if (u.stopnja >= 3 && zavrnjeniPrimerljivci.length < 8 && u.ovire.length > 0) {
        zavrnjeniPrimerljivci.push({
          naziv: p.naziv,
          url: p.url,
          razlog: u.ovire[0],
        });
      }
      if (u.stopnja <= 2) ocenjeni.push({ v: p, u });
    }

    const identicni = ocenjeni.filter((x) => x.u.stopnja === 1);
    const zeloBlizu = ocenjeni.filter((x) => x.u.stopnja === 2);

    // Trda zapora: dokaz mora biti iz stopnje 1 ali 2. Stopnja 3 je kontekst.
    if (ocenjeni.length < 8) {
      zabelezi(`premalo primerljivih (${ocenjeni.length} od 8)`);
      continue;
    }

    const vzorec = ocenjeni.map((x) => x.v);
    const koef = koeficienti(vzorec);
    const prilagojeni = ocenjeni
      .map((x) => ({ ...x, cena: prilagojenaCena(x.v, k, koef) }))
      .filter((x): x is typeof x & { cena: number } => x.cena !== null);

    if (prilagojeni.length < 8) {
      zabelezi("premalo primerljivih po prilagoditvi na km in letnik");
      continue;
    }

    const cene = prilagojeni.map((x) => x.cena);
    const razpr = razprsenost(cene);
    if (razpr !== null && razpr > 0.45) {
      zabelezi(`trg preveč razpršen (${Math.round(razpr * 100)} %)`);
      continue;
    }

    const medIdenticnih = mediana(prilagojeni.filter((x) => x.u.stopnja === 1).map((x) => x.cena));
    const medZeloBlizu = mediana(prilagojeni.filter((x) => x.u.stopnja === 2).map((x) => x.cena));
    const medZasebnikov = mediana(prilagojeni.filter((x) => x.v.jeDealer === false).map((x) => x.cena));
    const medTrgovcev = mediana(prilagojeni.filter((x) => x.v.jeDealer === true).map((x) => x.cena));
    const vzorecTrgovcev = prilagojeni.filter((x) => x.v.jeDealer === true).length;

    // Tržna vrednost: identični štejejo dvojno, ker so dokaz, ne približek.
    const utezene: number[] = [];
    for (const x of prilagojeni) {
      utezene.push(x.cena);
      if (x.u.stopnja === 1) utezene.push(x.cena);
    }
    const trznaVrednost = mediana(utezene) as number;
    const odstopanje = ((trznaVrednost - k.cena) / trznaVrednost) * 100;

    if (odstopanje < 8) {
      zabelezi("cena ni pod trgom");
      continue;
    }

    // Posel mora obstajati tudi BREZ preračuna na km in letnik.
    //
    // Preračun je poštena izboljšava, dokler samo gladi razlike; kadar pa
    // postane edini razlog za razliko v ceni, je posel izmišljen. Zato mora
    // biti cena pod mediano tudi po surovih, nepopravljenih cenah oglasov.
    const surovaMediana = mediana(prilagojeni.map((x) => x.v.cena)) as number;
    const surovoOdstopanje = ((surovaMediana - k.cena) / surovaMediana) * 100;
    if (surovoOdstopanje < 5) {
      zabelezi("posel obstaja samo po preračunu na km in letnik");
      continue;
    }
    // Nad 45 % je skoraj vedno napaka v podatkih ali skrita okvara; kadar je
    // vzorec identičnih velik in razpršenost nizka, se meja rahlo dvigne.
    const zgornjaMeja = identicni.length >= 10 && (razpr ?? 1) < 0.25 ? 55 : 45;
    if (odstopanje > zgornjaMeja) {
      zabelezi(`odstopanje nerealno (${Math.round(odstopanje)} %)`);
      continue;
    }

    // Zaupanja: ločeno, ker povedo različne stvari.
    const zaupanjeUjemanja = Math.min(
      100,
      Math.round((identicni.length * 8 + zeloBlizu.length * 3) + k.identiteta.zaupanje * 0.3)
    );
    const zaupanjeTrga = Math.min(
      100,
      Math.round(
        Math.min(50, prilagojeni.length * 2.5) +
          (razpr === null ? 15 : Math.max(0, 35 - razpr * 60)) +
          (vzorecTrgovcev >= 5 ? 15 : 5)
      )
    );
    const zaupanjeSkupno = Math.round(
      zaupanjeUjemanja * 0.4 + zaupanjeTrga * 0.4 + k.identiteta.zaupanje * 0.2
    );

    const likvidnost = likvidnostOdtisa.get(k.identiteta.druzinaModela) ?? null;
    const kmMed = mediana(vzorec.map((v) => v.km).filter((x): x is number => x !== null));
    const kmAnomalija =
      k.km !== null && kmMed !== null && k.letnik !== null &&
      new Date().getFullYear() - k.letnik >= 6 && k.km < kmMed * 0.4;

    // Zasluzek: pri zasebniku je iztržek trgovska cena, ker se tja prodaja.
    const zasebnik = k.jeDealer === false;
    const iztrzek = zasebnik && medTrgovcev !== null && vzorecTrgovcev >= 5 ? medTrgovcev : trznaVrednost;
    const zasluzek = Math.round(iztrzek - k.cena);
    const odstTrgovci = medTrgovcev !== null ? ((medTrgovcev - k.cena) / medTrgovcev) * 100 : null;

    const potencial = Math.round(
      zasluzek *
        (0.5 + Math.min(1, (likvidnost ?? 0.3) * 1.5)) *
        (zaupanjeSkupno / 100) *
        (kmAnomalija ? 0.4 : 1)
    );

    const primerljivi: Primerljivec[] = prilagojeni
      .sort((a, b) => a.u.stopnja - b.u.stopnja || Math.abs((a.v.km ?? 0) - (k.km ?? 0)) - Math.abs((b.v.km ?? 0) - (k.km ?? 0)))
      .filter((x, i, arr) => {
        const kljuc = `${(x.v.naziv ?? "").toLowerCase().replace(/\s+/g, " ").slice(0, 60)}|${x.v.cena}|${x.v.km}|${x.v.letnik}`;
        return arr.findIndex((y) => `${(y.v.naziv ?? "").toLowerCase().replace(/\s+/g, " ").slice(0, 60)}|${y.v.cena}|${y.v.km}|${y.v.letnik}` === kljuc) === i;
      })
      .slice(0, 10)
      .map((x) => ({
        avtonetId: x.v.avtonetId, naziv: x.v.naziv, letnik: x.v.letnik, km: x.v.km,
        cena: x.v.cena, prilagojena: x.cena, url: x.v.url, stopnja: x.u.stopnja,
        jeDealer: x.v.jeDealer, enako: x.u.enako, razlika: x.u.razlika,
      }));

    // Kaj so taki isti dosegli, preden so izginili.
    const zakljuceniIsti = (zakljuceniPoDruzini.get(k.identiteta.druzinaModela) ?? [])
      .map((z) => ({ z, u: ujemanje(k, z) }))
      .filter((x) => x.u.stopnja <= 2 && x.z.cenaPrimerljiva)
      .sort((a, b) => a.u.stopnja - b.u.stopnja)
      .filter((x, i, arr) => arr.findIndex((y) => y.z.naziv === x.z.naziv && y.z.cena === x.z.cena && y.z.km === x.z.km) === i)
      .slice(0, 5);
    const medZakljucenih = mediana(zakljuceniIsti.map((x) => x.z.cena));

    const razlogi: string[] = [
      `${Math.round(odstopanje)} % pod tržno vrednostjo ${Math.round(trznaVrednost).toLocaleString("sl-SI")} € — ` +
        `${identicni.length} identičnih, ${zeloBlizu.length} zelo blizu`,
    ];
    if (razpr !== null) {
      razlogi.push(
        razpr < 0.25 ? `trg je stabilen (razpršenost ${Math.round(razpr * 100)} %)`
          : `⚠️ trg je razpršen (${Math.round(razpr * 100)} %) — vrednost je manj zanesljiva`
      );
    }
    if (zasebnik && odstTrgovci !== null && odstTrgovci > 0 && vzorecTrgovcev >= 5) {
      razlogi.push(`zasebnik: ${Math.round(odstTrgovci)} % pod ceno trgovcev (${vzorecTrgovcev} oglasov, mediana ${Math.round(medTrgovcev as number).toLocaleString("sl-SI")} €)`);
    }
    if (likvidnost !== null) razlogi.push(`${Math.round(likvidnost * 100)} % takih izgine v ≤ 3 tednih`);
    if (k.identiteta.opremaTeza >= 8) razlogi.push(`bogata oprema (teža ${k.identiteta.opremaTeza})`);
    if (kmAnomalija) razlogi.push("⚠️ km izrazito pod povprečjem letnika — preverite zgodovino");
    if (k.identiteta.izvedenkaVir === "moc") razlogi.push("⚠️ izvedenka ni bila prebrana iz naziva, le iz moči");

    posli.push({
      avtonetId: k.avtonetId, url: k.url, naziv: k.naziv, znamka: k.znamka, modelIme: k.model,
      model: k.identiteta.druzinaModela, cena: k.cena, letnik: k.letnik, km: k.km,
      jeDealer: k.jeDealer, ddvOdbitek: k.ddvOdbitek, cenaBrezDdv: k.cenaBrezDdv,
      izvedenka: k.identiteta.izvedenka, generacija: k.identiteta.generacija,
      serija: k.serija, serijaOpis: k.serijaOpis, faceliftTrditev: k.faceliftTrditev,
      pogon: k.identiteta.pogon, menjalnik: k.identiteta.menjalnikDruzina,
      identitetaZaupanje: k.identiteta.zaupanje, opremaTeza: k.identiteta.opremaTeza,
      kljucnaOprema: Object.keys(k.identiteta.oprema),
      trznaVrednost: Math.round(trznaVrednost), odstopanjePct: odstopanje,
      zasluzek, potencial,
      medianaIdenticnih: medIdenticnih === null ? null : Math.round(medIdenticnih),
      medianaZeloBlizu: medZeloBlizu === null ? null : Math.round(medZeloBlizu),
      medianaZasebnikov: medZasebnikov === null ? null : Math.round(medZasebnikov),
      medianaTrgovcev: medTrgovcev === null ? null : Math.round(medTrgovcev),
      medianaZakljucenih: medZakljucenih === null ? null : Math.round(medZakljucenih),
      vzorecIdenticnih: identicni.length, vzorecZeloBlizu: zeloBlizu.length,
      razprsenostPct: razpr === null ? null : Math.round(razpr * 100),
      zaupanjeUjemanja, zaupanjeTrga, zaupanjeSkupno,
      likvidnost: likvidnost === null ? null : Math.round(likvidnost * 100),
      strogost: identicni.length >= 8 ? "identični avti" : identicni.length > 0 ? "identični in zelo blizu" : "zelo blizu",
      razlogi, primerljivi, zavrnjeni: zavrnjeniPrimerljivci,
      prodani: zakljuceniIsti.map((x) => ({
        naziv: x.z.naziv ?? "?", letnik: x.z.letnik, km: x.z.km, zadnjaCena: x.z.cena,
        izginil: x.z.statusSpremenjen?.slice(0, 10) ?? null, dniNaTrgu: dniNaTrgu(x.z),
        url: x.z.url, stopnja: x.u.stopnja as Stopnja,
      })),
      vzorecTrgovcev, odstopanjeTrgovciPct: odstTrgovci, kmAnomalija,
      tocke: Math.round(odstopanje * (zaupanjeSkupno / 100) * 10) / 10,
    });
  }

  posli.sort((a, b) => b.potencial - a.potencial);

  // Izbor: potencial + kakovost ujemanja + kvota na znamko, da filtri na
  // strani Posli sploh imajo kaj filtrirati.
  const izbrani = new Map<string, Posel>();
  for (const p of posli.slice(0, 200)) izbrani.set(p.avtonetId, p);
  for (const p of [...posli].sort((a, b) => b.zaupanjeSkupno - a.zaupanjeSkupno).slice(0, 120)) {
    izbrani.set(p.avtonetId, p);
  }
  const naZnamko = new Map<string, number>();
  for (const p of posli) {
    const z = p.znamka ?? "?";
    const n = naZnamko.get(z) ?? 0;
    if (n >= 12) continue;
    naZnamko.set(z, n + 1);
    izbrani.set(p.avtonetId, p);
  }

  const shranjeni = [...izbrani.values()].sort((a, b) => b.potencial - a.potencial);
  const razlogiZavrnitve = [...zavrnitve.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  await db.from("avtonet_statistika").upsert({
    kljuc: "deal_feed",
    podatki: {
      verzija: 2,
      deals: shranjeni,
      pregledanih: aktivni.length,
      najdenih: posli.length,
      zavrnitve: Object.fromEntries(razlogiZavrnitve),
    },
    izracunano: new Date().toISOString(),
  });

  log("info", `Posli 2.0: ${posli.length} kandidatov, shranjenih ${shranjeni.length}.`, {
    zavrnitve: Object.fromEntries(razlogiZavrnitve.slice(0, 5)),
  });
}
