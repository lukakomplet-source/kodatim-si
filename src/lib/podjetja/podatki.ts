import "server-only";
import { createLeadClient } from "@/lib/leadDb";
import { PIPELINE_STAGE_LABELS, type PipelineStage } from "@/lib/promocije/types";
import {
  davcnaIz,
  domenaIz,
  imeZaIskanje,
  maticnaIz,
  maticniSeUjemata,
  telefonIz,
} from "./kljuc";

/**
 * Podjetja (faza 6, 3. 11. 2026): en zapis za vsako podjetje z obema posloma, brez selitve podatkov.
 *
 * Bralni sloj prebere Stranke (intel_leads), Promocije (cilji kampanj), časovnico leadov (intel_lead_activity)
 * in oba Harveyja (GET /api/podjetja-kljuci) ter zapise poveže v pomnilniku: najprej po davčni (zadnjih 8 števk),
 * nato po domeni. Domena, ki jo ima več davčnih, ni ključ. Če se davčna ali matična ne ujemata, se zapisa ne
 * združita. Nič se ne prepisuje; vsak sistem ostane lastnik svojih podatkov. Rezultat se hrani 10 minut.
 */

const HARVEY = process.env.HARVEY_KODATIM_URL ?? "http://127.0.0.1:5555";
const HARVEY_KOMPLETKO = process.env.HARVEY_KOMPLETKO_URL ?? "http://127.0.0.1:5556";
const SPOMIN_MS = 10 * 60_000;

export type PoselPodjetja = "kodatim" | "kompletko";

export type Dogodek = {
  cas: string;
  posel: PoselPodjetja;
  vrsta: "mail" | "odgovor" | "klic" | "ogled" | "opomba" | "faza" | "pregled" | "stanje" | "obisk" | "sestanek" | "posel";
  opis: string;
  kdo?: string;
  /** Povezava za »Poglej« (mail, pogovor, predlog, kartica v Promocijah). */
  href?: string;
};

export type FazaKodaTim = {
  kampanja: string;
  kampanjaId: string;
  targetId: string;
  faza: string;
  oznaka: string;
  naslednjiKlic: string | null;
  posodobljeno: string;
};

export type Podjetje = {
  kljuc: string;
  ime: string;
  davcna: string;
  maticna: string;
  domene: string[];
  emaili: string[];
  telefoni: string[];
  kraj: string;
  odjava: boolean;
  kodatim: null | {
    leadIds: string[];
    leadStatus: string;
    /** Stanje v Harveyju KodaTim (najden, osnutek, outlook, poslano, odgovoril, zanimanje, odjava). */
    harvey: string;
    faze: FazaKodaTim[];
  };
  kompletko: null | {
    domena: string;
    /** kandidat, poslan, klic, odgovoril, sestanek, kupil, ne_zanima, nedostavljeno, zakljucen */
    stanje: string;
    oseba: string;
    dogovor: string;
    sestanek: { kdaj: string; kraj: string } | null;
    rocno: boolean;
  };
  dogodki: Dogodek[];
  /** Čas zadnjega dogodka (za razvrščanje); "" če ga ni. */
  zadnji: string;
  /** Kontakti po viru: uporabnik z enim poslom vidi samo kontakte svojega posla (zaPosel). */
  viri: Record<PoselPodjetja, KontaktPosla>;
};

export type KontaktPosla = { ime: string; kraj: string; domene: string[]; emaili: string[]; telefoni: string[] };

export type Indeks = {
  podjetja: Podjetje[];
  poKljucu: Map<string, Podjetje>;
  /** Vir, ki ni odgovoril (»ni podatka«, nikoli tiho prazen seznam). */
  manjka: string[];
  ustvarjeno: string;
};

// ── Branje virov ──

type Lead = {
  id: string;
  company_name: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  vat_id: string | null;
  address_city: string | null;
  lead_status: string | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
};

type Cilj = {
  id: string;
  campaign_id: string;
  lead_id: string;
  pipeline_stage: string | null;
  next_call_date: string | null;
  call_notes: string | null;
  updated_at: string;
};

type Aktivnost = { lead_id: string; type: string; content: string | null; created_at: string };

type HDogodek = {
  cas: string | null;
  vrsta: string;
  opis: string;
  kdo?: string;
  mail_id?: string;
  pogovor_id?: string;
  predlog?: string;
  /** Harvey Kompletko (Pregled v3): pot v adminu za »Poglej« (poslan mail, odgovor); samo »/admin/…«. */
  href?: string;
};

type HPodjetje = {
  id: string;
  ime: string;
  domena: string;
  spletna: string;
  kraj: string;
  davcna: string;
  maticna: string;
  emaili: string[];
  telefon?: string;
  telefoni?: string[];
  stanje: string;
  odjava: boolean;
  dogodki: HDogodek[];
  oseba?: string;
  dogovor?: string;
  sestanek?: { kdaj: string; kraj: string };
  rocno?: boolean;
};

async function vsiZapisi<T>(beri: (od: number, do_: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let od = 0; od < 50_000; od += 1000) {
    const { data, error } = await beri(od, od + 999);
    if (error) throw new Error("baza");
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function harvey(url: string): Promise<HPodjetje[] | null> {
  try {
    const r = await fetch(`${url}/api/podjetja-kljuci`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { podjetja?: HPodjetje[]; napaka?: string };
    return d.napaka || !Array.isArray(d.podjetja) ? null : d.podjetja;
  } catch {
    return null;
  }
}

// ── Povezovanje ──

type Zapis = {
  posel: PoselPodjetja;
  davcna: string;
  maticna: string;
  domene: string[];
  email: string[];
  ime: string;
  kraj: string;
  telefoni: string[];
};

/** Delovni zapis med povezovanjem; na koncu postane Podjetje. */
type Vozlisce = Podjetje & { _mat: string; _izbrisan?: boolean };

function prazenKontakt(): KontaktPosla {
  return { ime: "", kraj: "", domene: [], emaili: [], telefoni: [] };
}

function novo(z: Zapis): Vozlisce {
  return {
    kljuc: "",
    ime: z.ime,
    davcna: z.davcna,
    maticna: z.maticna,
    _mat: z.maticna,
    domene: [],
    emaili: [],
    telefoni: [],
    kraj: z.kraj,
    odjava: false,
    kodatim: null,
    kompletko: null,
    dogodki: [],
    zadnji: "",
    viri: { kodatim: prazenKontakt(), kompletko: prazenKontakt() },
  };
}

function dodajVse(cilj: string[], vrednosti: string[]) {
  for (const v of vrednosti) if (v && !cilj.includes(v)) cilj.push(v);
}

function dodajKontakt(k: KontaktPosla, z: KontaktPosla) {
  k.ime ||= z.ime;
  k.kraj ||= z.kraj;
  dodajVse(k.domene, z.domene);
  dodajVse(k.emaili, z.emaili);
  dodajVse(k.telefoni, z.telefoni);
}

/** Kompletko: kandidat (še nismo pisali) nikoli ne prepiše stanja, v katerem prodaja že je. */
function boljseKompletko(a: Podjetje["kompletko"], b: Podjetje["kompletko"]): Podjetje["kompletko"] {
  if (!a) return b;
  if (!b) return a;
  return a.stanje !== "kandidat" && b.stanje === "kandidat" ? a : b;
}

/** b se pridruži a (isto podjetje, najdeno po domeni šele po tem, ko sta že nastala dva zapisa). */
function zdruzi(a: Vozlisce, b: Vozlisce) {
  a.davcna ||= b.davcna;
  if (!a._mat && b._mat) a._mat = a.maticna = b._mat;
  a.ime ||= b.ime;
  a.kraj ||= b.kraj;
  dodajVse(a.domene, b.domene);
  dodajVse(a.emaili, b.emaili);
  dodajVse(a.telefoni, b.telefoni);
  dodajKontakt(a.viri.kodatim, b.viri.kodatim);
  dodajKontakt(a.viri.kompletko, b.viri.kompletko);
  a.odjava ||= b.odjava;
  if (b.kodatim) {
    if (!a.kodatim) a.kodatim = b.kodatim;
    else {
      dodajVse(a.kodatim.leadIds, b.kodatim.leadIds);
      a.kodatim.faze.push(...b.kodatim.faze);
      a.kodatim.leadStatus ||= b.kodatim.leadStatus;
      a.kodatim.harvey ||= b.kodatim.harvey;
    }
  }
  a.kompletko = boljseKompletko(a.kompletko, b.kompletko);
  a.dogodki.push(...b.dogodki);
  if (!a.kljuc && b.kljuc) a.kljuc = b.kljuc;
  b._izbrisan = true;
}

function zgradi(
  leadi: Lead[],
  cilji: Cilj[],
  kampanje: Map<string, string>,
  aktivnosti: Aktivnost[],
  hKodaTim: HPodjetje[] | null,
  hKompletko: HPodjetje[] | null,
): Vozlisce[] {
  // 1) Domene, ki jih ima več davčnih, niso ključ (sintal.si pokriva 8 podjetij).
  const davcneDomene = new Map<string, Set<string>>();
  const zabeleziDomeno = (dom: string, dav: string) => {
    if (!dom || !dav) return;
    if (!davcneDomene.has(dom)) davcneDomene.set(dom, new Set());
    davcneDomene.get(dom)!.add(dav);
  };
  for (const l of leadi) zabeleziDomeno(domenaIz(l.website) || domenaIz(l.email), davcnaIz(l.vat_id));
  for (const h of [...(hKodaTim ?? []), ...(hKompletko ?? [])]) zabeleziDomeno(domenaIz(h.domena || h.spletna), davcnaIz(h.davcna));
  const dvoumna = (dom: string) => (davcneDomene.get(dom)?.size ?? 0) > 1;
  const zdruzljiva = (a: Vozlisce, davcna: string, maticna: string) =>
    (!davcna || !a.davcna || a.davcna === davcna) && maticniSeUjemata(a._mat, maticna);

  const vozlisca: Vozlisce[] = [];
  const poDavcni = new Map<string, Vozlisce>();
  const poDomeni = new Map<string, Vozlisce>();
  const poEmailu = new Map<string, Vozlisce>();

  const najdi = (z: Zapis): Vozlisce => {
    let v: Vozlisce | undefined;
    if (z.davcna) v = poDavcni.get(z.davcna);
    if (!v) {
      for (const d of z.domene) {
        if (dvoumna(d)) continue;
        const k = poDomeni.get(d);
        // Different davčna (or matična) on the same domain: never merged.
        if (k && zdruzljiva(k, z.davcna, z.maticna)) {
          v = k;
          break;
        }
      }
    }
    if (!v && !z.davcna && !z.domene.length) {
      for (const e of z.email) {
        v = poEmailu.get(e);
        if (v) break;
      }
    }
    if (!v) {
      v = novo(z);
      vozlisca.push(v);
    }
    if (!v.davcna && z.davcna) v.davcna = z.davcna;
    if (!v._mat && z.maticna) v._mat = v.maticna = z.maticna;
    if (!v.ime && z.ime) v.ime = z.ime;
    if (!v.kraj && z.kraj) v.kraj = z.kraj;
    dodajVse(v.domene, z.domene);
    dodajVse(v.emaili, z.email);
    dodajVse(v.telefoni, z.telefoni);
    dodajKontakt(v.viri[z.posel], { ime: z.ime, kraj: z.kraj, domene: z.domene, emaili: z.email, telefoni: z.telefoni });
    if (v.davcna) poDavcni.set(v.davcna, v);
    for (const d of z.domene) if (!dvoumna(d) && !poDomeni.has(d)) poDomeni.set(d, v);
    for (const e of z.email) if (!poEmailu.has(e)) poEmailu.set(e, v);
    return v;
  };

  const email = (e: unknown) => {
    const s = String(e ?? "").trim().toLowerCase();
    return s.includes("@") ? [s] : [];
  };

  // 2) Stranke (KodaTim): skoraj vsi imajo davčno.
  const poLeadu = new Map<string, Vozlisce>();
  for (const l of leadi) {
    const cf = l.custom_fields ?? {};
    const dom = domenaIz(l.website) || domenaIz(l.email);
    const v = najdi({
      posel: "kodatim",
      davcna: davcnaIz(l.vat_id),
      maticna: maticnaIz(cf.registration_number),
      domene: dom ? [dom] : [],
      email: email(l.email),
      ime: l.company_name ?? "",
      kraj: l.address_city ?? "",
      telefoni: l.phone ? [l.phone] : [],
    });
    v.kodatim ??= { leadIds: [], leadStatus: "", harvey: "", faze: [] };
    dodajVse(v.kodatim.leadIds, [l.id]);
    v.kodatim.leadStatus ||= l.lead_status ?? "";
    const h = cf.harvey as { stanje?: string } | undefined;
    if (h && typeof h === "object" && h.stanje && !v.kodatim.harvey) v.kodatim.harvey = h.stanje;
    poLeadu.set(l.id, v);
  }

  // 3) Promocije: faze kampanj in časovnica leadov.
  for (const c of cilji) {
    const v = poLeadu.get(c.lead_id);
    if (!v?.kodatim) continue;
    const faza = c.pipeline_stage ?? "new";
    v.kodatim.faze.push({
      kampanja: kampanje.get(c.campaign_id) ?? "Kampanja",
      kampanjaId: c.campaign_id,
      targetId: c.id,
      faza,
      oznaka: PIPELINE_STAGE_LABELS[faza as PipelineStage] ?? faza,
      naslednjiKlic: c.next_call_date,
      posodobljeno: c.updated_at,
    });
  }
  const AKTIVNOST: Record<string, Dogodek["vrsta"]> = {
    note: "opomba",
    status_change: "faza",
    stage_changed: "faza",
    contacted: "klic",
    call: "klic",
    email_sent: "mail",
    email_replied: "odgovor",
    field_visit: "obisk",
    social_outreach: "opomba",
  };
  for (const a of aktivnosti) {
    const v = poLeadu.get(a.lead_id);
    const vrsta = AKTIVNOST[a.type];
    if (!v || !vrsta) continue;
    v.dogodki.push({
      cas: a.created_at,
      posel: "kodatim",
      vrsta,
      opis: a.content?.trim() || a.type,
      href: `/admin/lead-intelligence/leads/${a.lead_id}`,
    });
  }

  // 4) Harvey KodaTim in Harvey Kompletko.
  for (const [posel, seznam] of [
    ["kodatim", hKodaTim],
    ["kompletko", hKompletko],
  ] as const) {
    for (const h of seznam ?? []) {
      const dom = domenaIz(h.domena) || domenaIz(h.spletna);
      // ».rocno« (hand-entered carrier without a website) is a temporary key, not a domain.
      const rocnaDomena = !dom && /\.rocno$/.test(h.domena ?? "") ? h.domena : "";
      const v = najdi({
        posel,
        davcna: davcnaIz(h.davcna),
        maticna: maticnaIz(h.maticna),
        domene: dom ? [dom] : [],
        email: (h.emaili ?? []).map((e) => String(e).toLowerCase()),
        ime: h.ime ?? "",
        kraj: h.kraj ?? "",
        telefoni: [...(h.telefoni ?? []), ...(h.telefon ? [h.telefon] : [])],
      });
      if (h.odjava) v.odjava = true;
      if (posel === "kodatim") {
        v.kodatim ??= { leadIds: [], leadStatus: "", harvey: "", faze: [] };
        v.kodatim.harvey = h.stanje || v.kodatim.harvey;
      } else {
        v.kompletko = boljseKompletko(v.kompletko, {
          domena: dom || rocnaDomena || h.domena || "",
          stanje: h.stanje || "kandidat",
          oseba: h.oseba ?? "",
          dogovor: h.dogovor ?? "",
          sestanek: h.sestanek ?? null,
          rocno: !!h.rocno,
        });
        if (rocnaDomena && !v.kljuc) v.kljuc = `rocno:${rocnaDomena}`;
      }
      for (const d of h.dogodki ?? []) {
        if (!d.cas) continue;
        let href: string | undefined;
        if (d.mail_id) href = `/admin/komunikacija/mail/${encodeURIComponent(d.mail_id)}`;
        else if (d.pogovor_id) href = `/admin/komunikacija/pogovor/${encodeURIComponent(d.pogovor_id)}`;
        else if (d.predlog) href = `/predlog/${encodeURIComponent(d.predlog)}?interno`;
        else if (typeof d.href === "string" && /^\/admin\/[\w\-./%]+$/.test(d.href)) href = d.href;
        v.dogodki.push({
          cas: d.cas,
          posel,
          vrsta: (d.vrsta as Dogodek["vrsta"]) || "opomba",
          opis: String(d.opis ?? ""),
          kdo: d.kdo || undefined,
          href,
        });
      }
    }
  }

  // 5) Second pass: a company that became two records because its davčna and its domain came in through
  //    different rows (lead without davčna, lead without domain, Harvey with both) is joined by the domain.
  const prvi = new Map<string, Vozlisce>();
  for (const v of vozlisca) {
    for (const d of v.domene) {
      if (dvoumna(d)) continue;
      const a = prvi.get(d);
      if (!a) {
        prvi.set(d, v);
      } else if (a !== v && !a._izbrisan && zdruzljiva(a, v.davcna, v._mat)) {
        zdruzi(a, v);
        break;
      }
    }
  }
  const ostala = vozlisca.filter((v) => !v._izbrisan);

  // 6) Ključ (enoličen), razvrstitev.
  const zasedeni = new Set<string>();
  for (const v of ostala) {
    const domena = v.domene.find((d) => !dvoumna(d));
    let kljuc =
      v.davcna || domena || v.kljuc || v.emaili[0] || `rocno:${imeZaIskanje(v.ime).replace(/ /g, "-") || "brez-imena"}`;
    if (zasedeni.has(kljuc)) {
      let n = 2;
      while (zasedeni.has(`${kljuc}~${n}`)) n++;
      kljuc = `${kljuc}~${n}`;
    }
    zasedeni.add(kljuc);
    v.kljuc = kljuc;
    v.dogodki.sort((a, b) => b.cas.localeCompare(a.cas));
    // Zadnji stik, ne dogovorjen sestanek v prihodnosti (časovnica ga ima, seznam podjetij naj se po njem ne ravna).
    const zdaj = new Date().toISOString();
    v.zadnji = v.dogodki.find((d) => new Date(d.cas).toISOString() <= zdaj)?.cas ?? "";
  }
  return ostala;
}

// ── Spomin (10 minut; 30 sekund, ko kak vir ni odgovoril) ──

const g = globalThis as typeof globalThis & {
  __kodatimPodjetja?: { cas: number; obljuba: Promise<Indeks>; ms: number };
};

async function beri(): Promise<Indeks> {
  const db = createLeadClient();
  const manjka: string[] = [];
  const [leadi, cilji, kampanje, aktivnosti, hKodaTim, hKompletko] = await Promise.all([
    vsiZapisi<Lead>((od, do_) =>
      db
        .from("intel_leads")
        .select("id, company_name, website, email, phone, vat_id, address_city, lead_status, custom_fields, created_at")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(od, do_),
    ).catch(() => {
      manjka.push("Stranke");
      return [] as Lead[];
    }),
    vsiZapisi<Cilj>((od, do_) =>
      db
        .from("promo_campaign_targets")
        .select("id, campaign_id, lead_id, pipeline_stage, next_call_date, call_notes, updated_at")
        .order("added_at", { ascending: true })
        .order("id", { ascending: true })
        .range(od, do_),
    ).catch(() => {
      manjka.push("Promocije");
      return [] as Cilj[];
    }),
    db
      .from("promo_campaigns")
      .select("id, name")
      .then(({ data }) => new Map((data ?? []).map((k) => [k.id as string, (k.name as string) ?? ""]))),
    vsiZapisi<Aktivnost>((od, do_) =>
      db
        .from("intel_lead_activity")
        .select("lead_id, type, content, created_at")
        .not("type", "like", "enrichment%")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(od, do_),
    ).catch(() => {
      manjka.push("časovnica Strank");
      return [] as Aktivnost[];
    }),
    harvey(HARVEY),
    harvey(HARVEY_KOMPLETKO),
  ]);
  if (!hKodaTim) manjka.push("Harvey KodaTim");
  if (!hKompletko) manjka.push("Harvey Kompletko");
  const podjetja = zgradi(leadi, cilji, kampanje, aktivnosti, hKodaTim, hKompletko);
  const poKljucu = new Map<string, Podjetje>();
  for (const p of podjetja) poKljucu.set(p.kljuc, p);
  for (const p of podjetja) {
    if (p.davcna && !poKljucu.has(p.davcna)) poKljucu.set(p.davcna, p);
    for (const d of p.domene) if (!poKljucu.has(d)) poKljucu.set(d, p);
    for (const e of p.emaili) if (!poKljucu.has(e)) poKljucu.set(e, p);
    if (p.kompletko?.domena && !poKljucu.has(p.kompletko.domena)) poKljucu.set(p.kompletko.domena, p);
  }
  // Strip the working fields before the index leaves this module.
  for (const p of podjetja) {
    delete (p as Partial<Vozlisce>)._mat;
    delete (p as Partial<Vozlisce>)._izbrisan;
  }
  return { podjetja, poKljucu, manjka, ustvarjeno: new Date().toISOString() };
}

/** Vsa podjetja, povezana; isti rezultat 10 minut (osvezi = takoj znova). Če kak vir ni odgovoril, le 30 s. */
export function preberiPodjetja(osvezi = false): Promise<Indeks> {
  const zdaj = Date.now();
  const s = g.__kodatimPodjetja;
  if (!osvezi && s && zdaj - s.cas < s.ms) return s.obljuba;
  const obljuba = beri();
  const vnos = { cas: zdaj, obljuba, ms: SPOMIN_MS };
  g.__kodatimPodjetja = vnos;
  obljuba.then(
    (i) => {
      if (i.manjka.length) vnos.ms = 30_000;
    },
    () => {
      // A failed read is not kept.
      if (g.__kodatimPodjetja === vnos) g.__kodatimPodjetja = undefined;
    },
  );
  return obljuba;
}

/** Po vpisu klica ali pošiljanju: naslednji izris prebere znova. */
export function pozabiPodjetja(): void {
  g.__kodatimPodjetja = undefined;
}

// ── Pogled za uporabnika ──

/**
 * Kar sme videti uporabnik z enim samim poslom (Prodaja Kompletko vidi samo Kompletko): podjetja tega posla,
 * njegovi dogodki in kontakti samo iz njegovih virov. Davčna, matična in odjava so skupne (odjava velja za oba).
 */
export function zaPosel(p: Podjetje, kodatim: boolean, kompletko: boolean): Podjetje | null {
  const ima = (kodatim && !!p.kodatim) || (kompletko && !!p.kompletko);
  if (!ima) return null;
  if (kodatim && kompletko) return p;
  const vir = p.viri[kodatim ? "kodatim" : "kompletko"];
  const dogodki = p.dogodki.filter((d) => (d.posel === "kodatim" ? kodatim : kompletko));
  return {
    ...p,
    ime: vir.ime || p.ime,
    kraj: vir.kraj,
    domene: vir.domene,
    emaili: vir.emaili,
    telefoni: vir.telefoni,
    kodatim: kodatim ? p.kodatim : null,
    kompletko: kompletko ? p.kompletko : null,
    dogodki,
    zadnji: dogodki[0]?.cas ?? "",
    viri: { kodatim: kodatim ? vir : prazenKontakt(), kompletko: kompletko ? vir : prazenKontakt() },
  };
}

/** Iskanje po imenu, davčni, domeni, e-naslovu ali telefonu (zadnjih 8 števk). */
export function ujemaSe(p: Podjetje, q: string): boolean {
  const iskano = q.trim().toLowerCase();
  if (!iskano) return true;
  const stevke = iskano.replace(/\D/g, "");
  if (stevke.length >= 6) {
    if (p.davcna && p.davcna.includes(stevke.slice(-8))) return true;
    if (p.maticna && p.maticna.startsWith(stevke)) return true;
    const t = telefonIz(stevke);
    if (t && p.telefoni.some((x) => telefonIz(x) === t)) return true;
  }
  if (iskano.includes(".") || iskano.includes("@")) {
    if (p.domene.some((d) => d.includes(iskano)) || p.emaili.some((e) => e.includes(iskano))) return true;
    if (p.kompletko?.domena.includes(iskano)) return true;
  }
  const ime = imeZaIskanje(p.ime);
  return imeZaIskanje(iskano)
    .split(" ")
    .every((beseda) => ime.includes(beseda));
}

/** Je bilo podjetje danes (po slovenskem času) že kontaktirano: mail ali klic. */
export function danesKontaktiran(p: Podjetje): boolean {
  const danes = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" });
  return p.dogodki.some(
    (d) =>
      (d.vrsta === "mail" || d.vrsta === "klic") &&
      new Date(d.cas).toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" }) === danes,
  );
}
