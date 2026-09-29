import "dotenv/config";
import { connect } from "./db.js";
import { naloziKraje, preberiVse } from "./nepremicnine.js";
import { kandidatiIzKraja, najdiKraj, razdaljaKm, type KrajVrstica } from "../../src/lib/nepremicnine/kraji.js";

/**
 * ENKRATNI POPRAVEK REGIJ IN DRŽAVE.
 *
 * nepremicnine.net poti "goriska" in "obalno-kraska" ne pozna in za obe vrne
 * CEL katalog (dnevnik zbiralnika, 29. 9. 2026: prodaja/goriska/stanovanje
 * 22.678 zadetkov, prodaja/obalno-kraska/stanovanje 22.677, Ljubljana 653).
 * Oglasi, prebrani v teh rezinah, so dobili regijo rezine — Poreč, Zagreb in
 * Ljubljana so bili "goriški". Ta skripta:
 *
 *   1. vsakemu oglasu (vsi viri) določi DRŽAVO po imenu kraja iz šifranta:
 *      samo hrvaški zadetki = HR, samo slovenski = SI, oboje = odloči agencija
 *      (Eurovilla, DUX, Alma Dom … imajo skoraj same hrvaške oglase);
 *   2. oglasom nepremicnine.net z regijo goriska/obalno-kraska regijo
 *      PRERAČUNA: hrvaškim jo pobriše, slovenskim jo določi prek občine
 *      (najbližji sedež občine iz nep_turizem_obcine). Občine Goriške in Obale
 *      so vpisane na roko (21 občin, uradna razdelitev SURS); za ostale se
 *      regija NAUČI iz oglasov istega vira v pravilnih rezinah (večina glasov).
 *
 *   npm run popravi:regije             # zapiše
 *   npm run popravi:regije -- --suho   # samo prešteje
 */

const SUHO = process.argv.includes("--suho");

const OBALNO_KRASKA = ["Ankaran/Ancarano", "Divača", "Hrpelje - Kozina", "Izola/Isola", "Komen", "Koper/Capodistria", "Piran/Pirano", "Sežana"];
const GORISKA = [
  "Ajdovščina", "Bovec", "Brda", "Cerkno", "Idrija", "Kanal", "Kobarid", "Miren - Kostanjevica",
  "Nova Gorica", "Renče - Vogrsko", "Šempeter - Vrtojba", "Tolmin", "Vipava",
];
const POKVARJENE = new Set(["goriska", "obalno-kraska"]);

type Oglas = { id: string; vir: string; kraj: string | null; regija: string | null; agencija: string | null; lat: number | null; lng: number | null; drzava: string | null };
type Sedez = { obcina: string; lat: number; lng: number };

/**
 * Države, v katerih šifrant pozna kraj. Najprej celo ime (kot geokoder), nato
 * po delih: hrvaški oglasi pišejo "Pula Centar", "Krk - Center", "Malinska -
 * Dubašnica", "Osijek - Center, Gornji Grad / Centar" — celega imena šifrant
 * ne pozna, dela pa. Suho izvajanje 29. 9. je brez tega pustilo 13.840
 * oglasov brez države, večinoma prav take.
 */
function drzaveKraja(kraj: string | null, kraji: Map<string, KrajVrstica[]>): { d: Set<string>; delno: boolean } {
  const d = new Set<string>();
  if (!kraj) return { d, delno: false };
  const deli = [kraj, ...kraj.split(/\s+-\s+|,|\//)].map((x) => x.replace(/\b(?:centar|center|centro)\b/gi, "").trim()).filter((x) => x.length > 1);
  for (const [i, del] of deli.entries()) {
    for (const k of kandidatiIzKraja(del)) {
      const z = kraji.get(k);
      if (z && z.length > 0) {
        for (const x of z) d.add(x.drzava);
        return { d, delno: i > 0 }; // prvi del, ki ga šifrant pozna, odloči
      }
    }
  }
  return { d, delno: false };
}

async function main(): Promise<void> {
  const db = connect();
  const kraji = await naloziKraje(db);
  const { data: sedData } = await db.from("nep_turizem_obcine").select("obcina, lat, lng").not("lat", "is", null);
  const sedezi = (sedData ?? []) as Sedez[];
  const najblizjaObcina = (lat: number, lng: number): string | null => {
    let naj: { o: string; km: number } | null = null;
    for (const s of sedezi) {
      const km = razdaljaKm(lat, lng, s.lat, s.lng);
      if (!naj || km < naj.km) naj = { o: s.obcina, km };
    }
    return naj && naj.km <= 25 ? naj.o : null;
  };

  const oglasi = await preberiVse<Oglas>(db, "nep_oglasi", "id, vir, kraj, regija, agencija, lat, lng, drzava");
  console.log(`Oglasov: ${oglasi.length}`);

  // 1. Agencije: delež nedvoumno hrvaških oglasov.
  const agencije = new Map<string, { hr: number; si: number }>();
  const nedvoumno = new Map<string, "SI" | "HR" | "?" | null>();
  const delnih = new Set<string>();
  for (const o of oglasi) {
    const { d, delno } = drzaveKraja(o.kraj, kraji);
    if (delno) delnih.add(o.id);
    const n = d.size === 1 ? ([...d][0] as "SI" | "HR") : d.size > 1 ? "?" : null;
    nedvoumno.set(o.id, n);
    if (o.agencija && !delno && (n === "SI" || n === "HR")) {
      const a = agencije.get(o.agencija) ?? { hr: 0, si: 0 };
      if (n === "HR") a.hr += 1;
      else a.si += 1;
      agencije.set(o.agencija, a);
    }
  }
  const glasAgencije = (o: Oglas): "SI" | "HR" | null => {
    const a = o.agencija ? agencije.get(o.agencija) : undefined;
    if (!a || a.hr + a.si < 10) return null;
    if (a.hr / (a.hr + a.si) >= 0.8) return "HR";
    if (a.si / (a.hr + a.si) >= 0.8) return "SI";
    return null;
  };
  // Vir pod "cel katalog" objavlja tudi Ciper, Turčijo, Španijo … Taki oglasi niso
  // ne SI ne HR; kraj "Limassol, Ciper" bi po delih sicer našel kakšen soimenjak.
  const TUJINA = /ciper|cyprus|tujina|španij|spanij|turčij|turcij|dubaj|italij|avstrij|črna gora|crna gora|srbij|bosn|egipt|grčij|grcij|bolgarij|madžarsk/i;
  const drzavaOglasa = (o: Oglas): string | null => {
    if (o.kraj && TUJINA.test(o.kraj)) return null;
    const n = nedvoumno.get(o.id) ?? null;
    // Pri delnem zadetku ("Grad - Meje") ima odločna agencija prednost pred imenom.
    if ((n === "SI" || n === "HR") && delnih.has(o.id)) return glasAgencije(o) ?? n;
    if (n === "SI" || n === "HR") return n;
    if (n === "?" || n === null) {
      const a = o.agencija ? agencije.get(o.agencija) : undefined;
      if (a && a.hr + a.si >= 10) {
        if (a.hr / (a.hr + a.si) >= 0.8) return "HR";
        if (a.si / (a.hr + a.si) >= 0.8) return "SI";
      }
      // Soimenjak brez odločilne agencije: isto privzeto kot geokoder.
      // Neznan kraj brez odločilne agencije pa ostane neznan.
      return n === "?" ? "SI" : null;
    }
    return null;
  };

  // 2. Nauči se občina -> regija iz pravilnih rezin nepremicnine.net.
  const glasovi = new Map<string, Map<string, number>>();
  for (const o of oglasi) {
    if (o.vir !== "nepremicnine.net" || !o.regija || POKVARJENE.has(o.regija) || o.lat === null || o.lng === null) continue;
    const ob = najblizjaObcina(Number(o.lat), Number(o.lng));
    if (!ob) continue;
    const g = glasovi.get(ob) ?? new Map<string, number>();
    g.set(o.regija, (g.get(o.regija) ?? 0) + 1);
    glasovi.set(ob, g);
  }
  const obcinaRegija = new Map<string, string>();
  for (const ob of OBALNO_KRASKA) obcinaRegija.set(ob, "obalno-kraska");
  for (const ob of GORISKA) obcinaRegija.set(ob, "goriska");
  // Mestna občina Ljubljana je v shemi vira "ljubljana-mesto"; glasovanje bi jo
  // zaradi krajev iz okolice, ki jim je sedež MOL najbližji, lahko spustilo.
  obcinaRegija.set("Ljubljana", "ljubljana-mesto");
  for (const [ob, g] of glasovi) {
    if (obcinaRegija.has(ob)) continue;
    const vsota = [...g.values()].reduce((a, b) => a + b, 0);
    const [reg, n] = [...g.entries()].sort((a, b) => b[1] - a[1])[0];
    if (vsota >= 3 && n / vsota >= 0.7) obcinaRegija.set(ob, reg);
  }
  /**
   * Občine brez dovolj oglasov (Trzin, Dol pri Ljubljani …) dobijo regijo
   * najbližje občine, ki jo ima: statistične regije so sklenjena ozemlja, zato
   * je najbližji znani sosed skoraj vedno v isti regiji.
   */
  const naucenih = obcinaRegija.size;
  for (const s of sedezi) {
    if (obcinaRegija.has(s.obcina)) continue;
    let naj: { r: string; km: number } | null = null;
    for (const t of sedezi) {
      const r = obcinaRegija.get(t.obcina);
      if (!r || t.obcina === s.obcina) continue;
      const km = razdaljaKm(s.lat, s.lng, t.lat, t.lng);
      if (!naj || km < naj.km) naj = { r, km };
    }
    if (naj && naj.km <= 30) obcinaRegija.set(s.obcina, naj.r);
  }
  console.log(`Občin z znano regijo: ${obcinaRegija.size} (21 na roko + Ljubljana, ${naucenih - 22} naučenih, ostale po najbližjem sosedu)`);

  // 3. Izračun sprememb.
  const spremembe = new Map<string, string[]>(); // "drzava|regija|samoDrzava" -> id-ji
  let hrVPokvarjenih = 0;
  let siPrerazvrscenih = 0;
  let siBrezRegije = 0;
  const brezRegijeKraji = new Map<string, number>();
  for (const o of oglasi) {
    const drzava = drzavaOglasa(o);
    let regija = o.regija;
    let spremeniRegijo = false;
    if (o.vir === "nepremicnine.net" && o.regija && POKVARJENE.has(o.regija)) {
      spremeniRegijo = true;
      if (drzava === "HR") {
        regija = null;
        hrVPokvarjenih += 1;
      } else {
        let k: KrajVrstica | null = o.kraj ? najdiKraj(o.kraj, kraji, "SI") : null;
        if (k && k.drzava !== "SI") k = null;
        const lat = k?.lat ?? (o.lat !== null ? Number(o.lat) : null);
        const lng = k?.lng ?? (o.lng !== null ? Number(o.lng) : null);
        const ob = lat !== null && lng !== null ? najblizjaObcina(lat, lng) : null;
        // MOL je velika: Črnuče so bližje sedežu Trzina kot središču Ljubljane.
        // Do 8 km od središča je MOL (Trzin, Dol, Škofljica so dlje).
        const vMol = lat !== null && lng !== null && razdaljaKm(lat, lng, 46.05108, 14.50513) <= 8;
        regija = vMol ? "ljubljana-mesto" : ob ? obcinaRegija.get(ob) ?? null : null;
        if (regija) siPrerazvrscenih += 1;
        else {
          siBrezRegije += 1;
          const kk = `${drzava ?? "?"} ${o.kraj ?? "-"}`;
          brezRegijeKraji.set(kk, (brezRegijeKraji.get(kk) ?? 0) + 1);
        }
      }
    }
    if (drzava === o.drzava && (!spremeniRegijo || regija === o.regija)) continue;
    const kljuc = `${drzava ?? ""}|${spremeniRegijo ? (regija ?? "") : "~"}`;
    spremembe.set(kljuc, [...(spremembe.get(kljuc) ?? []), o.id]);
  }

  const skupaj = [...spremembe.values()].reduce((a, b) => a + b.length, 0);
  console.log(`Hrvaških v pokvarjenih rezinah: ${hrVPokvarjenih}; slovenskih prerazvrščenih: ${siPrerazvrscenih}; slovenskih brez določljive regije: ${siBrezRegije}`);
  console.log(`Vrstic za spremembo: ${skupaj}${SUHO ? " (SUHO)" : ""}`);
  if (process.argv.includes("--izpisi")) console.log("Brez regije (najpogostejši):", [...brezRegijeKraji.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30));
  const poDrzavi = new Map<string, number>();
  for (const o of oglasi) {
    const d = drzavaOglasa(o) ?? "?";
    poDrzavi.set(d, (poDrzavi.get(d) ?? 0) + 1);
  }
  console.log("Po državi:", Object.fromEntries(poDrzavi));
  if (SUHO) return;

  for (const [kljuc, idji] of spremembe) {
    const [drzava, regija] = kljuc.split("|");
    const vrednosti: Record<string, unknown> = { drzava: drzava || null };
    if (regija !== "~") vrednosti.regija = regija || null;
    for (let i = 0; i < idji.length; i += 300) {
      const { error } = await db.from("nep_oglasi").update(vrednosti).in("id", idji.slice(i, i + 300));
      if (error) throw new Error(`Zapis ${kljuc}: ${error.message}`);
    }
  }
  console.log("Zapisano.");
  await new Promise((r) => setTimeout(r, 300));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
