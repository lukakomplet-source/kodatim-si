import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PIPELINE_STAGE_LABELS, type PipelineStage } from "@/lib/promocije/types";

/**
 * Prodajna ekipa KodaTim: Harveyjev cevovod, prikazan kot ekipa delavcev.
 *
 * Harvey (agent za iskanje kupcev, C:\Users\lukak\Documents\HARVEY\kodatim)
 * teče na istem računalniku in na 127.0.0.1:5555 vrača povzetek ekipe
 * (/api/ekipa) in podrobnosti delavca (/api/ekipa/<vloga>). Številke so
 * Harveyjeve, besedila vlog (ime, naloga, pravila) pa tukaj, ker so del
 * vmesnika. Edini zapis, ki ga stran naredi sama, je predaja odgovorov z
 * zanimanjem v Promocije — brez podvajanja, zato jo sme klicati vsak izris.
 */

const HARVEY = process.env.HARVEY_KODATIM_URL ?? "http://127.0.0.1:5555";
const KAMPANJA = "Harvey · KodaTim";

export const KLJUCI_DELAVCEV = [
  "vodja",
  "iskalec",
  "bralec",
  "ocenjevalec",
  "raziskovalec",
  "pisec",
  "kontrolor",
  "odobritev",
  "preverjevalec",
  "posiljatelj",
  "bralec_odgovorov",
  "analitik",
  "prodaja",
] as const;
export type KljucDelavca = (typeof KLJUCI_DELAVCEV)[number];

export type StanjeDelavca =
  | "dela"
  | "caka"
  | "tiho"
  | "izklopljen"
  | "ustavljen"
  | "napaka"
  | "prosto";

export type Delavec = {
  kljuc: KljucDelavca;
  stanje: StanjeDelavca;
  zadnjic: string | null;
  glavna: { vrednost: number | null; oznaka: string };
  stevilke: Record<string, unknown>;
  cilj?: { oznaka: string; vrednost: number; cilj: number };
};

export type Povzetek = {
  posel: string;
  ustvarjeno: string;
  zanka: {
    tece: boolean;
    zaustavljen: boolean;
    stanje: StanjeDelavca;
    tiho: boolean;
    odlocitev: string;
    naslednji_krog: string | null;
    interval_min: number;
  };
  posiljanje: {
    vklopljeno: boolean;
    razlog: string;
    okno_odprto: boolean;
    danes: number;
    na_dan: number;
  };
  delavci: Delavec[];
  tok: Record<KljucDelavca, boolean>;
};

export type Postavka = {
  id?: string;
  naslov: string;
  podnaslov?: string;
  cas?: string | null;
  posljeSe?: string | null;
  zadeva?: string;
  stanje?: string;
  besedilo?: string;
  oznake?: string[];
  /** Koda predloga strani pri ponudbi (korak 1), da se pregleda cel paket. */
  predlog?: string;
};

export type Podrobnosti = {
  kljuc: KljucDelavca;
  seznam: Postavka[];
  razporeditev?: { oznaka: string; vrednost: number }[];
  poraba_po_delavcih?: { oznaka: string; klicev: number; vhodnih: number; izhodnih: number }[];
};

/** Plast diagrama — od vodje do prodaje. */
export type Sloj = "vodstvo" | "iskanje" | "pisanje" | "ti" | "posiljanje" | "odgovori" | "prodaja" | "ob_strani";

export const SLOJI: { kljuc: Sloj; naslov: string }[] = [
  { kljuc: "vodstvo", naslov: "Vodstvo" },
  { kljuc: "iskanje", naslov: "1 · Iskanje" },
  { kljuc: "pisanje", naslov: "2 · Pisanje" },
  { kljuc: "ti", naslov: "3 · Ti" },
  { kljuc: "posiljanje", naslov: "4 · Pošiljanje" },
  { kljuc: "odgovori", naslov: "5 · Odgovori" },
  { kljuc: "prodaja", naslov: "6 · Prodaja" },
];

/** Kdo je kdo: ime, naloga v enem stavku in pravila, po katerih dela. */
export const VLOGE: Record<KljucDelavca, { ime: string; naloga: string; pravila: string[]; sloj: Sloj }> = {
  vodja: {
    ime: "Vodja ekipe",
    sloj: "vodstvo",
    naloga: "Vsakih 15 minut pogleda stanje in odloči, kdo dela naslednji.",
    pravila: [
      "Vrstni red: odgovori, pošiljanje, pisanje, iskanje kontaktov, analiza.",
      "Ponoči (22:00–7:00) in med vikendi ekipa miruje.",
      "Porabi največ 40 % tvoje naročnine Claude; nad mejo počaka.",
    ],
  },
  iskalec: {
    ime: "Iskalec",
    sloj: "iskanje",
    naloga: "Iz AJPES registra vzame nova podjetja iz izbranih dejavnosti.",
    pravila: [
      "Samo družbe; s.p. so po ZEKom-2 fizične osebe in jim ne pišemo.",
      "Vsak ponedeljek ob 7:15 do 12 novih podjetij na dejavnost.",
      "Že znana podjetja preskoči.",
    ],
  },
  bralec: {
    ime: "Bralec strani",
    sloj: "iskanje",
    naloga: "Prebere spletno stran podjetja: domačo stran, robots.txt in zemljevid strani.",
    pravila: [
      "Brezplačno, brez Claude: nekaj zahtev na podjetje.",
      "Do 25 strani na krog, vljudno, brez obhajanja blokad.",
    ],
  },
  ocenjevalec: {
    ime: "Ocenjevalec",
    sloj: "iskanje",
    naloga: "Iz prebranega najde pomanjkljivosti, o katerih je vredno pisati.",
    pravila: [
      "Spletno naročanje šteje le tam, kjer ga stranke uporabljajo (gostinstvo, zdravstvo, storitve …).",
      "Zastarela vsebina, malo strani, ni podatkov za iskalnike, ni strani.",
      "Samo dejstva, ki jih lahko pokažemo — nič ugibanja.",
    ],
  },
  raziskovalec: {
    ime: "Raziskovalec kontaktov",
    sloj: "iskanje",
    naloga: "Za vsako podjetje najde en javno objavljen e-naslov.",
    pravila: [
      "Najprej info@ ali prodaja@ na domeni podjetja, nato naslov iz registra.",
      "Nikoli ugibanja ime.priimek@ in nikoli naslovov tujih domen.",
    ],
  },
  pisec: {
    ime: "Pisec",
    sloj: "pisanje",
    naloga: "Napiše tri sporočila: opažanje z vprašanjem, ponudbo in vljuden zaključek.",
    pravila: [
      "Usmeritev: aplikacije, ki prihranijo ročno delo (naročanje, rezervacije, AI asistent); stran kot vstop.",
      "Slovenščina z vikanjem, samo dejstva o podjetju, brez izmišljenih referenc.",
      "Ne piše novih, dokler jih preveč čaka na tvojo odobritev (meja je na kartici).",
    ],
  },
  kontrolor: {
    ime: "Kontrolor",
    sloj: "pisanje",
    naloga: "Zadnji pregled tik pred pošiljanjem; slabo sporočilo ustavi.",
    pravila: [
      "Noga z identiteto in odjavo mora biti v vsakem sporočilu (ZEKom-2).",
      "Prepovedane besede (»brezplačno«, »kliknite tukaj« …), dolžina, največ ena povezava.",
    ],
  },
  odobritev: {
    ime: "Ti — odobritev",
    sloj: "ti",
    naloga: "Prebereš osnutek in ga odobriš ali zavrneš. Brez tebe ne gre nič ven.",
    pravila: [
      "Odobriš lahko tudi s telefona, tukaj.",
      "Dokler pošiljanje ni vklopljeno, z odobritvijo ne odide nič.",
    ],
  },
  preverjevalec: {
    ime: "Preverjevalec naslovov",
    sloj: "posiljanje",
    naloga: "Tik pred pošiljanjem preveri, ali naslov res obstaja (Reoon).",
    pravila: ["Neveljaven naslov se ne pošlje, da ne kvari ugleda predala."],
  },
  posiljatelj: {
    ime: "Pošiljatelj",
    sloj: "posiljanje",
    naloga: "Pošlje odobrena sporočila z razmiki med koraki.",
    pravila: [
      "Delavniki 8:00–15:30, največ 10 na dan.",
      "Nadaljevanje šele, ko je prejšnje poslano in mine razmik (3 oz. 4 dni).",
    ],
  },
  bralec_odgovorov: {
    ime: "Bralec odgovorov",
    sloj: "odgovori",
    naloga: "Prebere odgovore in jih razvrsti: zanimanje, vprašanje, ugovor, odjava.",
    pravila: [
      "Odjave upošteva takoj in za vedno.",
      "Grožnje in pravna vprašanja preda tebi, sam ne odgovarja.",
      "Za zanimanje pripravi odgovor, ki ga odobriš.",
    ],
  },
  analitik: {
    ime: "Analitik",
    sloj: "ob_strani",
    naloga: "Spremlja odzivnost, odjave, odbitja in porabo; vodji vrača povratne informacije.",
    pravila: ["Pri več kot 3 % odbitih sporočil sam ustavi pošiljanje."],
  },
  prodaja: {
    ime: "Prodaja",
    sloj: "prodaja",
    naloga: "Kdor odgovori z zanimanjem, gre v Promocije z nalogo »Pokliči« zate.",
    pravila: [
      "Kampanja »Harvey · KodaTim«, faza »Odgovorili«, brez podvajanja leadov.",
      "Sestanek, ponudbo in posel vodiš v Promocijah kot doslej.",
    ],
  },
};

async function izHarveyja<T>(pot: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${HARVEY}${pot}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(2_500),
    ...init,
  });
  if (!r.ok) throw new Error(`Harvey je vrnil ${r.status}`);
  return (await r.json()) as T;
}

/** Povzetek ekipe ali razlog, zakaj ga ni (Harvey ne teče). */
export async function preberiEkipo(): Promise<{ povzetek: Povzetek | null; napaka: string | null }> {
  try {
    return { povzetek: await izHarveyja<Povzetek>("/api/ekipa"), napaka: null };
  } catch (e) {
    const sporocilo = e instanceof Error ? e.message : String(e);
    return {
      povzetek: null,
      napaka: sporocilo.includes("fetch failed") || sporocilo.includes("aborted")
        ? "Harvey ne odgovarja na 127.0.0.1:5555 — plošča KodaTim ne teče."
        : sporocilo,
    };
  }
}

export async function preberiDelavca(vloga: KljucDelavca): Promise<Podrobnosti | null> {
  try {
    return await izHarveyja<Podrobnosti>(`/api/ekipa/${vloga}`);
  } catch {
    return null;
  }
}

/** Odobritev ali zavrnitev osnutka v Harveyjevem outboxu. */
export async function odlociOsnutek(id: string, odobri: boolean, besedilo?: string): Promise<boolean> {
  try {
    // Lukove besede (človeška opomba, popravek) gredo v osnutek pred odobritvijo.
    if (odobri && besedilo !== undefined) {
      const urejeno = await izHarveyja<{ success: boolean }>(`/api/outbox/${encodeURIComponent(id)}/uredi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: besedilo }),
      });
      if (!urejeno.success) return false;
    }
    const r = await izHarveyja<{ success: boolean }>(
      `/api/outbox/${encodeURIComponent(id)}/${odobri ? "approve" : "reject"}`,
      { method: "POST" },
    );
    return Boolean(r.success);
  } catch {
    return false;
  }
}

type VnosPredaje = {
  pogovor: string;
  podjetje: string;
  email: string;
  davcna: string;
  maticna: string;
  spletna_stran: string;
  kraj: string;
  dejavnost: string;
  odgovor: string;
  cas: string | null;
  /** »zanimanje« = odgovorili so; »ogled« = po ponudbi so odprli predlog, odgovora še ni. */
  razlog?: "zanimanje" | "ogled";
  predlog?: string;
  ogledov?: number;
};

export type PredajaRezultat = {
  predanih: number;
  novihLeadov: number;
  nalog: number;
  napaka: string | null;
  nacrt: string[];
};

const stevke = (v: string) => (v ?? "").replace(/\D/g, "");

function danes(): string {
  // Lokalni datum (Ljubljana), ne UTC — naloga »za danes« naj bo res za danes.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Ljubljana" }).format(new Date());
}

/**
 * Odgovore z zanimanjem preda v Promocije: lead (brez podvajanja po e-pošti
 * ali davčni), cilj v kampanji »Harvey · KodaTim« v fazi »Odgovorili« in
 * nalogo »Pokliči …« za danes. Podjetja, ki so po ponudbi odprla predlog,
 * odgovorila pa še niso, gredo v fazo »Email poslan« s klicem — tako kot
 * Luka pokliče po poslani ponudbi. Če tako podjetje pozneje odgovori z
 * zanimanjem, se premakne naprej. Drugače predanih ne dotakne več. `suho`
 * samo izpiše, kaj bi naredil.
 */
export async function predajVPromocije(opcije: { suho?: boolean } = {}): Promise<PredajaRezultat> {
  const rezultat: PredajaRezultat = { predanih: 0, novihLeadov: 0, nalog: 0, napaka: null, nacrt: [] };
  let vnosi: VnosPredaje[];
  try {
    vnosi = await izHarveyja<VnosPredaje[]>("/api/ekipa-predaja");
  } catch {
    return { ...rezultat, napaka: "Harvey ne odgovarja." };
  }
  if (vnosi.length === 0) return rezultat;

  const admin = createAdminClient();

  let { data: kampanja } = await admin
    .from("promo_campaigns")
    .select("id")
    .eq("name", KAMPANJA)
    .maybeSingle();
  if (!kampanja) {
    rezultat.nacrt.push(`ustvari kampanjo »${KAMPANJA}«`);
    if (!opcije.suho) {
      const { data, error } = await admin
        .from("promo_campaigns")
        .insert({
          name: KAMPANJA,
          description:
            "Podjetja, ki so na ponudbo prodajne ekipe odgovorila z zanimanjem ali po njej odprla predlog.",
          lead_source: "Harvey",
          tags: ["Harvey"],
          priority: "high",
          status: "active",
        })
        .select("id")
        .single();
      if (error || !data) return { ...rezultat, napaka: "Kampanje ni bilo mogoče ustvariti." };
      kampanja = data;
    }
  }

  for (const v of vnosi) {
    const ogled = v.razlog === "ogled";
    const povezava = v.predlog ? `https://kodatim.si/predlog/${v.predlog}?interno` : "";
    // Lead: najprej po e-pošti, nato po davčni.
    let leadId: string | null = null;
    const poPosti = await admin.from("intel_leads").select("id").eq("email", v.email).limit(1);
    leadId = (poPosti.data?.[0]?.id as string | undefined) ?? null;
    if (!leadId && stevke(v.davcna)) {
      const poDavcni = await admin
        .from("intel_leads")
        .select("id")
        .ilike("vat_id", `%${stevke(v.davcna)}%`)
        .limit(1);
      leadId = (poDavcni.data?.[0]?.id as string | undefined) ?? null;
    }

    if (!leadId) {
      rezultat.nacrt.push(`nov lead: ${v.podjetje} <${v.email}>`);
      if (!opcije.suho) {
        const { data, error } = await admin
          .from("intel_leads")
          .insert({
            company_name: v.podjetje,
            email: v.email,
            website: v.spletna_stran || null,
            vat_id: v.davcna || null,
            address_city: v.kraj || null,
            address_country: "Slovenija",
            industry: v.dejavnost || null,
            tags: ["Harvey"],
            lead_status: "contacted",
            notes: (ogled
              ? `Harvey: po ponudbi so odprli predlog (${v.ogledov ?? 1}×)\n${povezava}`
              : `Harvey: odgovor z zanimanjem\n${v.odgovor}`
            ).slice(0, 2000),
          })
          .select("id")
          .single();
        if (error || !data) {
          rezultat.napaka = `Leada za ${v.podjetje} ni bilo mogoče ustvariti.`;
          continue;
        }
        leadId = data.id as string;
        rezultat.novihLeadov += 1;
      }
    }
    if (!kampanja || !leadId) continue;

    const { data: cilj } = await admin
      .from("promo_campaign_targets")
      .select("id, pipeline_stage")
      .eq("campaign_id", kampanja.id)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (cilj) {
      // Odprli so predlog, zdaj pa še odgovorili z zanimanjem: korak naprej.
      if (!ogled && cilj.pipeline_stage === "email_sent") {
        rezultat.nacrt.push(`v Promocijah: ${v.podjetje} → Odgovorili + naloga »Pokliči«`);
        if (opcije.suho) continue;
        const { error } = await admin
          .from("promo_campaign_targets")
          .update({
            pipeline_stage: "replied",
            call_status: "interested",
            call_notes: `Odgovor na Harveyjevo sporočilo:\n${v.odgovor}`.slice(0, 2000),
          })
          .eq("id", cilj.id);
        if (error) {
          rezultat.napaka = `${v.podjetje} ni bilo mogoče premakniti v »Odgovorili«.`;
          continue;
        }
        rezultat.predanih += 1;
        const { error: napakaNaloge } = await admin.from("promo_tasks").insert({
          campaign_id: kampanja.id,
          target_id: cilj.id,
          title: `Pokliči ${v.podjetje} — odgovorili so z zanimanjem`,
          type: "call",
          due_date: danes(),
          priority: "high",
        });
        if (!napakaNaloge) rezultat.nalog += 1;
      }
      continue; // drugače že predan
    }

    rezultat.nacrt.push(
      ogled
        ? `v Promocije: ${v.podjetje} (Email poslan, odprli predlog) + naloga »Pokliči«`
        : `v Promocije: ${v.podjetje} (Odgovorili) + naloga »Pokliči«`,
    );
    if (opcije.suho) continue;
    const { data: nov, error } = await admin
      .from("promo_campaign_targets")
      .insert({
        campaign_id: kampanja.id,
        lead_id: leadId,
        pipeline_stage: ogled ? "email_sent" : "replied",
        call_status: ogled ? "offer_sent" : "interested",
        call_notes: (ogled
          ? `Po ponudbi so odprli predlog (${v.ogledov ?? 1}×), odgovora še ni. Predlog: ${povezava}`
          : `Odgovor na Harveyjevo sporočilo:\n${v.odgovor}`
        ).slice(0, 2000),
      })
      .select("id")
      .single();
    if (error || !nov) {
      rezultat.napaka = `${v.podjetje} ni bilo mogoče dodati v kampanjo.`;
      continue;
    }
    rezultat.predanih += 1;
    const { error: napakaNaloge } = await admin.from("promo_tasks").insert({
      campaign_id: kampanja.id,
      target_id: nov.id,
      title: ogled
        ? `Pokliči ${v.podjetje} — odprli so predlog`
        : `Pokliči ${v.podjetje} — odgovorili so z zanimanjem`,
      type: "call",
      due_date: danes(),
      priority: "high",
    });
    if (!napakaNaloge) rezultat.nalog += 1;
  }
  return rezultat;
}

type KontaktEkipe = {
  email: string;
  podjetje: string;
  davcna: string;
  maticna: string;
  spletna_stran: string;
  kraj: string;
  dejavnost: string;
  stanje: "najden" | "osnutek" | "poslano" | "odgovoril" | "zanimanje" | "odjava";
  najden: string | null;
};

export const STANJE_KONTAKTA: Record<KontaktEkipe["stanje"], string> = {
  najden: "najden",
  osnutek: "osnutek čaka na odobritev",
  poslano: "sporočilo poslano",
  odgovoril: "odgovoril",
  zanimanje: "zanimanje",
  odjava: "odjava",
};

const SINHRONIZACIJA_NAJVEC_NA_MIN = 10;
let zadnjaSinhronizacija = 0;

/**
 * Kontakte, ki jih je našla ekipa, prenese v Bazo leadov (intel_leads) z
 * oznako »Harvey« in stanjem v custom_fields.harvey — tako so vsi leadi na
 * enem mestu. Brez podvajanja (e-pošta, nato davčna) in brez prepisovanja:
 * obstoječemu leadu doda le oznako in stanje. Največ enkrat na 10 minut, ker
 * jo kličejo strani, ki se same osvežujejo. Obogatitve ne sproži.
 */
export async function sinhronizirajLeade(): Promise<{ novih: number; posodobljenih: number } | null> {
  if (Date.now() - zadnjaSinhronizacija < SINHRONIZACIJA_NAJVEC_NA_MIN * 60_000) return null;
  zadnjaSinhronizacija = Date.now();

  let kontakti: KontaktEkipe[];
  try {
    kontakti = await izHarveyja<KontaktEkipe[]>("/api/ekipa-kontakti");
  } catch {
    return null;
  }
  if (kontakti.length === 0) return { novih: 0, posodobljenih: 0 };

  type Obstojeci = { id: string; email: string | null; vat_id: string | null; tags: string[] | null; custom_fields: Record<string, unknown> | null };
  const admin = createAdminClient();
  const poPosti = new Map<string, Obstojeci>();
  const poDavcni = new Map<string, Obstojeci>();
  const emaili = kontakti.map((k) => k.email.toLowerCase());
  const davcne = kontakti.map((k) => k.davcna).filter(Boolean);
  for (let i = 0; i < emaili.length; i += 500) {
    const { data } = await admin
      .from("intel_leads")
      .select("id, email, vat_id, tags, custom_fields")
      .in("email", emaili.slice(i, i + 500));
    for (const r of (data ?? []) as Obstojeci[]) if (r.email) poPosti.set(r.email.toLowerCase(), r);
  }
  for (let i = 0; i < davcne.length; i += 500) {
    const { data } = await admin
      .from("intel_leads")
      .select("id, email, vat_id, tags, custom_fields")
      .in("vat_id", davcne.slice(i, i + 500));
    for (const r of (data ?? []) as Obstojeci[]) if (r.vat_id) poDavcni.set(stevke(r.vat_id), r);
  }

  const novi: Record<string, unknown>[] = [];
  let posodobljenih = 0;
  for (const k of kontakti) {
    const harvey = { stanje: k.stanje, oznaka: STANJE_KONTAKTA[k.stanje], najden: k.najden };
    const obstojeci = poPosti.get(k.email.toLowerCase()) ?? (k.davcna ? poDavcni.get(stevke(k.davcna)) : undefined);
    if (obstojeci) {
      const cf = obstojeci.custom_fields ?? {};
      const prejsnje = (cf.harvey as { stanje?: string } | undefined)?.stanje;
      const tags = obstojeci.tags ?? [];
      if (prejsnje === k.stanje && tags.includes("Harvey")) continue;
      const { error } = await admin
        .from("intel_leads")
        .update({
          custom_fields: { ...cf, harvey },
          tags: tags.includes("Harvey") ? tags : [...tags, "Harvey"],
        })
        .eq("id", obstojeci.id);
      if (!error) posodobljenih += 1;
      continue;
    }
    novi.push({
      company_name: k.podjetje || k.email,
      email: k.email,
      website: k.spletna_stran || null,
      vat_id: k.davcna || null,
      address_city: k.kraj || null,
      address_country: "Slovenija",
      industry: k.dejavnost || null,
      tags: ["Harvey"],
      lead_status: k.stanje === "odjava" ? "not_interested"
        : k.stanje === "najden" || k.stanje === "osnutek" ? "new" : "contacted",
      notes: "Našla prodajna ekipa (Harvey): objavljen naslov podjetja.",
      custom_fields: { harvey },
    });
  }
  let vstavljenih = 0;
  for (let i = 0; i < novi.length; i += 200) {
    const { error, data } = await admin.from("intel_leads").insert(novi.slice(i, i + 200)).select("id");
    if (!error) vstavljenih += data?.length ?? 0;
  }
  return { novih: vstavljenih, posodobljenih };
}

/** Kar danes čaka na Luka: osnutki, klici in novi leadi iz klepeta. */
export async function preberiDanes(): Promise<{ klicev: number; leadovIzKlepeta: number }> {
  const admin = createAdminClient();
  const danasnji = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Ljubljana" }).format(new Date());
  const teden = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [{ count: klicev }, { count: leadov }] = await Promise.all([
    admin
      .from("promo_tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "todo")
      .eq("type", "call")
      .lte("due_date", danasnji),
    admin.from("leads").select("*", { count: "exact", head: true }).gte("created_at", teden),
  ]);
  return { klicev: klicev ?? 0, leadovIzKlepeta: leadov ?? 0 };
}

export type Lijak = {
  kampanjaId: string | null;
  faze: { kljuc: PipelineStage; oznaka: string; stevilo: number }[];
  prodano: number;
  vrednost: number;
};

/** Lijak kampanje »Harvey · KodaTim« iz Promocij: faze in vrednost prodanega. */
export async function preberiLijak(): Promise<Lijak> {
  const prazno: Lijak = { kampanjaId: null, faze: [], prodano: 0, vrednost: 0 };
  const admin = createAdminClient();
  const { data: kampanja } = await admin
    .from("promo_campaigns")
    .select("id")
    .eq("name", KAMPANJA)
    .maybeSingle();
  if (!kampanja) return prazno;
  const { data } = await admin
    .from("promo_campaign_targets")
    .select("pipeline_stage, deal_value")
    .eq("campaign_id", kampanja.id);
  const stetje = new Map<PipelineStage, number>();
  let vrednost = 0;
  let prodano = 0;
  for (const r of data ?? []) {
    const faza = r.pipeline_stage as PipelineStage;
    stetje.set(faza, (stetje.get(faza) ?? 0) + 1);
    if (faza === "won" || faza === "delivery" || faza === "completed") {
      prodano += 1;
      vrednost += Number(r.deal_value ?? 0);
    }
  }
  const prikazane: PipelineStage[] = ["replied", "called", "meeting", "offer", "negotiation", "won"];
  return {
    kampanjaId: kampanja.id as string,
    faze: prikazane.map((k) => ({ kljuc: k, oznaka: PIPELINE_STAGE_LABELS[k], stevilo: stetje.get(k) ?? 0 })),
    prodano,
    vrednost,
  };
}
