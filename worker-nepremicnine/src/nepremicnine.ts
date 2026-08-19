import type { Db } from "./db.js";
import { kandidatiIzKraja, najdiKraj, type KrajVrstica } from "../../src/lib/nepremicnine/kraji.js";

/**
 * Kanonična nepremičnina: isti fizični objekt pod več oglasi (ponovna objava,
 * kasneje več portalov). Zgrajeno po vzorcu worker-avtonet/src/vozila.ts, ki
 * je preživel produkcijo: točkovanje s TRDIMI izpadi, prag 80 za samodejno
 * povezavo, 60–79 v čakalnico za človeka, in pravilo, da se znotraj ISTEGA
 * vira samodejno povezuje samo ponovna objava (stari oglas je izginil, preden
 * se je novi pojavil) — dve hkrati aktivni enoti novogradnje imata namreč
 * enako površino, leto, kraj IN telefon agencije, pa nista isti objekt.
 */

export const PRAG_POVEZAVE = 80;
export const PRAG_KANDIDATA = 60;

export type OglasZaPovezavo = {
  id: string;
  vir: string;
  vir_id: string;
  tip: string | null;
  posel: string;
  kraj: string | null;
  regija: string | null;
  povrsina_m2: number | null;
  zemljisce_m2: number | null;
  leto_izgradnje: number | null;
  telefon: string | null;
  agencija: string | null;
  slika_url: string | null;
  naslov: string | null;
  cena_eur: number | null;
  first_seen: string;
  last_seen: string;
  status: string;
  status_spremenjen: string | null;
  nepremicnina_id: string | null;
  lat: number | null;
  lng: number | null;
};

const kljuc = (v: string | null) => (v ?? "").toLowerCase().replace(/[^a-z0-9čšžćđ]+/gi, " ").trim();
const stevke = (v: string | null) => (v ?? "").replace(/\D/g, "").slice(-8);

function razlikaPct(a: number, b: number): number {
  const m = Math.max(Math.abs(a), Math.abs(b));
  return m === 0 ? 0 : Math.abs(a - b) / m;
}

export type OcenaPara = { tocke: number; razlogi: string[] } | null;

/**
 * Koliko točk za "to je ista nepremičnina". null = zanesljivo NI ista
 * (trdi izpad). Točke so umerjene tako, da mora relist brez telefona/slike
 * imeti popolnoma enako površino, kraj, leto in tip, da doseže prag 80.
 */
export function oceniIstaNepremicnina(a: OglasZaPovezavo, b: OglasZaPovezavo): OcenaPara {
  // posel in tip morata biti enaka — prodajo in oddajo istega objekta poveže
  // kvečjemu človek, samodejno pa ne (premalo signalov za razlikovanje).
  if (a.posel !== b.posel) return null;
  if (a.tip && b.tip && a.tip !== b.tip) return null;

  const razlogi: string[] = [];
  let tocke = 10; // izhodišče: isti vir-tip-posel prostor
  razlogi.push("isti tip in posel +10");

  // Površina: najmočnejši številski signal.
  if (a.povrsina_m2 !== null && b.povrsina_m2 !== null) {
    const r = razlikaPct(a.povrsina_m2, b.povrsina_m2);
    if (r > 0.03) return null;
    const d = r < 0.005 ? 30 : 25;
    tocke += d;
    razlogi.push(`površina ${a.povrsina_m2}≈${b.povrsina_m2} +${d}`);
  }

  // Zemljišče: obe znani in različni > 10 % -> ni ista parcela.
  if (a.zemljisce_m2 !== null && b.zemljisce_m2 !== null) {
    if (razlikaPct(a.zemljisce_m2, b.zemljisce_m2) > 0.1) return null;
    tocke += 15;
    razlogi.push("zemljišče se ujema +15");
  }

  // Leto izgradnje: znano in različno -> drug objekt.
  if (a.leto_izgradnje !== null && b.leto_izgradnje !== null) {
    if (a.leto_izgradnje !== b.leto_izgradnje) return null;
    tocke += 10;
    razlogi.push(`leto ${a.leto_izgradnje} +10`);
  }

  // Kraj: presek normaliziranih kandidatov ("Lj. Center" ∩ "Ljubljana").
  if (a.kraj && b.kraj) {
    const ka = kandidatiIzKraja(a.kraj);
    const kb = new Set(kandidatiIzKraja(b.kraj));
    if (ka.some((k) => kb.has(k))) {
      tocke += 15;
      razlogi.push("kraj se ujema +15");
    } else {
      return null;
    }
  }

  // Telefon: močan signal, a agencija prodaja veliko objektov — samo plus.
  const ta = stevke(a.telefon);
  const tb = stevke(b.telefon);
  if (ta && tb && ta === tb) {
    tocke += 20;
    razlogi.push("isti telefon +20");
  }

  if (a.agencija && b.agencija && kljuc(a.agencija) === kljuc(b.agencija)) {
    tocke += 8;
    razlogi.push("ista agencija +8");
  }

  // Ista naslovna slika pri viru = skoraj dokaz (prodajalci ponovno
  // uporabijo fotografije) — kot pri avtih.
  if (a.slika_url && b.slika_url && a.slika_url === b.slika_url) {
    tocke += 30;
    razlogi.push("ista slika +30");
  }

  // Skupne besede naslova (brez kraja, ki je že štet).
  if (a.naslov && b.naslov) {
    const wa = new Set(kljuc(a.naslov).split(" ").filter((w) => w.length > 3));
    const wb = kljuc(b.naslov).split(" ").filter((w) => w.length > 3);
    const skupnih = wb.filter((w) => wa.has(w)).length;
    if (skupnih >= 2) {
      const d = Math.min(8, skupnih * 2);
      tocke += d;
      razlogi.push(`naslov ${skupnih} skupnih besed +${d}`);
    }
  }

  // Cena nikoli ne izloči (spreminja se), bližina le malo pomaga.
  if (a.cena_eur !== null && b.cena_eur !== null && razlikaPct(Number(a.cena_eur), Number(b.cena_eur)) <= 0.2) {
    tocke += 5;
    razlogi.push("cena ±20 % +5");
  }

  return { tocke: Math.min(100, tocke), razlogi };
}

/** Znotraj istega vira je samodejna povezava dovoljena le za ponovno objavo. */
export function jePonovnaObjava(nov: OglasZaPovezavo, star: OglasZaPovezavo): boolean {
  if (star.status !== "izginil") return false;
  const konecStarega = star.status_spremenjen ?? star.last_seen;
  return new Date(konecStarega).getTime() <= new Date(nov.first_seen).getTime();
}

/** Vedro za primerjavo: tip + prvi kraj-kandidat — pari se iščejo le znotraj. */
export function vedro(o: OglasZaPovezavo): string {
  const k = o.kraj ? (kandidatiIzKraja(o.kraj)[0] ?? "?") : "?";
  return `${o.tip ?? "?"}|${k}`;
}

// ---------------------------------------------------------------------------

/** Najmanjši del PostgREST graditelja, ki ga filtri rabijo — brez `any`. */
export type Graditelj = {
  eq(k: string, v: unknown): Graditelj;
  in(k: string, v: unknown[]): Graditelj;
  gt(k: string, v: unknown): Graditelj;
  gte(k: string, v: unknown): Graditelj;
  lt(k: string, v: unknown): Graditelj;
  lte(k: string, v: unknown): Graditelj;
  ilike(k: string, v: string): Graditelj;
  is(k: string, v: unknown): Graditelj;
  not(k: string, op: string, v: unknown): Graditelj;
};

export async function preberiVse<T>(
  db: Db,
  tabela: string,
  polja: string,
  filter?: (q: Graditelj) => Graditelj
): Promise<T[]> {
  const vse: T[] = [];
  for (let od = 0; ; od += 1000) {
    let q = db.from(tabela).select(polja).range(od, od + 999);
    if (filter) q = filter(q as unknown as Graditelj) as unknown as typeof q;
    const { data, error } = await q;
    if (error) throw new Error(`Branje ${tabela}: ${error.message}`);
    vse.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return vse;
}

export async function naloziKraje(db: Db): Promise<Map<string, KrajVrstica[]>> {
  const vrstice = await preberiVse<KrajVrstica>(db, "nep_kraji", "ime, ime_norm, drzava, lat, lng, prebivalcev");
  const poNorm = new Map<string, KrajVrstica[]>();
  for (const v of vrstice) {
    const arr = poNorm.get(v.ime_norm) ?? [];
    arr.push(v);
    poNorm.set(v.ime_norm, arr);
  }
  return poNorm;
}

/**
 * Regije, kjer tuj istoimenski kraj skoraj zagotovo pomeni napačen zadetek.
 *
 * "obalno-kraska" NAMENOMA ni na seznamu: vir pod to regijo objavlja tudi vse
 * tujino (Istra, Zagreb, Turčija, Ciper), zato bi jih pravilo pustilo brez
 * koordinat. Tam se zanesemo na to, da najdiKraj ob enakem imenu izbere
 * slovenski kraj.
 */
const SI_REGIJE = new Set([
  "ljubljana-mesto", "ljubljana-okolica", "podravska", "savinjska", "gorenjska",
  "dolenjska", "notranjska", "goriska", "koroska",
  "pomurska", "posavska", "zasavska",
]);

/** Mestne regije: če četrti ("Murgle", "Vodmat") ni v šifrantu, velja mesto. */
const REGIJA_REZERVA: Record<string, string> = { "ljubljana-mesto": "ljubljana" };

/** Oglasom brez koordinat pripiše centroid kraja (označeno kot približno). */
export async function geokodirajOglase(db: Db, kraji: Map<string, KrajVrstica[]>): Promise<number> {
  const brez = await preberiVse<{ id: string; kraj: string | null; regija: string | null }>(
    db, "nep_oglasi", "id, kraj, regija", (q) => q.is("lat", null).not("kraj", "is", null)
  );
  let zadetih = 0;
  for (let i = 0; i < brez.length; i += 50) {
    const paket = brez.slice(i, i + 50);
    await Promise.all(
      paket.map(async (o) => {
        let k = o.kraj ? najdiKraj(o.kraj, kraji) : null;
        // Raje brez koordinate kot z napačno: oglas iz slovenske regije, ki bi
        // se ujel le s tujim istoimenskim krajem, ostane negeokodiran.
        if (k && o.regija && SI_REGIJE.has(o.regija) && k.drzava !== "SI") k = null;
        if (!k && o.regija && REGIJA_REZERVA[o.regija]) k = najdiKraj(REGIJA_REZERVA[o.regija], kraji);
        if (!k) return;
        const { error } = await db
          .from("nep_oglasi")
          .update({ lat: k.lat, lng: k.lng, lokacija_natancnost: "priblizno" })
          .eq("id", o.id);
        if (!error) zadetih += 1;
      })
    );
  }
  return zadetih;
}

export type IzidPovezovanja = { novihNepremicnin: number; povezav: number; kandidatov: number };

/**
 * Vsak oglas brez nepremicnina_id dobi kanonični zapis: bodisi se poveže z
 * obstoječo nepremičnino (ponovna objava, >= 80 točk), bodisi dobi svojo.
 * Sivi pas (60–79) gre v nep_zdruzitve kot 'kandidat' in počaka človeka.
 * Idempotentno: že povezanih oglasov se ne dotika.
 */
export async function poveziNepremicnine(db: Db, log: (msg: string) => void): Promise<IzidPovezovanja> {
  const polja =
    "id, vir, vir_id, tip, posel, kraj, regija, povrsina_m2, zemljisce_m2, leto_izgradnje, telefon, agencija, slika_url, naslov, cena_eur, first_seen, last_seen, status, status_spremenjen, nepremicnina_id, lat, lng";
  const vsi = (await preberiVse<OglasZaPovezavo>(db, "nep_oglasi", polja)).map((o) => ({
    ...o,
    povrsina_m2: o.povrsina_m2 === null ? null : Number(o.povrsina_m2),
    zemljisce_m2: o.zemljisce_m2 === null ? null : Number(o.zemljisce_m2),
  }));
  const izid: IzidPovezovanja = { novihNepremicnin: 0, povezav: 0, kandidatov: 0 };

  const nepovezani = vsi.filter((o) => o.nepremicnina_id === null);
  if (nepovezani.length === 0) return izid;
  log(`povezovanje: ${nepovezani.length} nepovezanih od ${vsi.length}`);

  // Vedra čez VSE oglase (nov nepovezan se primerja tudi z že povezanimi).
  const vedra = new Map<string, OglasZaPovezavo[]>();
  for (const o of vsi) {
    const v = vedro(o);
    const arr = vedra.get(v) ?? [];
    arr.push(o);
    vedra.set(v, arr);
  }

  // Novi po first_seen naraščajoče: starejši nepovezani se povežejo prvi in
  // lahko postanejo tarča mlajših (veriga ponovnih objav).
  nepovezani.sort((x, y) => new Date(x.first_seen).getTime() - new Date(y.first_seen).getTime());

  const obstojeceKandidatne = new Set(
    (
      await preberiVse<{ oglas_id: string; nepremicnina_id: string }>(
        db, "nep_zdruzitve", "oglas_id, nepremicnina_id", (q) => q.eq("nacin", "kandidat")
      )
    ).map((z) => `${z.oglas_id}|${z.nepremicnina_id}`)
  );

  for (const nov of nepovezani) {
    let najboljsi: { star: OglasZaPovezavo; tocke: number; razlogi: string[] } | null = null;
    let kandidat: { star: OglasZaPovezavo; tocke: number; razlogi: string[] } | null = null;

    for (const star of vedra.get(vedro(nov)) ?? []) {
      if (star.id === nov.id || star.nepremicnina_id === null) continue;
      const ocena = oceniIstaNepremicnina(nov, star);
      if (!ocena) continue;

      // Isti vir: samodejno samo ponovna objava; hkrati aktivna para največ kandidat.
      const relist = nov.vir !== star.vir || jePonovnaObjava(nov, star);
      const tocke = relist ? ocena.tocke : Math.min(ocena.tocke, PRAG_POVEZAVE - 1);

      if (tocke >= PRAG_POVEZAVE && (!najboljsi || tocke > najboljsi.tocke)) {
        najboljsi = { star, tocke, razlogi: ocena.razlogi };
      } else if (tocke >= PRAG_KANDIDATA && (!kandidat || tocke > kandidat.tocke)) {
        kandidat = { star, tocke, razlogi: ocena.razlogi };
      }
    }

    if (najboljsi) {
      const nid = najboljsi.star.nepremicnina_id!;
      // Compare-and-swap: poveži samo, če je oglas ŠE nepovezan — backfill in
      // daemon smeta teči hkrati, ne da bi podvajala kanonične zapise.
      const { data: cas, error } = await db
        .from("nep_oglasi")
        .update({ nepremicnina_id: nid })
        .eq("id", nov.id)
        .is("nepremicnina_id", null)
        .select("id");
      if (error) { log(`povezava ${nov.id}: ${error.message}`); continue; }
      if ((cas ?? []).length === 0) continue; // vmes povezan drugje
      nov.nepremicnina_id = nid;
      await db.from("nep_zdruzitve").insert({
        nepremicnina_id: nid, oglas_id: nov.id, confidence: najboljsi.tocke,
        signali: { razlogi: najboljsi.razlogi, star_oglas: najboljsi.star.id }, nacin: "auto",
      });
      await db.from("nep_spremembe").insert({
        oglas_id: nov.id, tip: "status",
        staro: { opomba: "ponovna objava", prejsnji_oglas: najboljsi.star.id },
        novo: { nepremicnina_id: nid, confidence: najboljsi.tocke },
      });
      izid.povezav += 1;
    } else {
      // Svoja nepremičnina (velika večina).
      const { data, error } = await db
        .from("nep_nepremicnine")
        .insert({
          kraj: nov.kraj, regija: nov.regija, lat: nov.lat, lng: nov.lng,
          lokacija_natancnost: nov.lat !== null ? "priblizno" : null,
          prva_videna: nov.first_seen, zadnja_videna: nov.last_seen,
          aktivna: nov.status === "aktiven",
        })
        .select("id")
        .single();
      if (error || !data) { log(`nova nepremičnina ${nov.id}: ${error?.message}`); continue; }
      const nid = (data as { id: string }).id;
      const { data: cas, error: e2 } = await db
        .from("nep_oglasi")
        .update({ nepremicnina_id: nid })
        .eq("id", nov.id)
        .is("nepremicnina_id", null)
        .select("id");
      if (e2) { log(`vpis nepremicnina_id ${nov.id}: ${e2.message}`); continue; }
      if ((cas ?? []).length === 0) {
        // Vmes ga je povezal drug proces — pravkar ustvarjeni zapis pospravimo.
        await db.from("nep_nepremicnine").delete().eq("id", nid);
        continue;
      }
      nov.nepremicnina_id = nid;
      await db.from("nep_zdruzitve").insert({
        nepremicnina_id: nid, oglas_id: nov.id, confidence: 100,
        signali: { razlogi: ["prvi oglas objekta"] }, nacin: "auto",
      });
      izid.novihNepremicnin += 1;

      if (kandidat && kandidat.star.nepremicnina_id) {
        const par = `${nov.id}|${kandidat.star.nepremicnina_id}`;
        if (!obstojeceKandidatne.has(par)) {
          await db.from("nep_zdruzitve").insert({
            nepremicnina_id: kandidat.star.nepremicnina_id, oglas_id: nov.id, confidence: kandidat.tocke,
            signali: { razlogi: kandidat.razlogi, star_oglas: kandidat.star.id }, nacin: "kandidat",
          });
          obstojeceKandidatne.add(par);
          izid.kandidatov += 1;
        }
      }
    }
  }

  await osveziPovzetke(db, log);
  return izid;
}

/** Predizračunani povzetki na nep_nepremicnine — iz oglasov, v paketih. */
export async function osveziPovzetke(db: Db, log: (msg: string) => void): Promise<void> {
  const oglasi = await preberiVse<{
    nepremicnina_id: string | null; vir: string; kraj: string | null; regija: string | null;
    lat: number | null; lng: number | null; cena_eur: number | null; first_seen: string;
    last_seen: string; status: string;
  }>(db, "nep_oglasi", "nepremicnina_id, vir, kraj, regija, lat, lng, cena_eur, first_seen, last_seen, status",
    (q) => q.not("nepremicnina_id", "is", null));

  const skupine = new Map<string, typeof oglasi>();
  for (const o of oglasi) {
    const arr = skupine.get(o.nepremicnina_id!) ?? [];
    arr.push(o);
    skupine.set(o.nepremicnina_id!, arr);
  }

  // Trenutne vrednosti, da dnevni tek ne piše tisočev nespremenjenih vrstic.
  const trenutne = new Map(
    (
      await preberiVse<{ id: string; st_oglasov: number; aktivna: boolean; zadnja_videna: string; najnizja_cena_eur: number | null; lat: number | null; kraj: string | null }>(
        db, "nep_nepremicnine", "id, st_oglasov, aktivna, zadnja_videna, najnizja_cena_eur, lat, kraj"
      )
    ).map((n) => [n.id, n])
  );

  const posodobitve: { id: string; vrednosti: Record<string, unknown> }[] = [];
  for (const [nid, arr] of skupine) {
    const cene = arr.map((o) => (o.cena_eur === null ? null : Number(o.cena_eur))).filter((c): c is number => c !== null);
    const zadnji = [...arr].sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime())[0];
    const prva = arr.reduce((min, o) => (o.first_seen < min ? o.first_seen : min), arr[0].first_seen);
    const zadnja = arr.reduce((max, o) => (o.last_seen > max ? o.last_seen : max), arr[0].last_seen);
    const stVirov = new Set(arr.map((o) => o.vir)).size;
    const aktivna = arr.some((o) => o.status === "aktiven");
    const najnizja = cene.length ? Math.min(...cene) : null;

    const zdaj = trenutne.get(nid);
    if (
      zdaj &&
      zdaj.st_oglasov === arr.length &&
      zdaj.aktivna === aktivna &&
      zdaj.zadnja_videna === zadnja &&
      (zdaj.najnizja_cena_eur === null ? null : Number(zdaj.najnizja_cena_eur)) === najnizja &&
      // Geokodiranje za nazaj mora doseči tudi sicer nespremenjene zapise.
      (zdaj.lat === null ? null : Number(zdaj.lat)) === zadnji.lat &&
      zdaj.kraj === zadnji.kraj
    ) {
      continue; // nič se ni spremenilo
    }

    posodobitve.push({
      id: nid,
      vrednosti: {
        kraj: zadnji.kraj, regija: zadnji.regija, lat: zadnji.lat, lng: zadnji.lng,
        lokacija_natancnost: zadnji.lat !== null ? "priblizno" : null,
        prva_videna: prva, zadnja_videna: zadnja,
        aktivna,
        // Več oglasov kot virov = vsaj en vir je objekt objavil večkrat.
        ponovno_objavljena: arr.length > stVirov,
        st_oglasov: arr.length,
        st_virov: stVirov,
        najnizja_cena_eur: najnizja,
        najvisja_cena_eur: cene.length ? Math.max(...cene) : null,
      },
    });
  }

  if (posodobitve.length > 0) log(`povzetki: ${posodobitve.length} za posodobitev`);
  for (let i = 0; i < posodobitve.length; i += 50) {
    await Promise.all(
      posodobitve.slice(i, i + 50).map(async (p) => {
        const { error } = await db.from("nep_nepremicnine").update(p.vrednosti).eq("id", p.id);
        if (error) log(`povzetek ${p.id}: ${error.message}`);
      })
    );
  }
}
