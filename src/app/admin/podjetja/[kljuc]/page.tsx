import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { davcnaIz, domenaIz, hrefPodjetja } from "@/lib/podjetja/kljuc";
import { danesKontaktiran, preberiPodjetja, zaPosel, type Podjetje } from "@/lib/podjetja/podatki";
import { izRegistraPoDavcni } from "@/lib/podjetja/register";
import { kontekstPodjetij } from "../kontekst";
import { PosliPodjetja } from "./PosliPodjetja";
import { PriloznostiPodjetja, type PriloznostHarvey } from "./PriloznostiPodjetja";
import type { PoselHarvey } from "./posli-actions";
import { Manjka, Opozorilo, STANJE_KODATIM, STANJE_KOMPLETKO, STATUS_LEADA, VRSTA_DOGODKA, ZnackePoslov, kdaj } from "../skupno";

/**
 * Kartica podjetja (faza 6): vse, kar se je s podjetjem zgodilo v obeh poslih, na enem mestu. Naslov je
 * /admin/podjetja/<davčna>; brez davčne po domeni, sicer po začasnem ključu. Drug ključ (domena, e-naslov,
 * »SI 12345678«) preusmeri na pravega. Podatki se urejajo v izvornih sistemih (povezave na kartici).
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Kartica podjetja" };

function najdi(poKljucu: Map<string, Podjetje>, k: string): Podjetje | undefined {
  const s = k.trim().toLowerCase();
  return poKljucu.get(k) ?? poKljucu.get(s) ?? poKljucu.get(davcnaIz(s)) ?? poKljucu.get(domenaIz(s));
}

const POSEL_BARVA = { kodatim: "bg-sky-500", kompletko: "bg-emerald-500" } as const;

export default async function KarticaPodjetjaPage({
  params,
  searchParams,
}: {
  params: Promise<{ kljuc: string }>;
  searchParams: Promise<{ posel?: string }>;
}) {
  const [{ kljuc: surovi }, sp] = await Promise.all([params, searchParams]);
  let kljuc = surovi;
  try {
    kljuc = decodeURIComponent(surovi);
  } catch {
    // Already decoded (a key never holds »%«).
  }
  kljuc = kljuc.slice(0, 200);
  const k = await kontekstPodjetij(sp.posel);
  const indeks = await preberiPodjetja();
  const najdeno = najdi(indeks.poKljucu, kljuc);
  if (najdeno && najdeno.kljuc !== kljuc) redirect(hrefPodjetja(najdeno.kljuc));

  // The card shows everything the user may see, whatever the switch says (Ctrl+K and links ignore it too).
  const p = najdeno ? zaPosel(najdeno, k.smeKodatim, k.smeKompletko) : null;
  const davcna = p?.davcna || davcnaIz(kljuc);
  const register = davcna ? await izRegistraPoDavcni(davcna) : null;
  if (!p && !register) notFound();

  if (!p) {
    return (
      <div className="max-w-3xl">
        <Link href="/admin/podjetja" className="text-sm text-zinc-500 hover:text-zinc-900">
          Vsa podjetja
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-900">{register?.naziv}</h1>
        <p className="mt-2 text-base text-zinc-500">To podjetje je v registru, a ga v tvojem poslu še nimamo.</p>
        {register ? <Register r={register} /> : null}
        <p className="mt-6">
          <Link
            href={`/admin/podjetja/dodaj?q=${encodeURIComponent(davcna)}`}
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Dodaj podjetje
          </Link>
        </p>
      </div>
    );
  }

  const danes = danesKontaktiran(p);
  // Posli z vrednostjo (Pregled v3): samo administrator in samo podjetja Kompletka z domeno (Harvey jih vodi po domeni).
  const domenaPosla = k.jeAdmin && p.kompletko?.domena && /^[a-z0-9.-]{3,100}$/.test(p.kompletko.domena) ? p.kompletko.domena : "";
  const [posli, prodaja] = domenaPosla ? await Promise.all([preberiPosle(domenaPosla), preberiPriloznosti(domenaPosla)]) : [null, null];
  const danesLj = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" });
  return (
    <div className="max-w-5xl">
      <Link href="/admin/podjetja" className="text-sm text-zinc-500 hover:text-zinc-900">
        Vsa podjetja
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-zinc-900">{p.ime || register?.naziv || p.kljuc}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
        <span>{p.davcna ? `Davčna ${p.davcna}` : "Brez davčne"}</span>
        {p.maticna ? <span>Matična {p.maticna}</span> : null}
        {p.kraj ? <span>{p.kraj}</span> : null}
        <ZnackePoslov p={p} />
      </div>

      <div className="mt-4 space-y-3">
        {p.odjava ? (
          <Opozorilo>Odjava: temu podjetju ne pišemo več, ne za KodaTim ne za Kompletko.</Opozorilo>
        ) : null}
        {danes ? <Opozorilo>Danes je že bilo kontaktirano (mail ali klic). Na dan samo en stik.</Opozorilo> : null}
        <Manjka manjka={indeks.manjka} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <h2 className="text-sm font-semibold text-zinc-900">Kontakt</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {p.domene.map((d) => (
              <li key={d}>
                <a href={`https://${d}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-zinc-700 underline-offset-2 hover:underline">
                  {d} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            ))}
            {p.emaili.map((e) => (
              <li key={e} className="flex items-center gap-1.5 text-zinc-700">
                <Mail className="h-3.5 w-3.5 text-zinc-400" aria-hidden /> {e}
              </li>
            ))}
            {p.telefoni.map((t) => (
              <li key={t}>
                <a href={`tel:${t.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5 text-zinc-700 hover:underline">
                  <Phone className="h-3.5 w-3.5 text-zinc-400" aria-hidden /> {t}
                </a>
              </li>
            ))}
            {!p.domene.length && !p.emaili.length && !p.telefoni.length ? <li className="text-zinc-400">ni podatka</li> : null}
          </ul>
        </section>

        {p.kodatim ? (
          <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
            <h2 className="text-sm font-semibold text-zinc-900">KodaTim</h2>
            <dl className="mt-2 space-y-1 text-sm">
              {p.kodatim.harvey ? <Vrstica ime="Harvey">{STANJE_KODATIM[p.kodatim.harvey] ?? p.kodatim.harvey}</Vrstica> : null}
              {p.kodatim.leadStatus ? <Vrstica ime="Stranke">{STATUS_LEADA[p.kodatim.leadStatus] ?? p.kodatim.leadStatus}</Vrstica> : null}
            </dl>
            {p.kodatim.faze.length ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {p.kodatim.faze.map((f) => (
                  <li key={f.targetId}>
                    <Link href={`/admin/promocije/${f.kampanjaId}/targets/${f.targetId}`} className="text-zinc-700 underline-offset-2 hover:underline">
                      {f.kampanja}: {f.oznaka}
                    </Link>
                    {f.naslednjiKlic ? <span className="text-zinc-500">, klic {kdaj(f.naslednjiKlic, false)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 flex flex-wrap gap-2">
              {p.kodatim.leadIds.map((id, i) => (
                <Link key={id} href={`/admin/lead-intelligence/leads/${id}`} className={GUMB}>
                  Uredi v Strankah{p.kodatim!.leadIds.length > 1 ? ` (${i + 1})` : ""}
                </Link>
              ))}
            </p>
          </section>
        ) : null}

        {p.kompletko ? (
          <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
            <h2 className="text-sm font-semibold text-zinc-900">Kompletko</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <Vrstica ime="Stanje">{STANJE_KOMPLETKO[p.kompletko.stanje] ?? p.kompletko.stanje}</Vrstica>
              {p.kompletko.oseba ? <Vrstica ime="Oseba">{p.kompletko.oseba}</Vrstica> : null}
              {p.kompletko.dogovor ? <Vrstica ime="Dogovorjen klic">{kdaj(p.kompletko.dogovor, false)}</Vrstica> : null}
              {p.kompletko.sestanek ? (
                <Vrstica ime="Sestanek">
                  {p.kompletko.sestanek.kdaj}
                  {p.kompletko.sestanek.kraj ? `, ${p.kompletko.sestanek.kraj}` : ""}
                </Vrstica>
              ) : null}
              {p.kompletko.rocno ? <Vrstica ime="Vir">vpisan ročno</Vrstica> : null}
            </dl>
            <p className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin/danes/klici" className={GUMB}>
                Klici
              </Link>
              <Link href="/admin/prodajna-ekipa/kompletko" className={GUMB}>
                Panik gumb
              </Link>
            </p>
          </section>
        ) : null}

        {register ? (
          <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 lg:col-span-3">
            <h2 className="text-sm font-semibold text-zinc-900">Register</h2>
            <Register r={register} />
          </section>
        ) : null}
      </div>

      {domenaPosla && prodaja ? (
        <PriloznostiPodjetja domena={domenaPosla} razvrstitev={prodaja.razvrstitev} priloznosti={prodaja.priloznosti} danes={danesLj} />
      ) : null}

      {domenaPosla ? (
        posli ? (
          <PosliPodjetja
            kljuc={p.kljuc}
            domena={domenaPosla}
            posli={posli}
            danes={danesLj}
          />
        ) : (
          <p className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Poslov ni mogoče prebrati: Harvey Kompletko (5556) ne odgovarja.
          </p>
        )
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">Časovnica</h2>
        <p className="mt-0.5 text-sm text-zinc-500">Od prvega stika do danes, najstarejše zgoraj.</p>
        {p.dogodki.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Še brez stika.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l border-zinc-200 pl-5">
            {/* Podatki so od najnovejšega (seznam podjetij); Luka 6. 11.: »vse aktivnosti kronološko«. */}
            {[...p.dogodki].reverse().map((d, i) => (
              <li key={`${d.cas}-${i}`} className="relative">
                <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ${POSEL_BARVA[d.posel]}`} aria-hidden />
                <p className="text-xs text-zinc-500">
                  {kdaj(d.cas)} · {d.posel === "kodatim" ? "KodaTim" : "Kompletko"} · {VRSTA_DOGODKA[d.vrsta] ?? d.vrsta}
                  {d.kdo ? ` · ${d.kdo}` : ""}
                </p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-zinc-800">{d.opis}</p>
                {d.href ? (
                  <Link href={d.href} className="mt-1 inline-block text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-900">
                    {d.vrsta === "ogled" ? "Odpri predlog" : d.vrsta === "odgovor" ? "Poglej pogovor" : d.vrsta === "mail" ? "Poglej mail" : "Odpri"}
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-xs text-zinc-500">
          Kompletko: vsak mail (prvi, follow-up, video, zadnji), klic in odgovor, kot jih šteje Pregled; mail brez
          zapisanega časa tu ni prikazan. Ogled predloga (KodaTim) je en zapis s številom ogledov.
        </p>
      </section>
    </div>
  );
}

const GUMB =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-300 hover:ring-zinc-500";

/** Posli podjetja z zgodovino (popravki, preklici) iz Harveyja; null, ko Harvey ne odgovarja. */
async function preberiPosle(domena: string): Promise<PoselHarvey[] | null> {
  try {
    const r = await fetch(`${HARVEY_KOMPLETKO}/api/posli?domena=${encodeURIComponent(domena)}&vsi=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!r.ok) return null;
    return ((await r.json()) as { posli: PoselHarvey[] }).posli ?? [];
  } catch {
    return null;
  }
}

/** Prodaja podjetja (Pregled v4): razvrstitev odziva in priložnosti; null, ko Harvey ne odgovarja ali je še starejši. */
async function preberiPriloznosti(domena: string): Promise<{ priloznosti: PriloznostHarvey[]; razvrstitev: string } | null> {
  try {
    const r = await fetch(`${HARVEY_KOMPLETKO}/api/priloznosti?domena=${encodeURIComponent(domena)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { priloznosti?: PriloznostHarvey[]; razvrstitev?: string };
    return { priloznosti: j.priloznosti ?? [], razvrstitev: j.razvrstitev ?? "" };
  } catch {
    return null;
  }
}

const HARVEY_KOMPLETKO = process.env.HARVEY_KOMPLETKO_URL ?? "http://127.0.0.1:5556";

function Vrstica({ ime, children }: { ime: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-zinc-500">{ime}</dt>
      <dd className="text-zinc-800">{children}</dd>
    </div>
  );
}

function Register({ r }: { r: NonNullable<Awaited<ReturnType<typeof izRegistraPoDavcni>>> }) {
  return (
    <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
      <Vrstica ime="Naziv">{r.naziv}</Vrstica>
      <Vrstica ime="Naslov">{[r.naslov, [r.posta, r.kraj].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</Vrstica>
      {r.skd_naziv ? <Vrstica ime="Dejavnost">{[r.skd, r.skd_naziv].filter(Boolean).join(" ")}</Vrstica> : null}
      {r.pravna_oblika ? <Vrstica ime="Pravna oblika">{r.pravna_oblika}</Vrstica> : null}
      {r.velikost ? <Vrstica ime="Velikost">{r.velikost}</Vrstica> : null}
      {r.ni_vec_od ? <Vrstica ime="V registru">ni več od {kdaj(r.ni_vec_od, false)}</Vrstica> : null}
    </dl>
  );
}
