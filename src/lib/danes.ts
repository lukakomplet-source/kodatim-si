import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLeadClient } from "@/lib/leadDb";
import { danesLj } from "@/lib/klicPanik";
import type { ObsegPrevoznika } from "@/lib/obsegPrevoznika";
import { preberiDelavca, preberiEkipo } from "@/lib/prodajna-ekipa";

/**
 * Danes (faza 4 »Danes in klici«, 3. 11. 2026): en seznam za oba posla v vrstnem redu, kot ga Luka dela:
 * odgovori → dogovorjeni klici → klici (večji najprej) → maili za pregled. Kompletko bere samo Harvey Kompletko
 * (5556, GET /api/danes), zato seznam klicev ne izgine, ko Harvey KodaTim (5555) ne teče. KodaTim bere Promocije.
 * Vsak vir, ki ne odgovori, je null in na strani »ni podatka«, nikoli 0.
 */

const HARVEY_KOMPLETKO = process.env.HARVEY_KOMPLETKO_URL ?? "http://127.0.0.1:5556";

export type PoselDanes = "kodatim" | "kompletko";

type ObsegH = { tovornjaki?: number | null; zaposleni?: number | null; prihodki?: number | null; velikost?: number };

/** Vrstica iz Harvey Kompletko /api/danes (harvey/danes.py). */
export type VrsticaKompletko = {
  domena: string;
  podjetje: string;
  telefon: string;
  email: string;
  oseba?: string;
  opomba?: string;
  korak?: string;
  kdaj?: string | null;
  dogovor?: string;
  hladni?: boolean;
  poskusi?: number;
  osnutek?: boolean;
  kraj?: string;
  odlomek?: string;
  varianta?: string;
  vrsta?: "dogovorjen" | "klic" | "mail";
} & ObsegH;

export type DanesKompletko = {
  danes: string;
  odgovori: VrsticaKompletko[];
  dogovorjeni: VrsticaKompletko[];
  klici: VrsticaKompletko[];
  koraki: VrsticaKompletko[];
  naslednji: VrsticaKompletko[];
  osnutki: { caka: number; zaPoslat: number };
  hladni: { poklicaniDanes: number; naDan: number; vVrsti: number };
};

/** Ena vrstica seznama Danes, ne glede na posel. */
export type VrsticaDanes = {
  posel: PoselDanes;
  vrsta: "odgovor" | "dogovorjen" | "klic";
  /** Enolično v seznamu (posel + podjetje). */
  kljuc: string;
  podjetje: string;
  telefon: string;
  /** Kaj je na vrsti, za ljudi (»Hladni klic«, »Pokliči (dogovorjeno)«, »Odgovorili so«). */
  razlog: string;
  odlomek?: string;
  /** Datum koraka ali dogovora, »YYYY-MM-DD«. */
  kdaj?: string;
  velikost: number;
  hladni: boolean;
  poskusi: number;
  oseba?: string;
  email?: string;
  kraj?: string;
  opomba?: string;
  obseg?: ObsegPrevoznika;
  /** Follow-up za podjetje, ki ga še nismo klicali: najprej klic, mail samo, če ne dvigne. */
  najprejKlic?: boolean;
  /** Kompletko: domena podjetja (klic gre v Harvey Kompletko). */
  domena?: string;
  /** KodaTim: cilj in naloga v Promocijah (klic gre v updateCallInfo). */
  targetId?: string;
  taskId?: string | null;
  povezava?: string;
};

export type SeznamDanes = { danes: VrsticaDanes[]; naslednji: (VrsticaDanes & { vrstaNaslednji: string })[] };

async function izKompletka<T>(pot: string, ms = 4_000): Promise<T | null> {
  try {
    const r = await fetch(`${HARVEY_KOMPLETKO}${pot}`, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

function obseg(v: ObsegH): ObsegPrevoznika {
  return { tovornjaki: v.tovornjaki ?? null, zaposleni: v.zaposleni ?? null, prihodki: v.prihodki ?? null };
}

function izKompletko(v: VrsticaKompletko, vrsta: VrsticaDanes["vrsta"]): VrsticaDanes {
  const razlog =
    vrsta === "odgovor"
      ? "Odgovorili so"
      : v.korak === "Follow-up 1"
        ? "Pokliči, če ne dvigne: follow-up mail"
        : v.hladni && v.poskusi && vrsta === "klic"
          ? `Pokliči znova (${v.poskusi + 1}. poskus)`
          : (v.korak ?? "Klic");
  return {
    posel: "kompletko",
    vrsta,
    kljuc: `kompletko:${v.domena}`,
    podjetje: v.podjetje || v.domena,
    telefon: v.telefon ?? "",
    razlog,
    odlomek: v.odlomek || undefined,
    kdaj: (v.dogovor || v.kdaj || "").slice(0, 10) || undefined,
    velikost: v.velikost ?? 0,
    hladni: !!v.hladni,
    poskusi: v.poskusi ?? 0,
    oseba: v.oseba || undefined,
    email: v.email || undefined,
    kraj: v.kraj || undefined,
    opomba: v.opomba || undefined,
    obseg: obseg(v),
    najprejKlic: v.korak === "Follow-up 1",
    domena: v.domena,
  };
}

/** Kompletko del Danes iz Harveyja Kompletko; null, če ne odgovori (ali če še teče stara različica brez /api/danes). */
export async function preberiDanesKompletko(): Promise<{ podatki: DanesKompletko; seznam: SeznamDanes } | null> {
  const d = await izKompletka<DanesKompletko>("/api/danes");
  if (!d || !Array.isArray(d.klici)) return null;
  const danes = [
    ...(d.odgovori ?? []).map((v) => izKompletko(v, "odgovor")),
    ...(d.dogovorjeni ?? []).map((v) => izKompletko(v, "dogovorjen")),
    ...(d.klici ?? []).map((v) => izKompletko(v, "klic")),
  ];
  const naslednji = (d.naslednji ?? []).map((v) => {
    const vrstica = izKompletko(v, v.vrsta === "dogovorjen" ? "dogovorjen" : "klic");
    if (v.vrsta === "mail") return { ...vrstica, razlog: v.korak ?? "Mail", najprejKlic: false, vrstaNaslednji: "mail" };
    return { ...vrstica, vrstaNaslednji: v.vrsta === "dogovorjen" ? "dogovorjen klic" : "klic" };
  });
  return { podatki: d, seznam: { danes, naslednji } };
}

// ── KodaTim: Promocije (odgovori Harveyja KodaTim pridejo tja kot »Odgovorili« z nalogo »Pokliči«) ──

type LeadVrstica = { company_name: string | null; phone: string | null; email: string | null } | null;
type CiljVrstica = {
  id: string;
  campaign_id: string;
  pipeline_stage: string;
  call_notes: string | null;
  next_call_date: string | null;
  /** »no_answer«: ponovni klic po »Ni dvignil«, ne dogovorjen klic. */
  call_status?: string | null;
  lead: LeadVrstica;
};
type NalogaVrstica = {
  id: string;
  title: string;
  due_date: string | null;
  campaign_id: string;
  target_id: string | null;
  target: Omit<CiljVrstica, "campaign_id"> | null;
};

const KONCANE = ["won", "lost", "completed", "delivery"];

function odlomekOdgovora(notes: string | null): string | undefined {
  const t = (notes ?? "").replace(/^Odgovor na Harveyjevo sporočilo:\s*/, "").trim();
  return t ? t.slice(0, 280) : undefined;
}

function izKodaTim(
  c: Omit<CiljVrstica, "campaign_id"> | null,
  campaignId: string,
  vrsta: VrsticaDanes["vrsta"],
  razlog: string,
  kdaj: string | undefined,
  naslov: string,
  taskId: string | null,
): VrsticaDanes {
  return {
    posel: "kodatim",
    vrsta,
    kljuc: `kodatim:${c?.id ?? taskId}`,
    podjetje: c?.lead?.company_name || naslov,
    telefon: c?.lead?.phone ?? "",
    razlog,
    odlomek: vrsta === "odgovor" ? odlomekOdgovora(c?.call_notes ?? null) : undefined,
    kdaj,
    velikost: 0,
    hladni: false,
    poskusi: 0,
    email: c?.lead?.email || undefined,
    targetId: c?.id,
    taskId,
    povezava: `/admin/promocije/${campaignId}`,
  };
}

/** KodaTim del Danes (samo administrator): odgovori in dogovorjeni klici iz Promocij; null, če baza ne odgovori. */
export async function preberiDanesKodaTim(): Promise<{ seznam: SeznamDanes; leadovIzKlepeta: number } | null> {
  const admin = createAdminClient();
  const danes = danesLj();
  const teden = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [naloge, cilji, leadi] = await Promise.all([
    admin
      .from("promo_tasks")
      .select(
        "id, title, due_date, campaign_id, target_id, target:promo_campaign_targets(id, pipeline_stage, call_notes, next_call_date, lead:intel_leads(company_name, phone, email))",
      )
      .eq("status", "todo")
      .eq("type", "call")
      .order("due_date", { ascending: true })
      .limit(300)
      .returns<NalogaVrstica[]>(),
    admin
      .from("promo_campaign_targets")
      .select(
        "id, campaign_id, pipeline_stage, call_notes, next_call_date, call_status, lead:intel_leads(company_name, phone, email)",
      )
      .not("next_call_date", "is", null)
      .not("pipeline_stage", "in", `(${KONCANE.join(",")})`)
      .order("next_call_date", { ascending: true })
      .limit(300)
      .returns<CiljVrstica[]>(),
    admin.from("leads").select("*", { count: "exact", head: true }).gte("created_at", teden),
  ]);
  if (naloge.error || cilji.error) return null;

  const odgovori: VrsticaDanes[] = [];
  const dogovorjeni: VrsticaDanes[] = [];
  const klici: VrsticaDanes[] = [];
  const naslednji: SeznamDanes["naslednji"] = [];
  const videni = new Set<string>();

  for (const n of naloge.data ?? []) {
    if (n.target && KONCANE.includes(n.target.pipeline_stage)) continue;
    const kljuc = n.target?.id ?? n.id;
    if (videni.has(kljuc)) continue;
    videni.add(kljuc);
    const rok = n.due_date ?? danes;
    if (rok > danes) {
      naslednji.push({
        ...izKodaTim(n.target, n.campaign_id, "dogovorjen", n.title, rok, n.title, n.id),
        vrstaNaslednji: "klic",
      });
    } else if (n.target?.pipeline_stage === "replied") {
      odgovori.push(izKodaTim(n.target, n.campaign_id, "odgovor", "Odgovorili so", rok, n.title, n.id));
    } else {
      dogovorjeni.push(izKodaTim(n.target, n.campaign_id, "dogovorjen", n.title, rok, n.title, n.id));
    }
  }
  for (const c of cilji.data ?? []) {
    if (videni.has(c.id) || !c.next_call_date) continue;
    videni.add(c.id);
    // »Ni dvignil« (call_status no_answer): ponovni klic gre med klice, ne med dogovorjene (nič ni bilo dogovorjeno).
    const znova = c.call_status === "no_answer";
    const v = znova
      ? izKodaTim(c, c.campaign_id, "klic", "Pokliči znova (ni dvignil)", c.next_call_date, "", null)
      : izKodaTim(c, c.campaign_id, "dogovorjen", "Pokliči (dogovorjeno)", c.next_call_date, "", null);
    if (c.next_call_date > danes) naslednji.push({ ...v, vrstaNaslednji: znova ? "klic" : "dogovorjen klic" });
    else (znova ? klici : dogovorjeni).push(v);
  }

  return {
    seznam: { danes: [...odgovori, ...dogovorjeni, ...klici], naslednji },
    leadovIzKlepeta: leadi.count ?? 0,
  };
}

const RED: VrsticaDanes["vrsta"][] = ["odgovor", "dogovorjen", "klic"];

/** Oba posla v enem seznamu: odgovori, dogovorjeni, klici; znotraj skupine vrstni red vira (Kompletko pred KodaTim). */
export function zdruziVrstice(...viri: (VrsticaDanes[] | null | undefined)[]): VrsticaDanes[] {
  const vse = viri.flatMap((v) => v ?? []);
  return RED.flatMap((r) => vse.filter((v) => v.vrsta === r));
}

/** Naslednji dnevi obeh poslov, po datumu. */
export function zdruziNaslednje(...viri: (SeznamDanes["naslednji"] | null | undefined)[]): SeznamDanes["naslednji"] {
  return viri
    .flatMap((v) => v ?? [])
    .sort((a, b) => (a.kdaj ?? "").localeCompare(b.kdaj ?? "") || b.velikost - a.velikost);
}

// ── Številke dneva ──

/** Štiri številke dneva za en posel; null pri posamezni številki = ni podatka. */
export type StevilkeDneva = {
  klici: number | null;
  dvignjeni: number | null;
  sestanki: number | null;
  poslaniMaili: number | null;
  cilj: number;
  /** Kompletko: številke prijavljenega klicatelja (po imenu iz maila, kot harvey/stevilke.py ime()). */
  moje?: { ime: string; klici: number; dvignjeni: number; sestanki: number } | null;
};

const CILJ = 10;

type SkupajH = { klici: number; dvignjeni: number; sestanki: number; posli: number };
type StevilkeH = { danes: string; skupaj: SkupajH; po_osebi: Record<string, SkupajH>; poslani_maili: number; cilj: number };

/** Isto kot harvey/stevilke.py ime(): »teodora« iz »teodora.x@kompletko.com«. */
function imeIzMaila(email: string): string {
  const s = email.split("@", 1)[0].split(".", 1)[0];
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

export async function preberiStevilkeKompletko(email = ""): Promise<StevilkeDneva | null> {
  const s = await izKompletka<StevilkeH>("/api/stevilke-dneva");
  if (!s?.skupaj) return null;
  const ime = imeIzMaila(email);
  const m = ime ? s.po_osebi?.[ime] : undefined;
  return {
    klici: s.skupaj.klici,
    dvignjeni: s.skupaj.dvignjeni,
    sestanki: s.skupaj.sestanki,
    poslaniMaili: typeof s.poslani_maili === "number" ? s.poslani_maili : null,
    cilj: s.cilj || CILJ,
    moje: ime ? { ime, klici: m?.klici ?? 0, dvignjeni: m?.dvignjeni ?? 0, sestanki: m?.sestanki ?? 0 } : null,
  };
}

/** Lokalna polnoč v Ljubljani kot ISO čas (UTC), za štetje »od danes«. */
function polnocLj(): string {
  const del = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Ljubljana", timeZoneName: "longOffset" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;
  const m = del?.match(/GMT([+-]\d{2}):?(\d{2})?/);
  const zamik = m ? `${m[1]}:${m[2] ?? "00"}` : "+01:00";
  return new Date(`${danesLj()}T00:00:00${zamik}`).toISOString();
}

/** Stanja klica (CALL_STATUS_LABELS), pri katerih je nekdo dvignil. */
const DVIGNJENI = ["Klicano", "Zainteresiran", "Sestanek dogovorjen", "Ponudba poslana", "Pridobljen", "Izgubljen"];

/**
 * KodaTim: klici iz zgodovine leadov (updateCallInfo zapiše »Klic: <stanje> — opomba«), poslani maili iz Harveyja
 * KodaTim (posiljanje.danes). Maili, ki jih Luka pošlje sam iz Outlooka, tu niso šteti (ni preverjeno, ali jih
 * Harvey šteje). Ker updateCallInfo zapiše vrstico tudi ob popravku opombe ali datuma, se šteje vsak lead enkrat na
 * dan in »Ni klicano« sploh ne; dvignjeni so samo izrecna stanja, kjer je nekdo dvignil. Cilj je 10 na dan (ne
 * dnevna meja pošiljanja Harveyja).
 */
export async function preberiStevilkeKodaTim(): Promise<StevilkeDneva> {
  const [klici, ekipa] = await Promise.all([
    (async () => {
      try {
        const { data, error } = await createLeadClient()
          .from("intel_lead_activity")
          .select("lead_id, content")
          .eq("type", "call")
          .gte("created_at", polnocLj())
          .limit(1000);
        return error ? null : ((data ?? []) as { lead_id: string | null; content: string | null }[]);
      } catch {
        return null;
      }
    })(),
    preberiEkipo().catch(() => null),
  ]);
  const posiljanje = ekipa?.povzetek?.posiljanje;
  const stanje = (k: { content: string | null }) => (k.content ?? "").replace(/^Klic: /, "").split(" — ", 1)[0];
  const leadov = (pogoj: (s: string) => boolean) =>
    klici ? new Set(klici.filter((k) => pogoj(stanje(k))).map((k) => k.lead_id ?? k.content)).size : null;
  return {
    klici: leadov((s) => s !== "Ni klicano"),
    dvignjeni: leadov((s) => DVIGNJENI.includes(s)),
    sestanki: leadov((s) => s === "Sestanek dogovorjen"),
    poslaniMaili: typeof posiljanje?.danes === "number" ? posiljanje.danes : null,
    cilj: CILJ,
  };
}

// ── Maili, ki čakajo na človeka ──

/**
 * KodaTim: vse, kar čaka na Lukovo dejanje v Odobritvi Harveyja KodaTim: osnutki v seznamu in osnutki v mapah, ki
 * jih pošlje sam iz Outlooka (unija po id), brez mape panik gumba (ta je Kompletko in jo šteje Harvey Kompletko).
 * Branje traja do 15 s, zato ga stran izriše posebej (Suspense) in Kompletko del nanj ne čaka.
 */
export async function preberiCakaKodaTim(): Promise<{
  caka: number;
  mape: { kljuc: string; ime: string; zaPoslat: number; poslano: number; odgovoril: number }[];
} | null> {
  const o = await preberiDelavca("odobritev");
  if (!o) return null;
  const mape = (o.mape ?? []).filter((m) => m.lastnik !== "kompletko");
  const kompletko = new Set((o.mape ?? []).filter((m) => m.lastnik === "kompletko").map((m) => m.ime));
  const ids = new Set<string>();
  for (const p of o.seznam ?? []) {
    if (p.mapa && kompletko.has(p.mapa)) continue;
    ids.add(p.id ?? `${p.naslov}|${p.zadeva ?? ""}`);
  }
  for (const m of mape) for (const d of m.osnutki ?? []) ids.add(d.id ?? d.ime ?? `${m.kljuc}|${d.za}|${d.zadeva}`);
  return {
    caka: ids.size,
    mape: mape.map((m) => ({
      kljuc: m.kljuc,
      ime: m.ime,
      zaPoslat: m.osnutki?.length ?? 0,
      poslano: m.poslano,
      odgovoril: m.odgovoril,
    })),
  };
}
