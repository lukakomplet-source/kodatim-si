import { chromium, type Browser, type BrowserContext } from "playwright";
import type { Db } from "./db.js";
import { preveriIzziv, razbremeniKontekst } from "./izziv.js";
import type { Detajl, VirAdapter } from "./viri/vmesnik.js";

/**
 * 2. FAZA — detajlne strani oglasov.
 *
 * Zakaj sploh: seznam pove ceno, kraj in kvadraturo, ne pa števila sob,
 * energetske izkaznice, ogrevanja, opreme, parkirišča ali cele galerije. Brez
 * teh polj po njih ni mogoče filtrirati, kar je bila izrecna zahteva.
 *
 * Zakaj počasi in po kvoti: detajlna stran je ena zahteva na oglas. 10.768
 * aktivnih oglasov krat 6 sekund je 18 ur neprekinjenega branja — to bi bilo
 * nadležno in bi nas vir upravičeno ustavil. Namesto tega vsak krog vzame
 * kvoto (nekaj sto), vrsta pa se prazni v dneh. Enak vzorec kot rotacija rezin
 * v 1. fazi in enak, kot se je obnesel pri avtomobilih.
 *
 * Trije zakoni te datoteke:
 *  1. Nič se ne prepiše v prazno. Polje, ki ga stran ne pove, se ne zapiše.
 *  2. Blokada ustavi fazo takoj. Ne poskušamo hitreje, drugače ali z drugim
 *     naslovom — počakamo in nadaljujemo kasneje.
 *  3. Vsak neuspeh je zapisan pri oglasu (poskus + parkirnina), ne samo v
 *     dnevniku. Oglas, ki ruši obdelavo, ne sme biti vsak dan prvi na vrsti.
 */

export type IzidDetajlov = {
  obdelanih: number;
  napak: number;
  izginulih: number;
  /** Vir je zavrnil — faza se je ustavila predčasno in to je treba povedati. */
  blokada: string | null;
  /** Koliko oglasov tega vira še čaka v vrsti (po tem krogu). */
  ostalo: number;
};

type Vrstica = {
  id: string;
  url: string;
  vir_id: string;
  detajl_poskusov: number | null;
  cena_eur: number | string | null;
  povrsina_m2: number | string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function zOmejitvijo<T>(kaj: string, delo: Promise<T>, ms = 60_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Klic "${kaj}" se ni odzval v ${ms / 1000} s`)), ms);
    delo.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Preslikava v vrstico baze. Pravilo "nič se ne prepiše v prazno" je tu
 * strožje kot pri seznamih: `undefined` pomeni "vir tega ne pove" in polja se
 * sploh ne dotakne, `null` pa "vir pravi, da tega ni" — a tudi tega ne pišemo
 * čez obstoječo vrednost, ker en spodletel parse ne sme izbrisati podatka,
 * ki ga je prejšnji zajem pravilno prebral.
 */
export function vrsticaIzDetajla(d: Detajl): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const pisi = (polje: string, vrednost: unknown) => {
    if (vrednost === undefined || vrednost === null || vrednost === "") return;
    out[polje] = vrednost;
  };

  pisi("povrsina_m2", d.povrsinaM2);
  pisi("zemljisce_m2", d.zemljisceM2);
  pisi("st_sob", d.stSob);
  pisi("st_spalnic", d.stSpalnic);
  pisi("st_kopalnic", d.stKopalnic);
  pisi("leto_izgradnje", d.letoIzgradnje);
  pisi("leto_adaptacije", d.letoAdaptacije);
  pisi("nadstropje", d.nadstropje);
  pisi("etaznost", d.etaznost);
  pisi("energetski_razred", d.energetskiRazred);
  pisi("ogrevanje", d.ogrevanje);
  pisi("stanje", d.stanje);
  pisi("opremljenost", d.opremljenost);
  pisi("lastnistvo", d.lastnistvo);
  pisi("parkirno", d.parkirno);
  pisi("balkon", d.balkon);
  pisi("terasa", d.terasa);
  pisi("vrt", d.vrt);
  pisi("klet", d.klet);
  pisi("dvigalo", d.dvigalo);
  pisi("sifra_oglasa", d.sifraOglasa);
  pisi("datum_objave", d.datumObjave);
  pisi("posrednik", d.posrednik);
  pisi("agencija", d.agencija);
  pisi("telefon", d.telefon);
  pisi("opis", d.opis);
  pisi("kraj", d.kraj);
  if (d.slikeUrls && d.slikeUrls.length > 0) {
    out.slike_urls = d.slikeUrls;
    out.st_slik = d.slikeUrls.length;
  }
  if (d.lastnosti && Object.keys(d.lastnosti).length > 0) out.detajl_raw = d.lastnosti;
  return out;
}

/**
 * En krog 2. faze za en vir.
 *
 * `objavi` je klic nazaj v vrstico pregleda, da konzola vidi napredek sproti;
 * brez njega bi bila ura branja neločljiva od ure zataknjenosti.
 */
export async function zajemiDetajle(
  db: Db,
  vir: VirAdapter,
  log: (lvl: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void,
  objavi: (podatki: Record<string, unknown>) => Promise<void>,
  utrip: () => void,
  ustavljeno: () => boolean
): Promise<IzidDetajlov> {
  const izid: IzidDetajlov = { obdelanih: 0, napak: 0, izginulih: 0, blokada: null, ostalo: 0 };
  if (!vir.detajli) return izid;

  /**
   * `slikePolitika` je bila doslej deklaracija, ki je ni bral nihče — torej
   * varovalka, ki bi ob prvi napačni nastavitvi tiho odpovedala. Zdaj jo
   * kdo prebere: prenašalca datotek ta koda nima in ga tudi ne sme imeti
   * brez licence vira, zato je "lokalno" napaka in ne tiha možnost.
   */
  if (vir.slikePolitika !== "referenca") {
    throw new Error(
      `Vir ${vir.vir} ima slikePolitika="${vir.slikePolitika}", ta zbiralnik pa slik NE kopira. ` +
        `Lokalna kopija zahteva licenco vira in svoj prenašalec; do takrat hranimo samo naslove.`
    );
  }

  const zdaj = new Date().toISOString();
  const POLJA = "id, url, vir_id, detajl_poskusov, cena_eur, povrsina_m2";
  /**
   * Oglas, ki se po toliko poskusih še vedno ne da prebrati, ni več kandidat.
   * Brez te meje je pokvarjena stran vsak krog spet med prvimi in jemlje
   * kvoto oglasom, ki bi se prebrali.
   */
  const NAJVEC_POSKUSOV = 6;
  const osnova = () =>
    db
      .from("nep_oglasi")
      .select(POLJA)
      .eq("vir", vir.vir)
      .eq("status", "aktiven")
      .is("detajl_zajet", null)
      .lt("detajl_poskusov", NAJVEC_POSKUSOV)
      .or(`detajl_naslednji_poskus.is.null,detajl_naslednji_poskus.lt.${zdaj}`);

  /**
   * VRSTA JE MEŠANA, NE SAMO NAJNOVEJŠA.
   *
   * Če vsak krog vzame N najnovejših, rep zaostanka nikoli ne pride na vrsto:
   * dokler vir objavlja več novih oglasov na dan, kot jih kvota zmore, se
   * najstarejši čakajoči ne premakne nikoli. Zato gre četrtina kvote
   * najstarejšim — najprej tisti, ki čakajo najdlje.
   */
  const kvota = vir.detajli.kvota;
  const zaRep = Math.max(1, Math.floor(kvota / 4));
  const [noviRes, stariRes] = await Promise.all([
    osnova().order("first_seen", { ascending: false }).limit(kvota - zaRep),
    osnova().order("first_seen", { ascending: true }).limit(zaRep),
  ]);
  if (noviRes.error) throw new Error(`Branje vrste detajlov ni uspelo: ${noviRes.error.message}`);
  if (stariRes.error) throw new Error(`Branje repa vrste ni uspelo: ${stariRes.error.message}`);

  // Oba seznama se lahko prekrivata, kadar je čakajočih malo.
  const poId = new Map<string, Vrstica>();
  for (const v of [...((noviRes.data ?? []) as Vrstica[]), ...((stariRes.data ?? []) as Vrstica[])]) {
    poId.set(v.id, v);
  }
  const vrsta = [...poId.values()];
  const { count: skupajCaka } = await db
    .from("nep_oglasi")
    .select("id", { count: "exact", head: true })
    .eq("vir", vir.vir)
    .eq("status", "aktiven")
    .is("detajl_zajet", null);
  izid.ostalo = skupajCaka ?? 0;

  if (vrsta.length === 0) {
    log("info", "2. faza: vrsta je prazna", { vir: vir.vir });
    return izid;
  }
  log("info", "2. faza zacetek", { vir: vir.vir, vVrsti: vrsta.length, sePreostane: izid.ostalo });
  // Skupno število objavimo TAKOJ, ne šele na koncu: brez tega konzola ves čas
  // 2. faze deli z ničlo in trak napredka se sploh ne pokaže.
  await objavi({ detajlov_skupaj: izid.ostalo, detajlov_obdelanih: 0 });

  let browser: Browser | null = null;
  const skupni: { ctx: BrowserContext | null } = { ctx: null };
  const novKontekst = async () => {
    const ctx = await zOmejitvijo(
      "newContext",
      browser!.newContext({
        locale: "sl-SI",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      })
    );
    // Galerijo hranimo kot NASLOVE slik; datotek ne potrebujemo in vira z
    // njihovim prenosom ne obremenjujemo.
    await razbremeniKontekst(ctx).catch(() => {});
    return ctx;
  };

  try {
    browser = await zOmejitvijo("chromium.launch", chromium.launch({ args: ["--no-sandbox"] }), 90_000);

    for (const o of vrsta) {
      if (ustavljeno()) break;
      const ctx = vir.svezKontekstNaStran ? await novKontekst() : (skupni.ctx ??= await novKontekst());
      try {
        const page = await zOmejitvijo("newPage", ctx.newPage());
        try {
          const r = await zOmejitvijo(
            "goto",
            page.goto(o.url, { waitUntil: "domcontentloaded", timeout: 45_000 }),
            60_000
          );
          const status = r?.status() ?? 0;

          if (status === 403 || status === 429) throw new Error(`HTTP ${status} - vir blokira`);

          // 404/410 je dokončen odgovor: oglasa ni več. To je zanesljivejši
          // dokaz od odsotnosti s seznama, zato tu dvo-udarčnega pravila ne
          // potrebujemo — a vseeno zapišemo dogodek, da je sprememba vidna.
          if (status === 404 || status === 410) {
            await db
              .from("nep_oglasi")
              .update({ status: "izginil", status_spremenjen: new Date().toISOString(), detajl_zajet: new Date().toISOString() })
              .eq("id", o.id)
              .eq("status", "aktiven");
            await db.from("nep_spremembe").insert({
              oglas_id: o.id,
              tip: "status",
              staro: { status: "aktiven" },
              novo: { status: "izginil", opomba: `detajlna stran vrne HTTP ${status}` },
            });
            izid.izginulih += 1;
            utrip();
            await sleep(vir.detajli.zamikMs);
            continue;
          }

          await sleep(1200);
          // Zaslon "dokaži, da nisi robot" pride s statusom 200 in bi se sicer
          // bral kot prazna stran. Prepoznamo ga in odidemo — nikoli ne rešimo.
          await preveriIzziv(page);
          const detajl = await zOmejitvijo("preberiDetajl", vir.detajli.preberi(page));

          // Stran, ki ne vrne nobenega podatka, je skoraj vedno izziv ali
          // spremenjen predlog — ne pa oglas brez lastnosti. Šteje kot napaka,
          // da tiha okvara parserja ne izgleda kot uspešno prazen zajem.
          const vrsticaBaze = vrsticaIzDetajla(detajl);
          if (Object.keys(vrsticaBaze).length === 0) throw new Error("detajlna stran brez podatkov");

          /**
           * Cena na kvadratni meter se izračuna ob zapisu cene ALI površine.
           * Prej jo je računal samo zapis s seznama; kadar je površino prinesla
           * šele 2. faza (kar je pri bolhi pravilo), je `cena_m2_eur` ostala
           * prazna za vedno — in prav ta stolpec nosita razvrstitev
           * "najnižja cena/m²" in izračun poslov.
           *
           * PostgREST vrne numerične vrednosti kot NIZE, zato Number() pred
           * vsakim izračunom.
           */
          const novaPovrsina = (vrsticaBaze.povrsina_m2 as number | undefined) ?? Number(o.povrsina_m2 ?? NaN);
          const cena = Number(o.cena_eur ?? NaN);
          if (Number.isFinite(cena) && cena > 0 && Number.isFinite(novaPovrsina) && novaPovrsina > 0) {
            vrsticaBaze.cena_m2_eur = Math.round((cena / novaPovrsina) * 100) / 100;
          }

          const { error: e } = await db
            .from("nep_oglasi")
            .update({ ...vrsticaBaze, detajl_zajet: new Date().toISOString(), detajl_naslednji_poskus: null })
            .eq("id", o.id);
          if (e) throw new Error(`Zapis detajla ni uspel: ${e.message}`);

          izid.obdelanih += 1;
          utrip();
          if (izid.obdelanih % 10 === 0) await objavi({ detajlov_obdelanih: izid.obdelanih });
        } finally {
          if (!vir.svezKontekstNaStran) await zOmejitvijo("closePage", page.close(), 15_000).catch(() => {});
        }
      } catch (err) {
        const sporocilo = err instanceof Error ? err.message : String(err);
        izid.napak += 1;
        // Utrip tudi ob napaki: nadzornik zataknjenosti meri čas od zadnjega
        // premika in bi proces, ki mu vsaka stran vrne časovno omejitev, po
        // 25 minutah ubil sredi zapisovanja — čeprav bi delal, kar mora.
        utrip();
        await db.from("nep_napake").insert({ vir: vir.vir, url: o.url, tip: "detajl", sporocilo });

        if (/vir blokira|HTTP 403|HTTP 429/.test(sporocilo)) {
          izid.blokada = sporocilo;
          log("warn", "2. faza ustavljena - vir blokira", { vir: vir.vir, sporocilo });
          break;
        }

        // Parkirnina raste s poskusi: 1 h, 4 h, 12 h, nato dan. Oglas, ki se ne
        // da prebrati, tako ne zaseda vrste vsakega kroga.
        const poskusov = (o.detajl_poskusov ?? 0) + 1;
        const ur = poskusov >= 4 ? 24 : poskusov >= 3 ? 12 : poskusov >= 2 ? 4 : 1;
        await db
          .from("nep_oglasi")
          .update({
            detajl_poskusov: poskusov,
            detajl_naslednji_poskus: new Date(Date.now() + ur * 3_600_000).toISOString(),
          })
          .eq("id", o.id);
        log("warn", "detajl ni uspel", { vir: vir.vir, virId: o.vir_id, poskusov, sporocilo });
      } finally {
        if (vir.svezKontekstNaStran) await zOmejitvijo("close", ctx.close(), 15_000).catch(() => {});
      }

      if (izid.blokada) break;
      await sleep(vir.detajli.zamikMs);
    }
  } finally {
    if (skupni.ctx) await skupni.ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  const { count: seCaka } = await db
    .from("nep_oglasi")
    .select("id", { count: "exact", head: true })
    .eq("vir", vir.vir)
    .eq("status", "aktiven")
    .is("detajl_zajet", null);
  izid.ostalo = seCaka ?? 0;

  log("info", "2. faza koncana", { vir: vir.vir, ...izid });
  return izid;
}
