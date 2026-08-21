import "dotenv/config";
import { createServer } from "node:http";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { seIskrenoPredstavljamo, uporabniskiAgent } from "./identiteta.js";
import { connect, oznaciIzginule, shraniOglase, type Db } from "./db.js";
import { VIRI, najdiVir } from "./viri/index.js";
import type { VirAdapter } from "./viri/vmesnik.js";
import { geokodirajOglase, naloziKraje, poveziNepremicnine } from "./nepremicnine.js";
import { izracunajPosle } from "./posli.js";
import { preveriIskanja } from "./iskanja.js";
import { zajemiDetajle } from "./detajli.js";
import { preveriIzziv, razbremeniKontekst } from "./izziv.js";
import {
  dodajPorabo,
  faktorHitrosti,
  hlajenjeDo,
  porabaDanes,
  oceniZakljucek,
  sprostiZataknjenoVrsto,
  zabelezBlokado,
  zabelezUspeh,
  zabelezi,
  zapriOsirotele,
  type IzidPregleda,
} from "./samopopravilo.js";

/**
 * SBN Nepremičnine — zbiralnik. Namenoma svoj proces (vrata 8081): če se ta
 * modul sesuje, avtomobilski sistem tega ne sme čutiti, in obratno.
 *
 * Viri se obdelujejo ZAPOREDNO (nikoli dva hkrati): ob uri iz urnika se sestavi
 * čakalnica vseh vklopljenih virov (nep_viri.omogocen), vsak vir dobi svoj
 * pregled. En pokvarjen vir ne ustavi drugih.
 *
 * Vsak pregled ima dve fazi:
 *   1. seznami   — kartice s kategorijskih strani (cena, kraj, m², opis)
 *   2. detajli   — stran posameznega oglasa (sobe, energetska izkaznica,
 *                  ogrevanje, oprema, cela galerija); kvotirana, da se baza
 *                  polni v dneh in vir nikoli ne pritisne na zavoro
 *
 * Po pregledu teče "knjigovodstvo": geokodiranje, kanonične nepremičnine, deal
 * feed, iskanja — vsak korak zavarovan, ker knjigovodstvo ne sme podreti
 * zbiranja.
 *
 * ZAKLJUČEK PREGLEDA nikoli ne ostane odprt. Delni pregled je "koncano_delno",
 * ne "napaka"; pregled, ki ga proces ni več sposoben obdelovati, se zapre sam
 * (samopopravilo.ts); zataknjen proces se konča in ga nadzornik zažene znova.
 */

const PORT = Number(process.env.PORT ?? 8081);
const POLL_MS = 15_000;
/** Brez enega samega premika toliko časa je proces zataknjen, ne priden. */
const ZATAKNJEN_MS = Number(process.env.NEP_ZATAKNJEN_MIN ?? 25) * 60_000;

let stopping = false;
let zadnjiPremik = Date.now();
let trenutnaFaza: { vir: string | null; faza: number } = { vir: null, faza: 0 };
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

function log(lvl: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), lvl, msg, ...extra }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const utrip = () => {
  zadnjiPremik = Date.now();
};

/** Trda meja okoli vsakega klica brskalnika — lekcija iz avtonet workerja. */
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
 * Proračun zahtevkov za CEL krog tega vira — obe fazi skupaj.
 *
 * `NEP_NAJVEC_STRANI` ga zniža (nikoli zviša): namenjeno preizkusu spremembe
 * v živo, da se za preverbo delovanja ne porabi cel dnevni proračun vira.
 * Ena sama funkcija zato, ker sta jo prej brali dve mesti in eno od njiju je
 * ob znižanju še vedno računalo z adapterjevo številko — 2. faza je tako
 * dobila 24 zahtevkov, ko je bil cel proračun 6.
 */
async function proracunZaVir(db: Db, vir: VirAdapter): Promise<number | undefined> {
  const meje: number[] = [];
  if (vir.najvecStrani !== undefined) meje.push(vir.najvecStrani);

  const izOkolja = Number(process.env.NEP_NAJVEC_STRANI ?? NaN);
  if (Number.isFinite(izOkolja) && izOkolja > 0) meje.push(izOkolja);

  /**
   * DNEVNA MEJA je merodajna za VSE kroge dneva skupaj. Brez nje je urnik s
   * štirimi termini pomenil štirikrat toliko obiskov, vsak krog pa je bil
   * zase videti vljuden — dokler vir ni začel vračati strani brez kartic.
   */
  if (vir.dnevnaMejaStrani !== undefined) {
    const porabljeno = await porabaDanes(db, vir.vir);
    meje.push(Math.max(0, vir.dnevnaMejaStrani - (Number.isFinite(porabljeno) ? porabljeno : vir.dnevnaMejaStrani)));
  }

  return meje.length > 0 ? Math.min(...meje) : undefined;
}

/**
 * 1. FAZA — seznami. Vrne izid; o statusu vrstice odloči klicatelj, da je
 * pravilo "kdaj je to napaka" na enem mestu (samopopravilo.oceniZakljucek).
 */
async function pregledSeznamov(
  db: Db,
  pregledId: string,
  vir: VirAdapter,
  /** Množitelj razmikov po prejšnjih blokadah (1 = nastavljena hitrost). */
  faktor: number
): Promise<IzidPregleda> {
  const zacetek = new Date().toISOString();
  const zamikMs = Math.round(vir.omejitve.zamikMs * Math.max(1, faktor));
  if (faktor > 1) log("info", "berem pocasneje po prejsnji blokadi", { vir: vir.vir, faktor, zamikMs });
  const p = { strani: 0, najdenih: 0, novih: 0, posodobljenih: 0, sprememb_cen: 0, napak: 0 };
  // Loceno od p: p gre v celoti v bazo (...p), stolpca za to ni.
  let zahtevkov = 0;
  const objavi = async (dodatno: Record<string, unknown> = {}) => {
    await db.from("nep_pregledi").update({ ...p, ...dodatno, updated_at: new Date().toISOString() }).eq("id", pregledId);
  };
  trenutnaFaza = { vir: vir.vir, faza: 1 };
  await db
    .from("nep_pregledi")
    .update({ status: "tece", zacetek, vir: vir.vir, faza: 1, updated_at: zacetek })
    .eq("id", pregledId);
  log("info", "pregled zacet", { vir: vir.vir });

  let browser: Browser | null = null;
  const videni = new Set<string>();
  let popoln = true;
  let blokada: string | null = null;
  let napaka: string | null = null;

  /**
   * Ena stran seznama. Pri virih s svezKontekstNaStran (Cloudflare pusti PRVO
   * zahtevo konteksta skozi, vsako naslednjo pošlje na izziv — izmerjeno na
   * nepremicnine.net) se za vsako stran ustvari svež kontekst (~200 ms, ob 6 s
   * razmika med stranmi nič); ostali viri obdržijo en kontekst.
   */
  const skupni: { ctx: BrowserContext | null } = { ctx: null };
  const novKontekst = async () => {
    const ctx = await zOmejitvijo(
      "newContext",
      browser!.newContext({
        locale: "sl-SI",
        userAgent: uporabniskiAgent(),
      })
    );
    // Slik, pisav in slogov ne zahtevamo: podatke beremo iz HTML-ja, vir pa
    // je zaradi njih dobil nekaj deset zahtevkov na vsako našo stran.
    await razbremeniKontekst(ctx).catch(() => {});
    return ctx;
  };
  const preberiStran = async (url: string) => {
    const ctx = vir.svezKontekstNaStran ? await novKontekst() : (skupni.ctx ??= await novKontekst());
    try {
      const page = await zOmejitvijo("newPage", ctx.newPage());
      try {
        zahtevkov += 1;
        const r = await zOmejitvijo("goto", page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }), 60_000);
        const status = r?.status() ?? 0;
        if (status === 403 || status === 429) throw new Error("HTTP " + status + " - vir blokira");
        await sleep(1500);
        // Zaslon preverjanja "ali si robot" pride s statusom 200; brez te
        // preverbe ga preberemo kot stran brez kartic in vztrajamo naprej.
        await preveriIzziv(page);
        return await zOmejitvijo("preberiSeznam", vir.preberiSeznam(page));
      } finally {
        if (!vir.svezKontekstNaStran) await zOmejitvijo("closePage", page.close(), 15_000).catch(() => {});
      }
    } finally {
      if (vir.svezKontekstNaStran) await zOmejitvijo("close", ctx.close(), 15_000).catch(() => {});
    }
  };

  /**
   * ROTACIJA REZIN. Vir zna po ~pol ure branja začeti zavračati (izmerjeno na
   * bolha.com: blokada po 60 straneh). Če bi vsak pregled začel pri prvi
   * kategoriji, bi zadnje nikoli ne prišle na vrsto. Zato si zapomnimo, kje se
   * je pregled ustavil, in naslednjič začnemo tam — v nekaj dneh je pokrit ves
   * katalog, brez hitrejšega branja.
   */
  const vseRezine = vir.rezine();
  const { data: stanjeRezin } = await db.from("nep_statistika").select("podatki").eq("kljuc", `rezine:${vir.vir}`).maybeSingle();
  const stanje = (stanjeRezin?.podatki ?? {}) as { naslednja?: number; stran?: number };
  const zacetniIndeks = Number(stanje.naslednja ?? 0) % vseRezine.length;
  const zacetnaStran = Math.max(1, Number(stanje.stran ?? 1));
  const rezineVrstniRed = [...vseRezine.slice(zacetniIndeks), ...vseRezine.slice(0, zacetniIndeks)];
  let obdelanihRezin = 0;
  /** Kje naj začne NASLEDNJI pregled: rezina in stran znotraj nje. */
  const shraniNadaljevanje = async (indeks: number, stran: number) => {
    await db.from("nep_statistika").upsert({
      kljuc: `rezine:${vir.vir}`,
      podatki: { naslednja: indeks % vseRezine.length, stran, zadnjic: new Date().toISOString() },
      izracunano: new Date().toISOString(),
    });
  };
  await objavi({ rezin_skupaj: vseRezine.length, rezin_koncanih: 0 });

  /**
   * SKLENJEN KROG, NE "POPOLN PREGLED".
   *
   * Polni obhod se meri po rotaciji, ne po enem zagonu: krog je sklenjen, ko
   * kazalec rezin pride nazaj na začetek. Pri bolhi to pri proračunu 30
   * zahtevkov na krog traja ~13 dni. Prejšnja različica je polni obhod
   * zabeležila samo, če ga je EN zagon opravil do konca — kar se pri takem
   * proračunu ne zgodi nikoli, zato se tudi inkrementalno branje ni nikoli
   * vklopilo.
   */
  const { data: polniZapis } = await db
    .from("nep_statistika")
    .select("podatki")
    .eq("kljuc", `polni:${vir.vir}`)
    .maybeSingle();
  const zadnjiPolni = (polniZapis?.podatki as { ob?: string } | null)?.ob ?? null;
  /** Ali ta krog vključi inkrementalni prelet vseh rezin (del A). */
  const preletNovih = vir.razvrsceniPoNovosti === true;
  /** Postane true, ko rotacija sklene krog med tem zagonom. */
  let krogSklenjen = false;
  const proracunStrani = await proracunZaVir(db, vir);
  log("info", "1. faza", {
    vir: vir.vir,
    preletNovih,
    zadnjiSklenjenKrog: zadnjiPolni,
    proracunStrani: proracunStrani ?? "brez meje",
  });

  let dosezenaKvota = false;
  /** Zaporedne rezine, ki so sredi kroga vrnile prazno prvo stran. */
  let praznihRezinZapored = 0;

  /**
   * Ena rezina, od dane strani naprej.
   *
   * `samoNovo` pomeni inkrementalni način: ustavi se, ko dve strani zapored ne
   * prineseta oglasa, ki ga baza še ne pozna. `premikajKazalec` pove, ali ta
   * prehod šteje v rotacijo — inkrementalni prelet kazalca ne premika, ker ne
   * prebere cele rezine in bi jo s tem preskočil.
   */
  const predelajRezino = async (
    rezina: { oznaka: string },
    absolutniIndeks: number,
    odStrani: number,
    samoNovo: boolean,
    premikajKazalec: boolean,
    /** Največ strani v tem prehodu čez rezino; brez omejitve = do konca. */
    najvecStraniTu = Number.POSITIVE_INFINITY
  ): Promise<void> => {
      let straniTu = 0;
      let stran = odStrani;
      let zadnja: number | null = null;
      let praznihZapored = 0;
      let praznaPrvaPoskusov = 0;
      /** Zaporedne strani, ki niso prinesle nobenega oglasa, novega za BAZO. */
      let brezNovihZapored = 0;
      /**
       * Kar smo videli V TEM PREHODU čez to rezino — ločeno od `videni`, ki
       * velja za cel pregled.
       *
       * Razlika ni kozmetična: varovalka proti viru, ki za koncem kataloga
       * vrača vsebino prve strani, se sproži, ko stran ne prinese nič novega.
       * Če bi merila po `videni`, bi del B vsako rezino, ki jo je del A že
       * preletel, po dveh straneh razglasil za izčrpano in jo preskočil —
       * torej bi polni obhod bral samo tiste rezine, ki jih prelet ni videl.
       */
      const vTemPrehodu = new Set<string>();

      for (;;) {
        if (stopping) {
          popoln = false;
          break;
        }
        try {
          const { kartice, zadnjaStran, skupajZadetkov } = await preberiStran(vir.seznamUrl(rezina, stran));

          /**
           * PRAZNA PRVA STRAN — dve stanji, ki sta na videz enaki.
           *
           * (a) Rezina je RES prazna. 13 regij krat 7 tipov krat dva posla da
           *     182 kombinacij in nekatere so prazne — garaž naprodaj na
           *     Koroškem preprosto ni. Vir to pove sam: "Št. ustreznih
           *     oglasov: 0". Takrat gremo mirno naprej.
           *
           * (b) Vir tiho zavrača (mehka blokada) ali so se spremenili
           *     selektorji. Izmerjeno na bolha.com: po ~25 hitrih straneh
           *     začne vračati strani brez kartic, svež brskalnik pa isti
           *     naslov ta hip postreže normalno. Takrat premor in ponovni
           *     poskus, sicer pregled ustavimo.
           *
           * 20. 8. 2026 sta bili stanji zliti v eno in je (a) prekinila cel
           * obhod ter viru po krivem zapisala šesturno hlajenje.
           */
          if (stran === 1 && kartice.length === 0) {
            if (skupajZadetkov === 0) {
              log("info", "rezina je prazna (vir pove 0 zadetkov)", { vir: vir.vir, rezina: rezina.oznaka });
              praznihRezinZapored = 0;
              break;
            }

            /**
             * Vir, ki nam je pravkar postregel dvajset strani, nas na prvi
             * strani sedme rezine ne blokira. Prazna prva stran SREDI kroga je
             * zato najprej sumljiva rezina, ne blokada — nekatere kombinacije
             * (počitniški objekti za oddajo) so pri viru res prazne, njihovega
             * števila zadetkov pa ne znamo vedno prebrati.
             *
             * Blokada je nekaj drugega: ustavi VSE. Zato jo prepozna šele
             * DRUGA prazna rezina zapored — to stane en zahtevek več, prihrani
             * pa dvanajsturno hlajenje, zapisano zaradi kategorije brez
             * oglasov. Prav ta zamenjava je 20. 8. prekinila cel obhod.
             */
            if (p.strani > 0) {
              praznihRezinZapored += 1;
              if (praznihRezinZapored < 2) {
                log("warn", "prazna prva stran sredi kroga - preskocim rezino", {
                  vir: vir.vir,
                  rezina: rezina.oznaka,
                  zeprebranihStrani: p.strani,
                });
                break;
              }
              throw new Error("vir blokira (dve prazni rezini zapored sredi kroga)");
            }

            // Na ZAČETKU kroga nimamo primerjave, zato ostane previdno
            // vedenje: en daljši premor in en ponovni poskus.
            praznaPrvaPoskusov += 1;
            if (praznaPrvaPoskusov <= 1) {
              log("warn", "prazna prva stran - premor 60 s in ponovni poskus", {
                vir: vir.vir,
                rezina: rezina.oznaka,
                skupajZadetkov,
              });
              await sleep(60_000);
              continue;
            }
            throw new Error("vir blokira (prazna prva stran tudi po premoru)");
          }

          zadnja = zadnjaStran ?? zadnja;
          p.strani += 1;
          straniTu += 1;
          praznihRezinZapored = 0;
          utrip();

          // "Prazna" je tudi stran brez ENE nove kartice: vir za stranmi čez
          // konec pogosto vrača vsebino prve strani, števec strani pa zna
          // pograbiti napačno številko (izmerjeno: "5/567" pri rezini s ~30
          // stranmi). Šteti nove namesto vseh ustavi oboje.
          const svezeVPrehodu = kartice.filter((k) => !vTemPrehodu.has(k.virId));
          for (const k of kartice) vTemPrehodu.add(k.virId);
          if (kartice.length === 0 || svezeVPrehodu.length === 0) {
            praznihZapored += 1;
            if (praznihZapored >= 2) break;
          } else {
            praznihZapored = 0;
            // Za ZAPIS pa šteje, česa ta pregled še ni obdelal — sicer bi del
            // B iste oglase shranjeval znova.
            const nove = svezeVPrehodu.filter((k) => !videni.has(k.virId));
            for (const k of nove) videni.add(k.virId);
            p.najdenih += nove.length;
            if (nove.length > 0) {
              const izid = await shraniOglase(db, nove.map((k) => vir.normaliziraj(k, rezina)));
              p.novih += izid.novih;
              p.posodobljenih += izid.posodobljenih;
              p.sprememb_cen += izid.spremembCen;
              /**
               * INKREMENTALNA USTAVITEV. Pri viru, ki seznam razvrsti od
               * najnovejšega, stran brez enega samega oglasa, ki ga BAZA še ne
               * pozna, pomeni, da smo se dohiteli — vse za njo že imamo.
               * Dve taki zapored (ena bi lahko bila naključje pri oglasu, ki
               * se je ravno vrnil) ustavita rezino.
               *
               * Pri viru, ki ni razvrščen po novosti, je to prepovedano: novi
               * in stari so pomešani in ustavili bi se sredi kataloga.
               */
              if (samoNovo) {
                if (izid.novih === 0) {
                  brezNovihZapored += 1;
                  if (brezNovihZapored >= 2) {
                    log("info", "rezina dohitena (dve strani brez novega)", {
                      vir: vir.vir,
                      rezina: rezina.oznaka,
                      stran,
                    });
                    break;
                  }
                } else {
                  brezNovihZapored = 0;
                }
              }
            }
          }

          await objavi({
            zadnja_rezina: `${vir.vir}: ${rezina.oznaka} - stran ${stran}${zadnja ? `/${zadnja}` : ""}`,
            rezin_koncanih: obdelanihRezin,
          });
          if (zadnja !== null && stran >= zadnja) break;
          if (kartice.length === 0 && praznihZapored >= 2) break;
          // Meja globine za ta prehod. Del A hodi v ŠIRINO: brez nje bi pri
          // zaostali bazi porabil ves proračun na prvi rezini in zadnjih ne bi
          // videl nikoli — kar je natanko stradanje, ki ga rotacija rešuje.
          if (straniTu >= najvecStraniTu) break;
          // Dnevna kvota strani: raje se ustavimo sami, kot da nas vir ustavi.
          if (proracunStrani !== undefined && p.strani >= proracunStrani) {
            log("info", "dosezena kvota strani za ta pregled", { vir: vir.vir, strani: p.strani, proracun: proracunStrani, rezina: rezina.oznaka, naslednjaStran: stran + 1 });
            dosezenaKvota = true;
            // Naslednjič nadaljuj TOČNO tu — rezina se ne preskoči. Velja
            // samo za polni obhod; inkrementalni prelet kazalca ne premika.
            if (premikajKazalec) await shraniNadaljevanje(absolutniIndeks, stran + 1);
            break;
          }
          stran += 1;
          await sleep(zamikMs);
        } catch (err) {
          p.napak += 1;
          popoln = false;
          // Napaka je tudi premik: brez tega bi nadzornik zataknjenosti ubil
          // proces, ki se skozi zaporedje časovnih omejitev pošteno prebija.
          utrip();
          const sporocilo = err instanceof Error ? err.message : String(err);
          await db.from("nep_napake").insert({ vir: vir.vir, url: vir.seznamUrl(rezina, stran), tip: "seznam", sporocilo });
          log("warn", "napaka na strani", { vir: vir.vir, rezina: rezina.oznaka, stran, sporocilo });
          if (/vir blokira|HTTP 403|HTTP 429/.test(sporocilo)) {
            // 403 ustavi cel pregled — vztrajanje bi blokado samo poglobilo.
            // Kje smo obstali, si zapomnimo, da naslednjič nadaljujemo tu.
            blokada = sporocilo;
            if (premikajKazalec) await shraniNadaljevanje(absolutniIndeks, stran);
            break;
          }
          break; // druga napaka: preskoči rezino, nadaljuj s preostankom
        }
      }
      if (blokada || dosezenaKvota) return;
      // Rezina je za nami (dokončana ali preskočena zaradi napake): naslednji
      // pregled naj začne za njo, od prve strani.
      if (premikajKazalec) {
        obdelanihRezin += 1;
        if ((absolutniIndeks + 1) % vseRezine.length === 0) krogSklenjen = true;
        await shraniNadaljevanje(absolutniIndeks + 1, 1);
      }
      // Razmik velja tudi ČEZ mejo rezine. Prej se je spal samo med stranmi
      // znotraj rezine, prehod na naslednjo kategorijo pa je šel takoj — pri
      // 182 rezinah je to 182 zahtevkov brez premora, natanko na mestih, kjer
      // se ritem najbolj pozna.
      if (!stopping) await sleep(zamikMs);
  };

  try {
    browser = await zOmejitvijo("chromium.launch", chromium.launch({ args: ["--no-sandbox"] }), 90_000);

    /**
     * KROG IMA DVA DELA IN OBA STA POTREBNA.
     *
     * A. INKREMENTALNI PRELET vseh rezin od prve strani. Pri viru, razvrščenem
     *    od najnovejšega, to pobere VSE nove oglase za nekaj deset zahtevkov.
     * B. NADALJEVANJE POLNEGA OBHODA od kazalca rotacije, s preostankom
     *    proračuna.
     *
     * Zakaj ne samo eno ali drugo: polni obhod pri 30 zahtevkih na krog traja
     * pri bolhi ~13 dni, in če bi vsi krogi šli vanj, bi bili novi oglasi
     * do dva tedna pozni. Samo inkrementalno branje pa nikoli ne vidi, kaj se
     * je spremenilo globlje v katalogu, in brez sklenjenega kroga ni mogoče
     * sklepati o izginulih. Prej je bila to odločitev "ali–ali" na krog in se
     * ni izšla: polni obhod se ni nikoli sklenil, zato se inkrementalni ni
     * nikoli vklopil.
     */
    if (preletNovih) {
      // Dve strani na rezino: prva pokaže novo, druga potrdi, da za njo ni
      // več novega. Globina je naloga polnega obhoda, ne preleta.
      const STRANI_NA_REZINO_V_PRELETU = 2;
      log("info", "A: inkrementalni prelet vseh rezin", {
        vir: vir.vir,
        rezin: vseRezine.length,
        najvecStraniNaRezino: STRANI_NA_REZINO_V_PRELETU,
      });
      for (const [i, rezina] of vseRezine.entries()) {
        if (stopping || dosezenaKvota || blokada) break;
        // Proračun se preverja tudi PRED novo rezino. Znotraj rezine ga
        // preskoči ustavitev po globini (prelet bere po dve strani), zato bi
        // se sicer prekoračil za toliko strani, kolikor je rezin.
        if (proracunStrani !== undefined && p.strani >= proracunStrani) {
          dosezenaKvota = true;
          break;
        }
        await predelajRezino(rezina, i, 1, true, false, STRANI_NA_REZINO_V_PRELETU);
      }
      log("info", "A: prelet koncan", { vir: vir.vir, strani: p.strani, novih: p.novih });
    }

    if (!dosezenaKvota && !blokada && !stopping) {
      log("info", "B: nadaljujem polni obhod", {
        vir: vir.vir,
        odRezine: zacetniIndeks,
        odStrani: zacetnaStran,
        preostanekProracuna: proracunStrani !== undefined ? proracunStrani - p.strani : "brez meje",
      });
      for (const [zaporedna, rezina] of rezineVrstniRed.entries()) {
        if (stopping || dosezenaKvota || blokada) break;
        if (proracunStrani !== undefined && p.strani >= proracunStrani) {
          dosezenaKvota = true;
          break;
        }
        const absolutniIndeks = (zacetniIndeks + zaporedna) % vseRezine.length;
        // Samo prva rezina tega pregleda nadaljuje sredi paginacije.
        await predelajRezino(rezina, absolutniIndeks, zaporedna === 0 ? zacetnaStran : 1, false, true);
      }
    }
    if (stopping) popoln = false;
  } catch (err) {
    napaka = err instanceof Error ? err.message : String(err);
    popoln = false;
    log("error", "1. faza padla", { vir: vir.vir, napaka });
  } finally {
    if (skupni.ctx) await skupni.ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  let izginulih = 0;
  /**
   * IZGINOTJA SMEJO SLEDITI SAMO IZ SKLENJENEGA KROGA.
   *
   * En zagon prebere le del kataloga — pri bolhi 30 strani od ~400 — zato o
   * tem, česa NI videl, ne more sklepati ničesar. Šele ko rotacija sklene
   * krog, smo v zadnjih dneh videli vsako rezino. `zacetek` bi bil takrat
   * napačna mejna vrednost (nanaša se na ta zagon), zato se izginotja
   * presojajo glede na začetek KROGA.
   */
  const delnaRezina = !krogSklenjen;
  if (delnaRezina || blokada || napaka) popoln = false;
  const zacetekKroga = (polniZapis?.podatki as { ob?: string } | null)?.ob ?? null;
  if (krogSklenjen) {
    await db.from("nep_statistika").upsert({
      kljuc: `polni:${vir.vir}`,
      podatki: { ob: new Date().toISOString(), prejsnji: zacetekKroga, najdenihZadnjic: videni.size },
      izracunano: new Date().toISOString(),
    });
  }
  if (popoln && videni.size >= vir.pricakovanRazpon[0]) {
    // Mejna vrednost je začetek KROGA, ne tega zagona: oglas, ki smo ga videli
    // pred desetimi dnevi na drugem koncu rotacije, ni izginil.
    izginulih = await oznaciIzginule(db, zacetekKroga ?? zacetek, vir.vir);
  } else if (!delnaRezina && !blokada && !napaka && videni.size < vir.pricakovanRazpon[0]) {
    log("warn", "premalo najdenih - verjetno sprememba selektorjev", {
      vir: vir.vir,
      najdenih: videni.size,
      pricakovano: vir.pricakovanRazpon,
    });
    await db
      .from("nep_viri")
      .update({ zdravje: "degraded", opomba: `Najdenih ${videni.size}, pričakovano vsaj ${vir.pricakovanRazpon[0]}` })
      .eq("vir", vir.vir);
  }
  await objavi({ izginulih, rezin_koncanih: obdelanihRezin });

  // Zdravje: pri DELNEM pregledu (kvota, rotacija) je merilo, ali smo sploh
  // kaj dobili — ne število, ki velja za cel katalog. Sicer bi vljudno
  // odmerjen pregled vsak dan lažno kričal "degraded".
  const zdravo = blokada ? videni.size > 0 : delnaRezina ? videni.size > 0 : videni.size >= vir.pricakovanRazpon[0];
  await db
    .from("nep_viri")
    .update({
      zdravje: zdravo ? "healthy" : "degraded",
      zadnji_pregled: new Date().toISOString(),
      zadnjic_najdenih: videni.size,
      ...(zdravo ? { opomba: delnaRezina ? `Delni pregled (kvota ${vir.najvecStrani ?? "-"} strani): ${videni.size} oglasov` : null } : {}),
    })
    .eq("vir", vir.vir);

  log("info", "1. faza koncana", { vir: vir.vir, ...p, zahtevkov, unikatnih: videni.size, popoln, blokada });
  return {
    strani: p.strani,
    najdenih: p.najdenih,
    napak: p.napak,
    zahtevkov,
    izginulih,
    popoln,
    blokada,
    napaka,
    prekinjeno: stopping,
  };
}

/**
 * Cel pregled enega vira: 1. faza, nato 2. faza, nato pošten zaključek.
 *
 * Nobena pot iz te funkcije ne pusti vrstice v stanju "tece" — tudi ne, če
 * kaj vrže. To je bil pogoj: status mora biti vsakič zaključen.
 */
async function pregled(db: Db, pregledId: string, vir: VirAdapter, detajlovNaKrog: number): Promise<void> {
  let izid: IzidPregleda = {
    strani: 0,
    najdenih: 0,
    napak: 0,
    zahtevkov: 0,
    izginulih: 0,
    popoln: false,
    blokada: null,
    napaka: null,
    prekinjeno: false,
  };
  let detajli = { obdelanih: 0, ostalo: 0, napak: 0, izginulih: 0, blokada: null as string | null };
  /** Krog se sploh ni začel (dnevni proračun) — zaključni blok ga ne sme oceniti. */
  let preskocen = false;
  // Kako počasi beremo ta krog: po vsaki blokadi se razmiki podvojijo in se
  // vračajo šele po treh čistih pregledih (samopopravilo.ts).
  const faktor = await faktorHitrosti(db, vir.vir);

  try {
    /**
     * Dnevni proračun je porabljen: krog se sploh ne začne. To NI napaka in ne
     * sme biti videti kot napaka — je natanko tisto, kar mora sistem početi,
     * da vir ne pride do zavračanja.
     */
    const naVoljo = await proracunZaVir(db, vir);
    if (naVoljo !== undefined && naVoljo <= 0) {
      const porabljeno = await porabaDanes(db, vir.vir);
      log("info", "dnevni proracun je porabljen - krog se preskoci", {
        vir: vir.vir,
        porabljeno,
        dnevnaMeja: vir.dnevnaMejaStrani,
      });
      await db
        .from("nep_pregledi")
        .update({
          status: "preklicano",
          konec: new Date().toISOString(),
          pregled_popoln: false,
          opozorilo:
            `Dnevni proračun ${vir.dnevnaMejaStrani} obiskov strani je za danes porabljen ` +
            `(${porabljeno}). Naslednji krog jutri — tako vir ne pride do zavračanja.`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pregledId);
      // Zaključni blok tega kroga NE sme oceniti: `finally` teče tudi ob
      // return in bi status "preklicano" povozil z "napaka" (nič strani).
      preskocen = true;
      return;
    }

    izid = await pregledSeznamov(db, pregledId, vir, faktor);

    // 2. faza samo, kadar je 1. potekla brez blokade: če nas vir ravnokar
    // ustavlja, je odpiranje detajlnih strani natanko tisto, česar ne smemo.
    const { data: virVrstica } = await db
      .from("nep_viri")
      .select("detajli_omogoceni")
      .eq("vir", vir.vir)
      .maybeSingle();
    const detajliDovoljeni = (virVrstica?.detajli_omogoceni ?? true) === true;

    if (vir.detajli && detajliDovoljeni && detajlovNaKrog > 0 && !izid.blokada && !stopping) {
      trenutnaFaza = { vir: vir.vir, faza: 2 };
      await db
        .from("nep_pregledi")
        .update({ faza: 2, updated_at: new Date().toISOString() })
        .eq("id", pregledId);
      await sprostiZataknjenoVrsto(db, vir.vir);

      /**
       * KVOTA JE ENA SAMA ZA CEL KROG, NE ENA NA FAZO.
       *
       * `najvecStrani` je bila izmerjena meja vira ("bolha zavrne po ~50–60
       * straneh v eni seji"), a je štela samo strani seznamov. 2. faza je
       * dodala še do 120 zahtevkov, torej je en krog naredil 160 obiskov tam,
       * kjer je meja 50 — trikrat čez tisto, kar smo si sami postavili.
       * Detajli zato jemljejo iz istega proračuna, kar od njega ostane.
       */
      const proracun = await proracunZaVir(db, vir);
      const preostanek = proracun !== undefined ? Math.max(0, proracun - izid.strani) : Number.POSITIVE_INFINITY;
      const kvota = Math.min(vir.detajli.kvota, detajlovNaKrog, preostanek);
      if (kvota <= 0) {
        log("info", "2. faza preskocena - proracun zahtevkov je porabila 1. faza", {
          vir: vir.vir,
          strani: izid.strani,
          najvecStrani: vir.najvecStrani,
        });
      }

      // Razmik tudi ob prehodu med fazama: brez njega gre prva detajlna stran
      // takoj za zadnjo stranjo seznama.
      if (kvota > 0) await sleep(Math.round(vir.detajli.zamikMs * Math.max(1, faktor)));
      const izidDetajlov = await zajemiDetajle(
        db,
        {
          ...vir,
          detajli: {
            ...vir.detajli,
            kvota,
            zamikMs: Math.round(vir.detajli.zamikMs * Math.max(1, faktor)),
          },
        },
        log,
        async (podatki) => {
          await db.from("nep_pregledi").update({ ...podatki, updated_at: new Date().toISOString() }).eq("id", pregledId);
        },
        utrip,
        () => stopping
      );
      detajli = izidDetajlov;
      await db
        .from("nep_pregledi")
        .update({
          detajlov_obdelanih: izidDetajlov.obdelanih,
          detajlov_skupaj: izidDetajlov.obdelanih + izidDetajlov.ostalo,
          // SEŠTEVEK, ne prepis: 1. faza označi izginule po dvo-udarčnem
          // pravilu, 2. faza pa tiste, ki jim detajlna stran vrne 404/410.
          // Prepis je prvo številko tiho izbrisal in konzola je po popolnem
          // pregledu pokazala "izginulih 0", čeprav jih je bilo na desetine.
          izginulih: izid.izginulih + izidDetajlov.izginulih,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pregledId);
      if (izidDetajlov.blokada) izid = { ...izid, blokada: izidDetajlov.blokada };
    }
  } catch (err) {
    // Karkoli je ušlo obema fazama — pregled se vseeno zaključi.
    izid = { ...izid, napaka: err instanceof Error ? err.message : String(err) };
    log("error", "pregled padel", { vir: vir.vir, napaka: izid.napaka });
  } finally {
    trenutnaFaza = { vir: null, faza: 0 };
    if (preskocen) return;
    /**
     * Poraba dneva se zabeleži ZA OBE FAZI skupaj in tudi takrat, ko se je
     * krog končal z napako: zahtevki, ki so bili narejeni, so bili narejeni.
     * Šteti samo uspešne bi pomenilo, da neuspešen krog ne stane nič — in
     * prav neuspešni krogi so tisti, ki jih vir šteje najbolj.
     */
    await dodajPorabo(db, vir.vir, izid.zahtevkov + detajli.obdelanih + detajli.napak);
    const z = oceniZakljucek(izid);

    /**
     * ZAKLJUČNI ZAPIS MORA USPETI.
     *
     * Prej se izid tega zapisa ni prebral. En sam neuspeh (baza se je ravno
     * ponovno zaganjala, omrežje je zamrznilo) bi pustil vrstico v stanju
     * "tece" za vedno — unikatni indeks bi zaradi nje zavrnil vsak nadaljnji
     * pregled in cel zbiralnik bi tiho obstal. Točno to obljubo naj bi ta
     * funkcija držala, zato se zapis poskusi trikrat z naraščajočim premorom.
     *
     * Če tudi to ne uspe, ostane varovalka `zapriOsirotele()`: vrstico bo ob
     * naslednjem zagonu zaprl nekdo drug. Zato tu ne mečemo naprej — samo
     * glasno zapišemo, kaj se je zgodilo.
     */
    for (let poskus = 1; poskus <= 3; poskus++) {
      const { error } = await db
        .from("nep_pregledi")
        .update({
          status: z.status,
          konec: new Date().toISOString(),
          pregled_popoln: z.pregledPopoln,
          opozorilo: z.opozorilo,
          zadnja_napaka: izid.blokada ?? izid.napaka ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pregledId);
      if (!error) break;
      log("error", "zakljucnega statusa ni bilo mogoce zapisati", { poskus, napaka: error.message });
      if (poskus === 3) {
        await zabelezi(db, {
          sprozil: "zaključek pregleda",
          vir: vir.vir,
          vzrok: `Statusa "${z.status}" po treh poskusih ni bilo mogoče zapisati: ${error.message}`,
          ukrep: "zapri_osirotelega",
          izvedeno: "Vrstica ostane odprta; zaprl jo bo nadzor osirotelih pregledov ob naslednjem krogu.",
        }).catch(() => {});
        break;
      }
      await sleep(poskus * 2000);
    }
    log("info", "pregled zakljucen", {
      vir: vir.vir,
      status: z.status,
      strani: izid.strani,
      najdenih: izid.najdenih,
      detajlov: detajli.obdelanih,
      opozorilo: z.opozorilo,
    });

    // Blokado spoštujemo: vir pustimo pri miru, dokler hlajenje ne poteče.
    // Nikoli je ne poskušamo obiti — počasneje in kasneje, ne drugače.
    if (izid.blokada) {
      await zabelezBlokado(db, vir.vir, vir.hlajenjeUr ?? 6, izid.blokada);
    } else if (z.status === "koncano" || z.status === "koncano_delno") {
      // Krog brez blokade je edini dokaz, da je trenutna hitrost vzdržna.
      // Trije taki vrnejo korak hitrosti; en sam ne.
      await zabelezUspeh(db, vir.vir);
    }
    if (!izid.blokada && z.status === "napaka") {
      await zabelezi(db, {
        sprozil: "zaključek pregleda",
        vir: vir.vir,
        vzrok: z.opozorilo ?? "Pregled ni pobral nobene strani.",
        ukrep: "ponovni_poskus",
        izvedeno: "Vir ostane v čakalnici; naslednji krog poskusi znova.",
      });
    }
  }
}

/**
 * Knjigovodstvo po pregledu: vsak korak zavarovan — napaka enega ne sme
 * ustaviti niti drugih korakov niti zbiranja.
 */
async function knjigovodstvo(db: Db): Promise<void> {
  const l = (m: string) => log("info", "[knjigovodstvo] " + m);
  try {
    const kraji = await naloziKraje(db);
    const g = await geokodirajOglase(db, kraji);
    if (g > 0) l(`geokodiranih ${g} oglasov`);
  } catch (e) {
    log("warn", "geokodiranje padlo", { napaka: e instanceof Error ? e.message : String(e) });
  }
  try {
    const p = await poveziNepremicnine(db, l);
    l(`nepremičnine: +${p.novihNepremicnin} novih, ${p.povezav} povezav, ${p.kandidatov} kandidatov`);
  } catch (e) {
    log("warn", "povezovanje padlo", { napaka: e instanceof Error ? e.message : String(e) });
  }
  try {
    await izracunajPosle(db, l);
  } catch (e) {
    log("warn", "posli padli", { napaka: e instanceof Error ? e.message : String(e) });
  }
  try {
    await preveriIskanja(db, l);
  } catch (e) {
    log("warn", "iskanja padla", { napaka: e instanceof Error ? e.message : String(e) });
  }
  utrip();
}

/** Vsak adapter iz registra dobi vrstico v nep_viri; novi so IZKLOPLJENI. */
async function zagotoviViri(db: Db): Promise<void> {
  const { data } = await db.from("nep_viri").select("vir");
  const obstojeci = new Set((data ?? []).map((v) => v.vir as string));
  for (const v of VIRI) {
    if (obstojeci.has(v.vir)) {
      // Pravno opozorilo, Crawl-delay in proračun zahtevkov se osvežijo ob
      // vsakem zagonu: to so podatki o viru in o kodi, ne nastavitve
      // uporabnika. Kvoto potrebuje konzola, da lahko pošteno izračuna,
      // koliko dni traja polnjenje — z globalno številko bi lagala.
      await db
        .from("nep_viri")
        .update({
          crawl_delay_s: v.crawlDelayS ?? null,
          opomba_pravno: v.pravno ?? null,
          detajlov_kvota: v.detajli?.kvota ?? null,
          najvec_strani: v.najvecStrani ?? null,
        })
        .eq("vir", v.vir);
      continue;
    }
    await db.from("nep_viri").insert({
      vir: v.vir,
      omogocen: false,
      pricakovano_min: v.pricakovanRazpon[0],
      pricakovano_max: v.pricakovanRazpon[1],
      crawl_delay_s: v.crawlDelayS ?? null,
      opomba_pravno: v.pravno ?? null,
      detajlov_kvota: v.detajli?.kvota ?? null,
      najvec_strani: v.najvecStrani ?? null,
    });
    log("info", "nov vir vpisan (izklopljen)", { vir: v.vir });
  }
}

async function vklopljeniViri(db: Db): Promise<string[]> {
  const { data } = await db.from("nep_viri").select("vir, omogocen").eq("omogocen", true);
  const vBazi = new Set((data ?? []).map((v) => v.vir as string));
  const pripravljeni: string[] = [];
  for (const v of VIRI) {
    if (!vBazi.has(v.vir)) continue;
    const doKdaj = await hlajenjeDo(db, v.vir);
    if (doKdaj) {
      log("info", "vir je v hlajenju - preskocim", { vir: v.vir, do: doKdaj });
      continue;
    }
    pripravljeni.push(v.vir);
  }
  return pripravljeni;
}

type Urnik = { omogocen: boolean; ure: number[]; detajlovNaKrog: number };

/** Urnik iz baze; ob prazni ali pokvarjeni vrstici varen privzetek. */
async function preberiUrnik(db: Db): Promise<Urnik> {
  const privzeto: Urnik = { omogocen: true, ure: [4], detajlovNaKrog: 400 };
  const { data, error } = await db
    .from("nep_urnik")
    .select("omogocen, ure, detajlov_na_krog")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return privzeto;
  const ure = String(data.ure ?? "4")
    .split(/[,\s]+/)
    .map((h) => Number(h))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  return {
    omogocen: data.omogocen !== false,
    ure: ure.length > 0 ? ure : privzeto.ure,
    detajlovNaKrog: Number(data.detajlov_na_krog ?? 400),
  };
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const virArg = process.argv.find((a) => a.startsWith("--vir="))?.slice(6) ?? null;
  /**
   * Prevzem ŽE OBSTOJEČE vrstice pregleda (--prevzemi=<id>). Namenjeno
   * dohitevanju iz druge seje: vrstica se v bazo vpiše s statusom "tece", zato
   * je demon nikoli ne prevzame — ista naloga tako ne more teči dvakrat in
   * vira ne obremenimo podvojeno.
   */
  const prevzemiId = process.argv.find((a) => a.startsWith("--prevzemi="))?.slice(11) ?? null;
  const db = connect();
  await zagotoviViri(db);
  const urnikOb = await preberiUrnik(db);

  if (prevzemiId) {
    const { data } = await db.from("nep_pregledi").select("id, vir, status").eq("id", prevzemiId).maybeSingle();
    if (!data) {
      console.error(`Pregleda ${prevzemiId} ni.`);
      process.exit(2);
    }
    log("info", "prevzemam obstojeci pregled", { id: prevzemiId, vir: data.vir, status: data.status });
    const virPrevzema = najdiVir((data.vir as string | null) ?? virArg);
    if (!virPrevzema) {
      console.error(`Vira "${data.vir ?? virArg}" ni v registru adapterjev.`);
      process.exit(2);
    }
    // Hlajenje velja tudi za ukazno vrstico. Prej sta ga --once in --prevzemi
    // v celoti obšla, kar je iz varovalke naredilo priporočilo: kdor je vedel
    // za zastavico, je lahko takoj po blokadi spet pritisnil na vir. Prav ta
    // možnost je tisto, česar v tem projektu ne želimo imeti.
    const hlajenjePrevzema = await hlajenjeDo(db, virPrevzema.vir);
    if (hlajenjePrevzema) {
      console.error(
        `Vir ${virPrevzema.vir} počiva po blokadi do ${new Date(hlajenjePrevzema).toLocaleString("sl-SI")}. ` +
          `Blokade ne obidemo niti iz ukazne vrstice.`
      );
      await db
        .from("nep_pregledi")
        .update({
          status: "preklicano",
          konec: new Date().toISOString(),
          opozorilo: `Vir počiva po blokadi do ${new Date(hlajenjePrevzema).toLocaleString("sl-SI")}. Blokade ne obidemo.`,
          zadnja_napaka: "vir je v hlajenju po blokadi",
        })
        .eq("id", prevzemiId);
      process.exit(4);
    }
    await pregled(db, prevzemiId, virPrevzema, urnikOb.detajlovNaKrog);
    await knjigovodstvo(db);
    return;
  }

  const server = once
    ? null
    : createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            heartbeatAgeMs: Date.now() - zadnjiPremik,
            faza: trenutnaFaza.faza,
            vir: trenutnaFaza.vir,
            iskrenaIdentiteta: seIskrenoPredstavljamo(),
          })
        );
      });
  if (server) {
    await new Promise<void>((resolve) => {
      server.on("error", (e: NodeJS.ErrnoException) => {
        if (e.code === "EADDRINUSE") {
          console.error("Zbiralnik nepremičnin že teče (vrata zasedena).");
          process.exit(3);
        }
      });
      server.listen(PORT, () => {
        log("info", `health na portu ${PORT}`);
        resolve();
      });
    });
    /**
     * Vrata so naša, torej noben drug DEMON ne teče in vsak star 'tece' zapis
     * je ostanek mrtvega procesa (izpad elektrike, sesutje). Brez te obnove bi
     * unikatni indeks za vedno blokiral vse nadaljnje preglede, utrip pa bi
     * mirno kazal "živ".
     *
     * Meja pa NI nič: `--prevzemi` teče v svojem procesu brez vrat in je ob
     * zagonu demona lahko sredi dela. Prag desetih minut loči živ prevzem (ki
     * se javlja ob vsaki strani) od trupla, ne da bi ubil prvega.
     */
    const zaprtih = await zapriOsirotele(db, 10);
    if (zaprtih > 0) log("warn", "osiroteli pregledi zaprti ob zagonu", { st: zaprtih });
  }

  log("info", "nepremicnine zbiralnik zagnan", {
    ure: urnikOb.ure,
    urnikOmogocen: urnikOb.omogocen,
    viri: VIRI.map((v) => v.vir),
    // Kako se predstavljamo, mora biti v dnevniku: to je edini podatek, ki ga
    // vir o nas dobi, in dolgo je bil neresničen.
    predstavljamoSe: uporabniskiAgent(),
    iskreno: seIskrenoPredstavljamo(),
  });

  if (once) {
    const vir = najdiVir(virArg);
    if (!vir) {
      console.error(`Vira "${virArg}" ni v registru. Na voljo: ${VIRI.map((v) => v.vir).join(", ")}`);
      process.exit(2);
    }
    const hlajenjeEnkratnega = await hlajenjeDo(db, vir.vir);
    if (hlajenjeEnkratnega) {
      console.error(
        `Vir ${vir.vir} počiva po blokadi do ${new Date(hlajenjeEnkratnega).toLocaleString("sl-SI")}. ` +
          `Blokade ne obidemo niti iz ukazne vrstice.`
      );
      process.exit(4);
    }
    const { data, error } = await db
      .from("nep_pregledi")
      .insert({ status: "zahtevano", vir: vir.vir, zahteval: "ukazna vrstica" })
      .select("id")
      .maybeSingle();
    // Napaka vstavljanja (unikatni indeks: en aktiven pregled) je bila doslej
    // požrta — ukaz se je končal tiho in videti je bilo, kot da je delal.
    if (error) {
      console.error(
        /duplicate|unique/i.test(error.message)
          ? "En pregled že čaka ali teče — počakajte, da se konča."
          : `Zahteve ni bilo mogoče vpisati: ${error.message}`
      );
      process.exit(5);
    }
    if (data) await pregled(db, data.id as string, vir, urnikOb.detajlovNaKrog);
    await knjigovodstvo(db);
    return;
  }

  /**
   * Nadzornik zataknjenosti. Zbiralnik piše `zadnjiPremik` ob vsaki strani,
   * vsakem detajlu in vsakem koraku knjigovodstva. Če se pol ure ne premakne
   * nič, proces ni priden — zataknjen je (izmerjeno pri avtomobilih: klic
   * brskalnika, ki 90 minut ne vrne). Takrat se konča; nadzornik.ps1 opazi
   * prazna vrata in ga zažene znova, ob zagonu pa se osiroteli pregled zapre
   * kot delni. Tako se sistem pobere sam, brez človeka.
   */
  const strazar = setInterval(() => {
    const mirujeMs = Date.now() - zadnjiPremik;
    if (mirujeMs < ZATAKNJEN_MS || stopping) return;
    log("error", "zbiralnik zataknjen - koncujem proces", { mirujeMin: Math.round(mirujeMs / 60_000) });
    void zabelezi(db, {
      sprozil: "nadzornik zataknjenosti",
      vir: trenutnaFaza.vir,
      vzrok: `Zbiralnik se ni premaknil ${Math.round(mirujeMs / 60_000)} minut (faza ${trenutnaFaza.faza}).`,
      ukrep: "ponovni_zagon",
      izvedeno: "Proces se konča; nadzornik ga zažene znova, osiroteli pregled se zapre kot delni.",
    }).finally(() => process.exit(1));
  }, 60_000);
  strazar.unref?.();

  /** Ključ termina, ki je bil že sprožen ("2026-08-20T04") — brez podvajanja. */
  let zadnjiTermin: string | null = null;
  let cakalnica: string[] = [];

  while (!stopping) {
    utrip();
    const urnik = await preberiUrnik(db);
    const zdaj = new Date();
    // Ključ termina je v LOKALNEM času, ker so ure urnika lokalne. Mešanje
    // datuma po UTC z lokalno uro bi okoli polnoči isti termin sprožilo
    // dvakrat ali ga preskočilo.
    const kljucTermina = `${zdaj.getFullYear()}-${String(zdaj.getMonth() + 1).padStart(2, "0")}-${String(
      zdaj.getDate()
    ).padStart(2, "0")}T${String(zdaj.getHours()).padStart(2, "0")}`;
    if (urnik.omogocen && urnik.ure.includes(zdaj.getHours()) && zadnjiTermin !== kljucTermina) {
      cakalnica = await vklopljeniViri(db);
      zadnjiTermin = kljucTermina;
      log("info", "urnik: cakalnica virov", { ob: kljucTermina, cakalnica });
    }

    // Osiroteli pregledi drugih procesov (npr. ročni zagon iz ukazne vrstice,
    // ki je bil ubit). Unikatni indeks zaradi njih zavrne vsako novo zahtevo.
    await zapriOsirotele(db, 45);

    // En aktiven pregled naenkrat (unique indeks to tudi trdo zagotavlja):
    // nova zahteva se vpiše šele, ko ni ne čakajoče ne tekoče.
    const { data: aktivni } = await db
      .from("nep_pregledi")
      .select("id, vir, status")
      .in("status", ["zahtevano", "tece"])
      .limit(1);
    const aktiven = (aktivni ?? [])[0];

    if (!aktiven && cakalnica.length > 0) {
      const vir = cakalnica[0];
      const { error } = await db.from("nep_pregledi").insert({ status: "zahtevano", vir, zahteval: "urnik" });
      if (!error) cakalnica.shift();
    }

    // Prevzame čakajočo zahtevo — urnikovo ali ročno iz konzole.
    const { data } = await db
      .from("nep_pregledi")
      .select("id, vir")
      .eq("status", "zahtevano")
      .order("zahtevano_ob")
      .limit(1);
    const naloga = (data ?? [])[0];
    if (naloga) {
      const virNaloge = najdiVir((naloga.vir as string | null) ?? null);
      if (!virNaloge) {
        // Zahtevan vir ni v registru (odstranjen adapter, tipkarska napaka).
        // Zahteva se zaključi z razlago — nikoli je ne izpolnimo z drugim
        // virom, ker bi to pomenilo obiskati stran, ki je nihče ni zahteval.
        await db
          .from("nep_pregledi")
          .update({
            status: "preklicano",
            konec: new Date().toISOString(),
            opozorilo: `Vira "${naloga.vir}" ni v registru adapterjev — zahteva ni bila izpolnjena.`,
            zadnja_napaka: "neznan vir",
          })
          .eq("id", naloga.id as string);
        log("warn", "zahteva za neznan vir - preklicana", { vir: naloga.vir });
        await sleep(POLL_MS);
        continue;
      }
      // Izklop vira med čakanjem zahteve mora zaleči. Prej je zahteva, ki je
      // bila uvrščena, ko je bil vir še vklopljen, tekla naprej — izklop v
      // konzoli torej ni ustavil ničesar in je bil videti kot da ne dela.
      const { data: virVrstica } = await db
        .from("nep_viri")
        .select("omogocen")
        .eq("vir", virNaloge.vir)
        .maybeSingle();
      if (virVrstica && virVrstica.omogocen === false) {
        await db
          .from("nep_pregledi")
          .update({
            status: "preklicano",
            konec: new Date().toISOString(),
            opozorilo: `Vir ${virNaloge.vir} je izklopljen — zahteva ni bila izpolnjena.`,
            zadnja_napaka: "vir je izklopljen",
          })
          .eq("id", naloga.id as string);
        log("warn", "zahteva preklicana - vir je izklopljen", { vir: virNaloge.vir });
        await sleep(POLL_MS);
        continue;
      }
      const doKdaj = await hlajenjeDo(db, virNaloge.vir);
      if (doKdaj) {
        // Tudi ročna zahteva spoštuje hlajenje — sicer bi jo lahko uporabili
        // za obhod blokade, kar je točno tisto, česar nočemo.
        await db
          .from("nep_pregledi")
          .update({
            status: "preklicano",
            konec: new Date().toISOString(),
            opozorilo: `Vir počiva po blokadi do ${new Date(doKdaj).toLocaleString("sl-SI")}. Blokade ne obidemo.`,
            zadnja_napaka: "vir je v hlajenju po blokadi",
          })
          .eq("id", naloga.id as string);
        log("warn", "zahteva preklicana - vir v hlajenju", { vir: virNaloge.vir, do: doKdaj });
      } else {
        await pregled(db, naloga.id as string, virNaloge, urnik.detajlovNaKrog);
        await knjigovodstvo(db);
      }
    }
    await sleep(POLL_MS);
  }
  clearInterval(strazar);
  server?.close();
}

main().catch((err) => {
  console.error("USODNA NAPAKA:", err instanceof Error ? err.message : err);
  process.exit(1);
});
