import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ExternalLink, Home, Landmark, TrendingDown } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { razlozi, type NepFiltri } from "@/lib/nepremicnine/poizvedba";
import { IskalnaVrstica } from "./IskalnaVrstica";

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

  // AI vrstica: ?q=... se najprej prevede v filtre; razklad se pokaže.
  const q = st("q").trim();
  const razklad = q ? razlozi(q) : null;
  const ai: NepFiltri = razklad?.filtri ?? {};

  const posel = st("posel") || ai.posel || "prodaja";
  const tip = st("tip") || ai.tipi?.[0] || "";
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
  const padecCene = st("padecCene") === "1" || ai.padecCene === true;
  const razvrsti = st("razvrsti") || ai.razvrsti || "novi";
  const stran = Math.max(1, num("stran") ?? 1);

  const zdaj = odcitekUre();
  const db = createAvtonetClient();
  let qy = db.from("nep_oglasi").select("*", { count: "exact" }).eq("status", "aktiven").eq("posel", posel);
  if (tip) qy = qy.eq("tip", tip);
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
  // Padec cene: trenutna pod prvo videno.
  if (padecCene) qy = qy.not("cena_prvotna_eur", "is", null).filter("cena_eur", "lt", "cena_prvotna_eur" as never);

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
    case "novi":
    default:
      qy = qy.order("first_seen", { ascending: false });
  }
  qy = qy.order("id", { ascending: true }).range((stran - 1) * NA_STRAN, stran * NA_STRAN - 1);

  const { data, count, error } = await qy;
  const vrstice = (data ?? []) as unknown as Vrstica[];
  const skupaj = count ?? 0;

  const { count: vsehAktivnih } = await db
    .from("nep_oglasi")
    .select("id", { count: "exact", head: true })
    .eq("status", "aktiven");

  const trenutni = {
    q,
    posel,
    tip,
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
    padecCene: padecCene ? "1" : "",
    razvrsti,
  };
  const povezava = (spremembe: Record<string, string>) => {
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...trenutni, ...spremembe })) if (v) query[k] = v;
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

      <IskalnaVrstica zacetno={q} />

      {razklad && razklad.razumljeno.length > 0 && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Razumel sem: {razklad.razumljeno.join(" · ")}
        </p>
      )}
      {razklad?.nerazumljeno && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
          {razklad.nerazumljeno}
        </p>
      )}

      {/* Filtri — GET obrazec, kot povsod v tej kodni bazi. */}
      <form className="mt-5 flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Posel
          <select name="posel" defaultValue={posel} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900">
            <option value="prodaja">Prodaja</option>
            <option value="oddaja">Oddaja</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Tip
          <select name="tip" defaultValue={tip} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900">
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
        {[
          { ime: "vecEnot", oznaka: "več enot", vklop: vecEnot },
          { ime: "zaObnovo", oznaka: "za obnovo", vklop: zaObnovo },
          { ime: "zaInvesticijo", oznaka: "investicijsko", vklop: zaInvesticijo },
          { ime: "padecCene", oznaka: "znižana cena", vklop: padecCene },
        ].map((c) => (
          <label key={c.ime} className="flex items-center gap-1.5 self-end rounded-lg border border-zinc-200 px-2.5 py-2 text-xs">
            <input type="checkbox" name={c.ime} value="1" defaultChecked={c.vklop} className="h-3.5 w-3.5" />
            {c.oznaka}
          </label>
        ))}
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Razvrsti
          <select name="razvrsti" defaultValue={razvrsti} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900">
            <option value="novi">najnovejši</option>
            <option value="cena_nizja">najcenejši</option>
            <option value="cena_visja">najdražji</option>
            <option value="m2_nizja">najnižja cena/m²</option>
            <option value="zemljisce">največ zemljišča</option>
            <option value="enote">največ enot (investitor)</option>
          </select>
        </label>
        <button type="submit" className="self-end rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
          Uporabi
        </button>
        <Link href="/nepremicnine" className="self-end rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
          Počisti
        </Link>
      </form>

      <p className="mt-4 text-sm text-zinc-500">
        {skupaj.toLocaleString("sl-SI")} zadetkov{error && <span className="text-red-600"> · napaka: {error.message}</span>}
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {vrstice.map((v) => {
          const znizana = v.cena_prvotna_eur !== null && v.cena_eur !== null && v.cena_eur < v.cena_prvotna_eur;
          const dni = dniNaTrgu(v.first_seen, zdaj);
          return (
            <article key={v.id} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    {v.tip === "hisa" ? <Home className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                    {TIPI_OZNAKE[v.tip ?? ""] ?? v.tip} {v.podtip ? `· ${v.podtip}` : ""}
                  </p>
                  <h2 className="mt-1 truncate text-[15px] font-semibold text-zinc-900" title={v.naslov ?? ""}>
                    {v.kraj ?? v.naslov ?? "—"}
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
                  href={{ pathname: "/nepremicnine/kalkulator", query: { oglas: v.id } }}
                  title="Odpre kalkulator s ceno in enotami tega oglasa ter oceno najemnine iz naših najemnih oglasov"
                  className="inline-flex items-center justify-center rounded-xl border-2 border-accent/40 px-3 py-3 text-sm font-bold text-accent transition hover:bg-accent/5"
                >
                  ANALIZIRAJ
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {skupaj > NA_STRAN && (
        <div className="mt-6 flex items-center justify-center gap-3">
          {stran > 1 && (
            <Link href={povezava({ stran: String(stran - 1) })} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
              ← Prejšnja
            </Link>
          )}
          <span className="text-sm text-zinc-500">
            stran {stran} od {Math.ceil(skupaj / NA_STRAN)}
          </span>
          {stran * NA_STRAN < skupaj && (
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
