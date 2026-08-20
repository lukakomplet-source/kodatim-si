import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ExternalLink, Home, Landmark, Map as MapIcon, Rows3, TrendingDown } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { razlozVec, type NepFiltri } from "@/lib/nepremicnine/poizvedba";
import {
  M2_NA_ENOTO_FILTER,
  M2_NA_ENOTO_OCENA,
  najemMediane,
  oceniKandidata,
  type OcenaKandidata,
} from "@/lib/nepremicnine/cilj";
import { bboxOkoli, kandidatiZaSredisce, razdaljaKm } from "@/lib/nepremicnine/kraji";
import { IskalnaVrstica } from "./IskalnaVrstica";
import { MojaIskanja, type ShranjenoIskanje } from "./MojaIskanja";
import { NepNav } from "./NepNav";
import { Zemljevid } from "./Zemljevid";

/**
 * SBN Nepremičnine — iskanje po LASTNI bazi, ne po internetu.
 *
 * Vsak podatek na kartici prihaja iz naše baze; slike ostajajo pri viru
 * (robots.txt: use=reference), zato je na vsaki kartici velik, nespregledljiv
 * gumb na izvirni oglas — tam so galerija in podrobnosti. AI vrstica zgoraj
 * stavek prevede v iste filtre, kot jih nastavi obrazec: en sam mehanizem, ki
 * ga je mogoče razložiti, ne dva, ki se razhajata.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Nepremičnine — SBN" };

const NA_STRAN = 30;

type Vrstica = {
  id: string;
  url: string;
  naslov: string | null;
  tip: string | null;
  podtip: string | null;
  posel: string;
  regija: string | null;
  kraj: string | null;
  cena_eur: number | null;
  cena_prvotna_eur: number | null;
  cena_m2_eur: number | null;
  povrsina_m2: number | null;
  zemljisce_m2: number | null;
  leto_izgradnje: number | null;
  leto_adaptacije: number | null;
  nadstropje: string | null;
  vec_enot: boolean;
  st_enot: number | null;
  st_enot_ocena: number | null;
  za_obnovo: boolean;
  za_investicijo: boolean;
  opis: string | null;
  agencija: string | null;
  telefon: string | null;
  slika_url: string | null;
  lat: number | null;
  lng: number | null;
  first_seen: string;
  status: string;
};

function eur(v: number | null): string {
  return v === null ? "—" : `${Math.round(v).toLocaleString("sl-SI")} €`;
}

/** Zunaj komponente, ker je render čist; strežniška funkcija sme brati uro. */
function odcitekUre(): number {
  return Date.now();
}

function dniNaTrgu(firstSeen: string, zdaj: number): number {
  return Math.max(0, Math.floor((zdaj - new Date(firstSeen).getTime()) / 86_400_000));
}

const TIPI_OZNAKE: Record<string, string> = {
  stanovanje: "Stanovanje",
  hisa: "Hiša",
  posest: "Posest / zemljišče",
  poslovni_prostor: "Poslovni prostor",
  garaza: "Garaža",
  vikend: "Vikend",
  pocitniski_objekt: "Počitniški objekt",
};

export default async function NepremicninePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/nepremicnine"));

  const sp = await searchParams;
  const st = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const num = (k: string) => {
    const v = Number(st(k));
    return Number.isFinite(v) && v > 0 ? v : null;
  };

  // AI vrstica: ?q=... (+ prejšnja sporočila seje v ?k=) se prevede v filtre.
  const q = st("q").trim();
  const kontekst = st("k");
  const segmenti = [...kontekst.split("⏵"), q].map((s) => s.trim()).filter(Boolean);
  const razklad = segmenti.length > 0 ? razlozVec(segmenti) : null;
  const ai: NepFiltri = razklad?.filtri ?? {};

  const cilj = razklad?.cilj ?? null;
  const pogled = st("pogled") === "zemljevid" ? "zemljevid" : "seznam";

  // Radij: središče se razreši v šifrantu krajev (toleranca na sklone).
  const db0 = createAvtonetClient();
  let radij: { lat: number; lng: number; km: number; ime: string } | null = null;
  if (ai.radijKm && ai.radijKraj) {
    const { tocni, predpona } = kandidatiZaSredisce(ai.radijKraj);
    let sredisce: { ime: string; lat: number; lng: number } | null = null;
    for (const kandidat of tocni) {
      const { data } = await db0
        .from("nep_kraji")
        .select("ime, lat, lng")
        .eq("ime_norm", kandidat)
        .order("prebivalcev", { ascending: false, nullsFirst: false })
        .limit(1);
      if (data && data.length > 0) {
        sredisce = data[0] as { ime: string; lat: number; lng: number };
        break;
      }
    }
    if (!sredisce && predpona) {
      const { data } = await db0
        .from("nep_kraji")
        .select("ime, lat, lng")
        .like("ime_norm", `${predpona}%`)
        .order("prebivalcev", { ascending: false, nullsFirst: false })
        .limit(1);
      if (data && data.length > 0) sredisce = data[0] as { ime: string; lat: number; lng: number };
    }
    if (sredisce) radij = { lat: sredisce.lat, lng: sredisce.lng, km: ai.radijKm, ime: sredisce.ime };
  }

  const posel = st("posel") || ai.posel || "prodaja";
  // AI zna dati več tipov hkrati ("hiša ali objekt"); obrazec še vedno enega.
  const tipi = st("tip") ? [st("tip")] : (ai.tipi ?? []);
  const regija = st("regija") || ai.regija || "";
  const kraj = st("kraj") || ai.kraj || "";
  const cenaMin = num("cenaMin") ?? ai.cenaMin ?? null;
  const cenaMax = num("cenaMax") ?? ai.cenaMax ?? null;
  const povrsinaMin = num("povrsinaMin") ?? ai.povrsinaMin ?? null;
  const zemljisceMin = num("zemljisceMin") ?? ai.zemljisceMin ?? null;
  const vecEnot = st("vecEnot") === "1" || ai.vecEnot === true;
  const zaObnovo = st("zaObnovo") === "1" || ai.zaObnovo === true;
  const zaInvesticijo = st("zaInvesticijo") === "1" || ai.zaInvesticijo === true;
  const noviDni = num("noviDni") ?? ai.noviDni ?? null;
  const enotMin = num("enotMin") ?? ai.enotMin ?? null;
  // Polja z oglasne strani (2. faza). Filtrirajo samo tiste oglase, ki jih je
  // detajlni zajem že obiskal — dokler se vrsta prazni, jih je vsak dan več.
  const sobMin = num("sobMin");
  const oprema = new Set(
    (Array.isArray(sp.oprema) ? sp.oprema : sp.oprema ? [sp.oprema] : []).map((v) => String(v))
  );
  const samoSPodrobnostmi = st("sPodrobnostmi") === "1" || sobMin !== null || oprema.size > 0;
  const razvrsti = st("razvrsti") || ai.razvrsti || "novi";
  // Razvrstitev po padcu brez filtra padca bi vrnila oglase brez padca.
  const padecCene = st("padecCene") === "1" || ai.padecCene === true || razvrsti === "padec";
  const stran = Math.max(1, num("stran") ?? 1);

  const zdaj = odcitekUre();
  const db = db0;
  let qy = db.from("nep_oglasi").select("*", { count: "exact" }).eq("status", "aktiven").eq("posel", posel);
  if (tipi.length === 1) qy = qy.eq("tip", tipi[0]);
  else if (tipi.length > 1) qy = qy.in("tip", tipi);
  if (regija) qy = qy.eq("regija", regija);
  if (kraj) qy = qy.ilike("kraj", `%${kraj}%`);
  if (cenaMin !== null) qy = qy.gte("cena_eur", cenaMin);
  if (cenaMax !== null) qy = qy.lte("cena_eur", cenaMax);
  if (povrsinaMin !== null) qy = qy.gte("povrsina_m2", povrsinaMin);
  if (zemljisceMin !== null) qy = qy.gte("zemljisce_m2", zemljisceMin);
  if (vecEnot) qy = qy.eq("vec_enot", true);
  if (zaObnovo) qy = qy.eq("za_obnovo", true);
  if (zaInvesticijo) qy = qy.eq("za_investicijo", true);
  if (noviDni !== null) qy = qy.gte("first_seen", new Date(zdaj - noviDni * 86_400_000).toISOString());
  if (enotMin !== null) qy = qy.or(`st_enot.gte.${enotMin},st_enot_ocena.gte.${enotMin}`);
  // Padec cene: izračunani stolpec padec_pct (PostgREST ne zna primerjati
  // dveh stolpcev — prejšnja različica je vračala HTTP 400).
  if (padecCene) qy = qy.not("padec_pct", "is", null);
  if (samoSPodrobnostmi) qy = qy.not("detajl_zajet", "is", null);
  // Sobe ali spalnice: vira ju navajata različno (nepremicnine.net pozna samo
  // spalnice, bolha samo sobe), zato zadošča kateri koli od obeh.
  if (sobMin !== null) qy = qy.or(`st_sob.gte.${sobMin},st_spalnic.gte.${sobMin}`);
  for (const polje of ["balkon", "terasa", "vrt", "klet", "dvigalo"]) {
    if (oprema.has(polje)) qy = qy.eq(polje, true);
  }
  if (oprema.has("parkirno")) qy = qy.not("parkirno", "is", null);
  // Cilj: kandidata ne določa značka iz opisa (nosi jo le peščica oglasov),
  // ampak ZMOŽNOST — dovolj m² za ciljne enote ali že zaznane enote.
  if (cilj) {
    qy = qy.or(
      `povrsina_m2.gte.${cilj.enote * M2_NA_ENOTO_FILTER},st_enot.gte.${cilj.enote},st_enot_ocena.gte.${cilj.enote},vec_enot.eq.true`
    );
  }
  // Radij: grobi pravokotnik reže v bazi, natančni krog (haversine) v kodi.
  if (radij) {
    const b = bboxOkoli(radij.lat, radij.lng, radij.km);
    qy = qy.gte("lat", b.latMin).lte("lat", b.latMax).gte("lng", b.lngMin).lte("lng", b.lngMax);
  }

  switch (razvrsti) {
    case "cena_nizja":
      qy = qy.order("cena_eur", { ascending: true, nullsFirst: false });
      break;
    case "cena_visja":
      qy = qy.order("cena_eur", { ascending: false, nullsFirst: false });
      break;
    case "m2_nizja":
      qy = qy.order("cena_m2_eur", { ascending: true, nullsFirst: false });
      break;
    case "zemljisce":
      qy = qy.order("zemljisce_m2", { ascending: false, nullsFirst: false });
      break;
    case "enote":
      qy = qy
        .order("st_enot", { ascending: false, nullsFirst: false })
        .order("st_enot_ocena", { ascending: false, nullsFirst: false });
      break;
    case "padec":
      qy = qy.order("padec_pct", { ascending: false, nullsFirst: false });
      break;
    case "novi":
    default:
      qy = qy.order("first_seen", { ascending: false });
  }
  // Cilj, radij in zemljevid potrebujejo VEČ kot eno stran: preberemo do 300
  // kandidatov, ocenimo/izmerimo/razvrstimo tu, šele nato režemo na strani.
  const KANDIDATOV_MAX = 300;
  const nacinVsi = Boolean(cilj || radij || pogled === "zemljevid");
  qy = qy.order("id", { ascending: true });
  qy = nacinVsi ? qy.range(0, KANDIDATOV_MAX - 1) : qy.range((stran - 1) * NA_STRAN, stran * NA_STRAN - 1);

  const { data, count, error } = await qy;
  let vrstice = (data ?? []) as unknown as Vrstica[];
  const skupaj = count ?? 0;

  // Natančni krog radija + razdalje za prikaz na karticah.
  const razdalje = new Map<string, number>();
  if (radij) {
    vrstice = vrstice.filter((v) => {
      if (v.lat === null || v.lng === null) return false;
      const d = razdaljaKm(radij.lat, radij.lng, v.lat, v.lng);
      if (d > radij.km) return false;
      razdalje.set(v.id, Math.round(d * 10) / 10);
      return true;
    });
  }

  let ocene: Map<string, OcenaKandidata> | null = null;
  if (cilj) {
    // Mediane najemnin €/m² po regijah iz NAŠIH najemnih oglasov — en sam
    // query za vse kandidate (enota hiše se oddaja kot stanovanje).
    const { data: najemni } = await db
      .from("nep_oglasi")
      .select("regija, cena_eur, povrsina_m2")
      .eq("status", "aktiven")
      .eq("posel", "oddaja")
      .eq("tip", "stanovanje")
      .gt("cena_eur", 100)
      .lt("cena_eur", 10000)
      .limit(5000);
    const mediane = najemMediane(
      (najemni ?? []) as { regija: string | null; cena_eur: number | null; povrsina_m2: number | null }[]
    );
    ocene = new Map(vrstice.map((v) => [v.id, oceniKandidata(cilj, v, mediane)]));
    if (razvrsti === "cilj") {
      vrstice = [...vrstice].sort((a, b) => {
        const oa = ocene!.get(a.id)!.ocena;
        const ob = ocene!.get(b.id)!.ocena;
        if (ob !== oa) return ob - oa;
        return (a.cena_eur ?? Number.MAX_SAFE_INTEGER) - (b.cena_eur ?? Number.MAX_SAFE_INTEGER);
      });
    }
  }

  // V načinu "vsi" (cilj/radij/zemljevid) listamo po prefiltriranem naboru.
  const prefiltrirano = nacinVsi ? vrstice.length : skupaj;
  const tockeZemljevida = nacinVsi
    ? vrstice
        .filter((v) => v.lat !== null && v.lng !== null)
        .map((v) => ({ id: v.id, lat: v.lat!, lng: v.lng!, cena: v.cena_eur === null ? null : Number(v.cena_eur), naslov: v.naslov ?? v.kraj }))
    : [];
  if (nacinVsi) vrstice = vrstice.slice((stran - 1) * NA_STRAN, stran * NA_STRAN);
  const naVoljo = nacinVsi ? prefiltrirano : skupaj;

  const { count: vsehAktivnih } = await db
    .from("nep_oglasi")
    .select("id", { count: "exact", head: true })
    .eq("status", "aktiven");

  // Shranjena iskanja prijavljenega uporabnika (za vrstico z značkami).
  let mojaIskanja: ShranjenoIskanje[] = [];
  if (dostop.userId) {
    const { data: iskanjaData } = await db
      .from("nep_iskanja")
      .select("id, ime, q, zadnjih_novih")
      .eq("created_by", dostop.userId)
      .eq("aktivno", true)
      .order("created_at", { ascending: false })
      .limit(12);
    mojaIskanja = (iskanjaData ?? []) as ShranjenoIskanje[];
  }

  const trenutni = {
    q,
    k: kontekst,
    pogled: pogled === "zemljevid" ? "zemljevid" : "",
    posel,
    tip: tipi.length === 1 ? tipi[0] : "",
    regija,
    kraj,
    cenaMin: cenaMin?.toString() ?? "",
    cenaMax: cenaMax?.toString() ?? "",
    povrsinaMin: povrsinaMin?.toString() ?? "",
    zemljisceMin: zemljisceMin?.toString() ?? "",
    vecEnot: vecEnot ? "1" : "",
    zaObnovo: zaObnovo ? "1" : "",
    zaInvesticijo: zaInvesticijo ? "1" : "",
    noviDni: noviDni?.toString() ?? "",
    enotMin: enotMin?.toString() ?? "",
    padecCene: padecCene ? "1" : "",
    sobMin: sobMin?.toString() ?? "",
    sPodrobnostmi: st("sPodrobnostmi") === "1" ? "1" : "",
    razvrsti,
  };
  const povezava = (spremembe: Record<string, string>) => {
    const query: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries({ ...trenutni, ...spremembe })) if (v) query[k] = v;
    // Oprema je edini večvrednostni parameter; brez tega bi ga vsak klik na
    // naslednjo stran tiho izgubil.
    if (oprema.size > 0) query.oprema = [...oprema];
    return { pathname: "/nepremicnine", query };
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <Building2 className="h-7 w-7 text-accent" />
        Nepremičnine
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-zinc-500">
        Lastna baza slovenskega nepremičninskega trga ({(vsehAktivnih ?? 0).toLocaleString("sl-SI")}{" "}
        aktivnih oglasov, osveženo dnevno). Iskanje teče po naši bazi; slike in galerija so pri viru —
        vsaka kartica ima velik gumb na izvirni oglas.
      </p>

      <NepNav aktiven="/nepremicnine" jeAdmin={dostop.jeAdmin} />

      <IskalnaVrstica zacetno={q} kontekst={kontekst} />

      <MojaIskanja iskanja={mojaIskanja} trenutniQ={segmenti.join(" · ")} trenutniFiltri={razklad?.filtri ?? {}} />

      {razklad && razklad.razumljeno.length > 0 && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Razumel sem: {razklad.razumljeno.join(" · ")}
          {radij && (
            <span className="block text-xs text-emerald-700">
              Središče radija: {radij.ime} — razdalje so merjene do centroida kraja oglasa (približno).
            </span>
          )}
          {ai.radijKraj && !radij && (
            <span className="block text-xs text-amber-700">
              Kraja „{ai.radijKraj}“ ni v šifrantu — radij ni uporabljen.
            </span>
          )}
        </p>
      )}
      {razklad?.nerazumljeno && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
          {razklad.nerazumljeno}
        </p>
      )}

      {/* Filtri — GET obrazec, kot povsod v tej kodni bazi. Skrita polja
          nosijo sejo (q/k/pogled) naprej, sicer bi oddaja obrazca vrgla stran
          radij, cilj in kontekst pogovora. */}
      <form className="mt-5 flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-200 bg-white p-4">
        {q && <input type="hidden" name="q" value={q} />}
        {kontekst && <input type="hidden" name="k" value={kontekst} />}
        {pogled === "zemljevid" && <input type="hidden" name="pogled" value="zemljevid" />}
        {enotMin !== null && <input type="hidden" name="enotMin" value={enotMin} />}
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Posel
          <select name="posel" defaultValue={posel} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900">
            <option value="prodaja">Prodaja</option>
            <option value="oddaja">Oddaja</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Tip
          <select name="tip" defaultValue={tipi.length === 1 ? tipi[0] : ""} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900">
            <option value="">Vsi tipi</option>
            {Object.entries(TIPI_OZNAKE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Regija
          <select name="regija" defaultValue={regija} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900">
            <option value="">Vse regije</option>
            {["ljubljana-mesto", "ljubljana-okolica", "podravska", "savinjska", "gorenjska", "dolenjska", "notranjska", "obalno-kraska", "goriska", "koroska", "pomurska", "posavska", "zasavska"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Kraj
          <input name="kraj" defaultValue={kraj} placeholder="npr. Maribor" className="w-32 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Cena od
          <input name="cenaMin" type="number" defaultValue={cenaMin ?? ""} className="w-28 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Cena do
          <input name="cenaMax" type="number" defaultValue={cenaMax ?? ""} className="w-28 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Površina od (m²)
          <input name="povrsinaMin" type="number" defaultValue={povrsinaMin ?? ""} className="w-24 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Zemljišče od (m²)
          <input name="zemljisceMin" type="number" defaultValue={zemljisceMin ?? ""} className="w-24 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Sob od
          <input name="sobMin" type="number" min={1} max={20} defaultValue={sobMin ?? ""} className="w-20 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm" />
        </label>
        {[
          { ime: "vecEnot", oznaka: "več enot", vklop: vecEnot },
          { ime: "zaObnovo", oznaka: "za obnovo", vklop: zaObnovo },
          { ime: "zaInvesticijo", oznaka: "investicijsko", vklop: zaInvesticijo },
          { ime: "padecCene", oznaka: "znižana cena", vklop: padecCene },
          { ime: "sPodrobnostmi", oznaka: "s podrobnostmi", vklop: st("sPodrobnostmi") === "1" },
        ].map((c) => (
          <label key={c.ime} className="flex items-center gap-1.5 self-end rounded-lg border border-zinc-200 px-2.5 py-2 text-xs">
            <input type="checkbox" name={c.ime} value="1" defaultChecked={c.vklop} className="h-3.5 w-3.5" />
            {c.oznaka}
          </label>
        ))}
        {/* Oprema z oglasne strani. Vsaka kljukica hkrati pomeni "samo oglasi,
            ki jih je detajlni zajem že obiskal" — sicer bi filter tiho izločil
            vse, česar še nismo pogledali, in izgledal kot prazen rezultat. */}
        {[
          { ime: "balkon", oznaka: "balkon" },
          { ime: "terasa", oznaka: "terasa" },
          { ime: "vrt", oznaka: "vrt / atrij" },
          { ime: "klet", oznaka: "klet" },
          { ime: "dvigalo", oznaka: "dvigalo" },
          { ime: "parkirno", oznaka: "parkirišče" },
        ].map((c) => (
          <label
            key={c.ime}
            className="flex items-center gap-1.5 self-end rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs"
          >
            <input type="checkbox" name="oprema" value={c.ime} defaultChecked={oprema.has(c.ime)} className="h-3.5 w-3.5" />
            {c.oznaka}
          </label>
        ))}
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Razvrsti
          <select name="razvrsti" defaultValue={razvrsti} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900">
            {cilj && <option value="cilj">ustreznost cilju (AI)</option>}
            <option value="novi">najnovejši</option>
            <option value="cena_nizja">najcenejši</option>
            <option value="cena_visja">najdražji</option>
            <option value="m2_nizja">najnižja cena/m²</option>
            <option value="zemljisce">največ zemljišča</option>
            <option value="enote">največ enot (investitor)</option>
            <option value="padec">največji padec cene</option>
          </select>
        </label>
        <button type="submit" className="self-end rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
          Uporabi
        </button>
        <Link href="/nepremicnine" className="self-end rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
          Počisti
        </Link>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          {naVoljo.toLocaleString("sl-SI")} zadetkov
          {radij && <span> v {radij.km} km okoli kraja {radij.ime}</span>}
          {nacinVsi && skupaj > KANDIDATOV_MAX && (
            <span> · obdelanih {KANDIDATOV_MAX} od {skupaj.toLocaleString("sl-SI")} — zoži filtre (kraj, cena) za popolno pokritje</span>
          )}
          {error && <span className="text-red-600"> · napaka: {error.message}</span>}
        </p>
        <div className="flex gap-1 rounded-xl border border-zinc-200 bg-white p-1 text-sm font-semibold">
          <Link
            href={povezava({ pogled: "", stran: "" })}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${pogled === "seznam" ? "bg-accent text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
          >
            <Rows3 className="h-4 w-4" />
            Seznam
          </Link>
          <Link
            href={povezava({ pogled: "zemljevid", stran: "" })}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${pogled === "zemljevid" ? "bg-accent text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
          >
            <MapIcon className="h-4 w-4" />
            Zemljevid
          </Link>
        </div>
      </div>

      {pogled === "zemljevid" && (
        <div className="mt-3">
          <Zemljevid tocke={tockeZemljevida} sredisce={radij ? { lat: radij.lat, lng: radij.lng, km: radij.km } : null} />
          <p className="mt-1.5 text-xs text-zinc-400">
            Prikazanih {tockeZemljevida.length} oglasov s koordinatami (centroid kraja — približno). Klik na
            ceno odpre podrobnosti.
          </p>
        </div>
      )}

      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {vrstice.map((v) => {
          const znizana = v.cena_prvotna_eur !== null && v.cena_eur !== null && v.cena_eur < v.cena_prvotna_eur;
          const dni = dniNaTrgu(v.first_seen, zdaj);
          const oc = cilj && ocene ? (ocene.get(v.id) ?? null) : null;
          return (
            <article key={v.id} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    {v.tip === "hisa" ? <Home className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                    {TIPI_OZNAKE[v.tip ?? ""] ?? v.tip} {v.podtip ? `· ${v.podtip}` : ""}
                  </p>
                  <h2 className="mt-1 truncate text-[15px] font-semibold text-zinc-900" title={v.naslov ?? ""}>
                    <Link href={`/nepremicnine/oglas/${v.id}`} className="hover:text-accent">
                      {v.kraj ?? v.naslov ?? "—"}
                    </Link>
                  </h2>
                  <p className="text-xs text-zinc-500">{v.regija ?? ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-bold text-zinc-900">{eur(v.cena_eur)}</p>
                  {znizana && (
                    <p className="flex items-center justify-end gap-1 text-xs font-semibold text-emerald-600">
                      <TrendingDown className="h-3.5 w-3.5" />
                      <span className="text-zinc-400 line-through">{eur(v.cena_prvotna_eur)}</span>
                    </p>
                  )}
                  {v.cena_m2_eur !== null && <p className="text-[11px] text-zinc-400">{eur(v.cena_m2_eur)}/m²</p>}
                </div>
              </div>

              {/* Vsi podatki, ki jih imamo — nič skritega. */}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600">
                {v.povrsina_m2 !== null && (
                  <div className="flex justify-between"><dt className="text-zinc-400">Površina</dt><dd className="font-medium">{v.povrsina_m2} m²</dd></div>
                )}
                {v.zemljisce_m2 !== null && (
                  <div className="flex justify-between"><dt className="text-zinc-400">Zemljišče</dt><dd className="font-medium">{v.zemljisce_m2} m²</dd></div>
                )}
                {v.leto_izgradnje !== null && (
                  <div className="flex justify-between"><dt className="text-zinc-400">Zgrajeno</dt><dd className="font-medium">{v.leto_izgradnje}</dd></div>
                )}
                {v.leto_adaptacije !== null && (
                  <div className="flex justify-between"><dt className="text-zinc-400">Adaptirano</dt><dd className="font-medium">{v.leto_adaptacije}</dd></div>
                )}
                {v.nadstropje && (
                  <div className="flex justify-between"><dt className="text-zinc-400">Etažnost</dt><dd className="font-medium">{v.nadstropje}</dd></div>
                )}
                {v.st_enot !== null && (
                  <div className="flex justify-between"><dt className="text-zinc-400">Enot</dt><dd className="font-medium">{v.st_enot} potrjeno</dd></div>
                )}
                {v.st_enot === null && v.st_enot_ocena !== null && (
                  <div className="flex justify-between"><dt className="text-zinc-400">Enot (možnost)</dt><dd className="font-medium">~{v.st_enot_ocena}</dd></div>
                )}
                {v.agencija && (
                  <div className="col-span-2 flex justify-between gap-2"><dt className="text-zinc-400">Prodaja</dt><dd className="truncate font-medium" title={v.agencija}>{v.agencija}</dd></div>
                )}
                {v.telefon && (
                  <div className="flex justify-between"><dt className="text-zinc-400">Telefon</dt><dd><a href={`tel:${v.telefon.replace(/[^\d+]/g, "")}`} className="font-medium text-accent">{v.telefon}</a></dd></div>
                )}
                <div className="flex justify-between"><dt className="text-zinc-400">Na trgu</dt><dd className="font-medium">{dni} dni</dd></div>
                {razdalje.has(v.id) && (
                  <div className="flex justify-between"><dt className="text-zinc-400">Oddaljenost</dt><dd className="font-medium">~{razdalje.get(v.id)} km</dd></div>
                )}
              </dl>

              {/* značke */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dni <= 7 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">Novo</span>}
                {znizana && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Znižano</span>}
                {v.vec_enot && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">Več enot</span>}
                {v.za_obnovo && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Za obnovo</span>}
                {v.za_investicijo && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600">Investicija</span>}
                {dni >= 180 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">Dolgo na trgu</span>}
              </div>

              {/* Mini-izračun proti cilju: iste ločnice kot v kalkulatorju —
                  potrjeno / ocena / predpostavka, vsaka številka pove svoj vir. */}
              {cilj && oc && (
                <div className="mt-2 rounded-xl bg-accent/5 px-3 py-2.5 ring-1 ring-accent/20" title={oc.razlogi.join(" · ")}>
                  <p className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        oc.oznaka === "ustreza"
                          ? "bg-emerald-100 text-emerald-700"
                          : oc.oznaka === "tesno"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-zinc-200 text-zinc-500"
                      }`}
                    >
                      {oc.oznaka === "ustreza" ? "Ustreza cilju" : oc.oznaka === "tesno" ? "Tesno" : "Ne doseže cilja"}
                    </span>
                    <span className="text-[11px] font-semibold text-zinc-400">ocena {oc.ocena}/100</span>
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-600">
                    <li>
                      {oc.zmoznostEnot === null
                        ? "Zmožnosti enot ni mogoče oceniti (ni ne m² ne enot)."
                        : oc.enoteVir === "potrjeno"
                          ? `${oc.zmoznostEnot} enot potrjeno v oglasu (cilj ${cilj.enote}).`
                          : oc.enoteVir === "ocena"
                            ? `~${oc.zmoznostEnot} enot — ocena iz opisa (cilj ${cilj.enote}).`
                            : `~${oc.zmoznostEnot} enot iz ${v.povrsina_m2} m² pri ${M2_NA_ENOTO_OCENA} m²/enoto — predpostavka (cilj ${cilj.enote}).`}
                    </li>
                    <li>
                      {oc.najemninaEnota === null
                        ? "Ocene najemnine ni (premalo najemnih vzorcev)."
                        : `Najemnina ~${oc.najemninaEnota} €/enoto — mediana ${oc.najemninaObmocje} (n=${oc.najemninaVzorec})` +
                          (cilj.najemninaNaEnoto !== null ? `, cilj ${cilj.najemninaNaEnoto} €.` : ".")}
                    </li>
                    {oc.cenaSumljiva && (
                      <li className="font-semibold text-red-600">
                        Cena je za prodajo sumljivo nizka — verjetno napaka vira, preveri oglas.
                      </li>
                    )}
                    {oc.zaPrenovo !== null && (
                      <li className={oc.zaPrenovo <= 0 ? "font-semibold text-red-600" : ""}>
                        {oc.zaPrenovo <= 0
                          ? "Kupnina požre ves proračun — za prenovo ne ostane nič."
                          : `Za prenovo ostane ${eur(oc.zaPrenovo)}${oc.zaPrenovoM2 !== null ? ` (~${oc.zaPrenovoM2} €/m²)` : ""}.`}
                      </li>
                    )}
                    {oc.brutoDonosPct !== null && cilj.proracun !== null && (
                      <li>
                        Bruto donos ~{oc.brutoDonosPct.toLocaleString("sl-SI")} % pri proračunu {eur(cilj.proracun)} (z
                        ocenjeno najemnino).
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {v.opis && <p className="mt-2 line-clamp-3 text-xs text-zinc-500">{v.opis}</p>}

              {/* Velik, nespregledljiv gumb na izvirnik: slike in galerija so tam. */}
              <div className="mt-3 flex gap-2">
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
                >
                  <ExternalLink className="h-4 w-4" />
                  ODPRI OGLAS S SLIKAMI
                </a>
                <Link
                  href={{
                    pathname: "/nepremicnine/kalkulator",
                    query: {
                      oglas: v.id,
                      ...(cilj
                        ? {
                            enot: String(cilj.enote),
                            ...(cilj.najemninaNaEnoto !== null ? { najemnina: String(cilj.najemninaNaEnoto) } : {}),
                            ...(cilj.proracun !== null && v.cena_eur !== null
                              ? { prenova: String(Math.max(0, cilj.proracun - Math.round(v.cena_eur))) }
                              : {}),
                          }
                        : {}),
                    },
                  }}
                  title={
                    cilj
                      ? "Odpre kalkulator s ceno tega oglasa in TVOJIM ciljem (enote, najemnina, prenova do proračuna)"
                      : "Odpre kalkulator s ceno in enotami tega oglasa ter oceno najemnine iz naših najemnih oglasov"
                  }
                  className="inline-flex items-center justify-center rounded-xl border-2 border-accent/40 px-3 py-3 text-sm font-bold text-accent transition hover:bg-accent/5"
                >
                  ANALIZIRAJ
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {naVoljo > NA_STRAN && (
        <div className="mt-6 flex items-center justify-center gap-3">
          {stran > 1 && (
            <Link href={povezava({ stran: String(stran - 1) })} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
              ← Prejšnja
            </Link>
          )}
          <span className="text-sm text-zinc-500">
            stran {stran} od {Math.ceil(naVoljo / NA_STRAN)}
          </span>
          {stran * NA_STRAN < naVoljo && (
            <Link href={povezava({ stran: String(stran + 1) })} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
              Naslednja →
            </Link>
          )}
        </div>
      )}

      <p className="mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-400">
        Podatki so zbrani z nepremicnine.net ob upoštevanju njihovega robots.txt (6 s med zahtevki,
        1× dnevno). Slike ostajajo pri viru; „Enot (možnost)&ldquo; je ocena iz opisa, ne potrjen
        podatek. Vsak oglas preverite pri viru.
      </p>
    </div>
  );
}
