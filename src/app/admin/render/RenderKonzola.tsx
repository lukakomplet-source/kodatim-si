"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Drsnik from "@/components/render/Drsnik";
import IzbiraTock from "./IzbiraTock";
import {
  RENDER_KOS_BAJTOV,
  RENDER_STATUS_OZNAKE,
  RENDER_STATUS_SLOGI,
  RENDER_VRSTA_OPISI,
  RENDER_VRSTA_OZNAKE,
  RENDER_VRSTE,
  renderDatotekaUrl,
  type RenderNaloga,
  type RenderStatus,
  type RenderVrsta,
} from "@/lib/renderOznake";

/**
 * Konzola renderja: nalaganje izvirnikov, vrsta nalog z napredkom, ogled
 * izdelkov, ročne točke in objava.
 *
 * Seznam pride kot prop brez strani, zato zavihki po statusu filtrirajo na
 * odjemalcu (isti vzorec kot Naloge v Promocijah). Osveževanje teče samo,
 * dokler je kaj v vrsti ali v delu — sicer bi stran vsake 3 s spraševala bazo
 * za nič.
 */

const CARD = "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm";
const INPUT =
  "mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal normal-case tracking-normal focus:border-accent/50 focus:outline-none";
const LABEL = "block text-xs font-medium uppercase tracking-wide text-zinc-500";
const GUMB = "rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40";
const GUMB_SVETEL =
  "rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40";

type Stanje = { besedilo: string; starostS: number } | null;
type Izvor = { naziv: string; vir: string; vir_url: string; ustanova: string; licenca: string };

const PRAZEN_IZVOR: Izvor = { naziv: "", vir: "", vir_url: "", ustanova: "", licenca: "" };

function velikost(b: number): string {
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.ceil(b / 1024)} kB`;
}

function cas(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("sl-SI", { dateStyle: "short", timeStyle: "short" }) : "—";
}

/** Nalaganje ene datoteke po kosih; vsak kos do 4 poskuse. */
async function naloziDatoteko(
  f: File,
  paket: string,
  ob: (odstotek: number) => void
): Promise<{ pot: string; ime: string; velikost: number }> {
  const skupaj = Math.max(1, Math.ceil(f.size / RENDER_KOS_BAJTOV));
  for (let kos = 0; kos < skupaj; kos++) {
    const del = f.slice(kos * RENDER_KOS_BAJTOV, Math.min(f.size, (kos + 1) * RENDER_KOS_BAJTOV));
    for (let poskus = 1; ; poskus++) {
      const q = new URLSearchParams({
        paket,
        ime: f.name,
        kos: String(kos),
        skupaj: String(skupaj),
        velikost: String(f.size),
      });
      try {
        const r = await fetch(`/api/admin/render/nalaganje?${q}`, {
          method: "POST",
          body: del,
          headers: { "Content-Type": "application/octet-stream" },
        });
        const j = (await r.json()) as { napaka?: string; pot?: string; ime?: string; velikost?: number };
        if (!r.ok) throw new Error(j.napaka ?? `HTTP ${r.status}`);
        if (kos === skupaj - 1) return { pot: j.pot!, ime: j.ime!, velikost: j.velikost! };
        break;
      } catch (e) {
        if (poskus >= 4) throw e;
        await new Promise((res) => setTimeout(res, 1_500 * poskus));
      }
    }
    ob(((kos + 1) / skupaj) * 100);
  }
  throw new Error("nalaganje se ni končalo");
}

async function dejanje(id: number, telo: Record<string, unknown>): Promise<void> {
  const r = await fetch(`/api/admin/render/naloge/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(telo),
  });
  const j = (await r.json()) as { napaka?: string };
  if (!r.ok) throw new Error(j.napaka ?? `HTTP ${r.status}`);
}

async function novaNaloga(telo: Record<string, unknown>): Promise<number> {
  const r = await fetch("/api/admin/render/naloge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(telo),
  });
  const j = (await r.json()) as { napaka?: string; id?: number };
  if (!r.ok) throw new Error(j.napaka ?? `HTTP ${r.status}`);
  return j.id!;
}

// --- nova naloga -----------------------------------------------------------------

function NovaNaloga({ ustvarjena }: { ustvarjena: () => void }) {
  const [vrsta, setVrsta] = useState<RenderVrsta>("obnova");
  const [slika, setSlika] = useState<File | null>(null);
  const [staro, setStaro] = useState<File | null>(null);
  const [danes, setDanes] = useState<File | null>(null);
  const [praske, setPraske] = useState(true);
  const [povecava, setPovecava] = useState(true);
  const [barvanje, setBarvanje] = useState(false);
  const [gibanje, setGibanje] = useState("priblizaj");
  const [sekund, setSekund] = useState(6);
  const [moc, setMoc] = useState(1);
  const [izvor, setIzvor] = useState<Izvor>(PRAZEN_IZVOR);
  const [nalagam, setNalagam] = useState<{ ime: string; odstotek: number } | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);

  const datoteke: { f: File; vloga: "slika" | "staro" | "danes" }[] =
    vrsta === "nekoc_danes"
      ? [
          ...(staro ? [{ f: staro, vloga: "staro" as const }] : []),
          ...(danes ? [{ f: danes, vloga: "danes" as const }] : []),
        ]
      : slika
        ? [{ f: slika, vloga: "slika" as const }]
        : [];
  const pripravljeno = vrsta === "nekoc_danes" ? datoteke.length === 2 : datoteke.length === 1;

  const oddaj = async () => {
    setNapaka(null);
    try {
      const paket = crypto.randomUUID();
      const vhod = [];
      for (const { f, vloga } of datoteke) {
        setNalagam({ ime: f.name, odstotek: 0 });
        const izid = await naloziDatoteko(f, paket, (odstotek) => setNalagam({ ime: f.name, odstotek }));
        vhod.push({ ...izid, vloga });
      }
      setNalagam({ ime: "vpisujem nalogo", odstotek: 100 });
      await novaNaloga({
        vrsta,
        vhod,
        naziv: izvor.naziv,
        vir: izvor.vir,
        vir_url: izvor.vir_url,
        ustanova: izvor.ustanova,
        licenca: izvor.licenca,
        parametri: vrsta === "obnova" ? { praske, povecava, barvanje } : vrsta === "paralaksa" ? { gibanje, sekund, moc } : {},
      });
      setSlika(null);
      setStaro(null);
      setDanes(null);
      ustvarjena();
    } catch (e) {
      setNapaka(e instanceof Error ? e.message : String(e));
    } finally {
      setNalagam(null);
    }
  };

  const izbiraDatoteke = (naslov: string, sprejme: string, f: File | null, nastavi: (f: File | null) => void) => (
    <label className={LABEL}>
      {naslov}
      <input
        type="file"
        accept={sprejme}
        onChange={(e) => nastavi(e.target.files?.[0] ?? null)}
        className="mt-1 block w-full text-sm font-normal normal-case tracking-normal text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-semibold"
      />
      {f && <span className="mt-1 block text-xs normal-case text-zinc-400">{velikost(f.size)}</span>}
    </label>
  );

  return (
    <div className={CARD}>
      <p className="text-lg font-semibold text-zinc-900">Nova naloga</p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {RENDER_VRSTE.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVrsta(v)}
            className={`rounded-xl border p-4 text-left transition ${
              vrsta === v ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            <span className="block text-sm font-semibold text-zinc-900">{RENDER_VRSTA_OZNAKE[v]}</span>
            <span className="mt-1 block text-xs text-zinc-500">{RENDER_VRSTA_OPISI[v]}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {vrsta === "nekoc_danes" ? (
          <>
            {izbiraDatoteke("Stara fotografija", "image/*,.tif,.tiff", staro, setStaro)}
            {izbiraDatoteke("Današnji posnetek (video ali slika)", "image/*,video/*,.tif,.tiff", danes, setDanes)}
          </>
        ) : (
          izbiraDatoteke("Fotografija", "image/*,.tif,.tiff", slika, setSlika)
        )}
      </div>

      {vrsta === "obnova" && (
        <div className="mt-4 flex flex-wrap gap-5 text-sm text-zinc-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={praske} onChange={(e) => setPraske(e.target.checked)} /> Odstrani pike in praske
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={povecava} onChange={(e) => setPovecava(e.target.checked)} /> Povečaj (Real-ESRGAN)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={barvanje} onChange={(e) => setBarvanje(e.target.checked)} /> Pobarvaj z AI
            <span className="text-xs text-zinc-400">(izdelek bo označen „Barvano z AI“)</span>
          </label>
        </div>
      )}

      {vrsta === "paralaksa" && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className={LABEL}>
            Gibanje kamere
            <select value={gibanje} onChange={(e) => setGibanje(e.target.value)} className={INPUT}>
              <option value="priblizaj">Počasno približevanje</option>
              <option value="levo-desno">Levo–desno</option>
              <option value="krog">Krog</option>
            </select>
          </label>
          <label className={LABEL}>
            Trajanje (s)
            <input type="number" min={3} max={20} value={sekund} onChange={(e) => setSekund(Number(e.target.value))} className={INPUT} />
          </label>
          <label className={LABEL}>
            Moč gibanja
            <select value={moc} onChange={(e) => setMoc(Number(e.target.value))} className={INPUT}>
              <option value={0.6}>Nežno</option>
              <option value={1}>Običajno</option>
              <option value={1.5}>Močno</option>
            </select>
          </label>
        </div>
      )}

      <details className="mt-5 rounded-xl bg-zinc-50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-700">Izvor fotografije (za objavo obvezno)</summary>
        <ObrazecIzvora izvor={izvor} nastavi={setIzvor} />
      </details>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!pripravljeno || !!nalagam} onClick={oddaj} className={GUMB}>
          Naloži in dodaj v vrsto
        </button>
        {nalagam && (
          <div className="min-w-[240px] flex-1">
            <p className="text-xs text-zinc-500">
              {nalagam.ime} — {Math.round(nalagam.odstotek)} %
            </p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full bg-accent transition-all" style={{ width: `${nalagam.odstotek}%` }} />
            </div>
          </div>
        )}
        {napaka && <p className="text-sm text-red-600">{napaka}</p>}
      </div>
    </div>
  );
}

function ObrazecIzvora({ izvor, nastavi }: { izvor: Izvor; nastavi: (i: Izvor) => void }) {
  const polje = (k: keyof Izvor, naslov: string, namig: string) => (
    <label className={LABEL}>
      {naslov}
      <input value={izvor[k]} placeholder={namig} onChange={(e) => nastavi({ ...izvor, [k]: e.target.value })} className={INPUT} />
    </label>
  );
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {polje("naziv", "Naziv", "npr. Glavni trg, okoli 1910")}
      {polje("ustanova", "Ustanova", "npr. Osrednja knjižnica Celje")}
      {polje("vir", "Vir", "npr. Kamra — Celje nekoč in danes")}
      {polje("vir_url", "Povezava do vira", "https://www.kamra.si/…")}
      <div className="sm:col-span-2">{polje("licenca", "Licenca / dovoljenje", "npr. pisno dovoljenje OKC z dne …")}</div>
    </div>
  );
}

// --- ena naloga ---------------------------------------------------------------------

function KarticaNaloge({ n, osvezi }: { n: RenderNaloga; osvezi: () => void }) {
  const [izvor, setIzvor] = useState<Izvor>({
    naziv: n.naziv ?? "",
    vir: n.vir ?? "",
    vir_url: n.vir_url ?? "",
    ustanova: n.ustanova ?? "",
    licenca: n.licenca ?? "",
  });
  const [napaka, setNapaka] = useState<string | null>(null);
  const [zaseden, setZaseden] = useState(false);
  const r = n.rezultat;
  const glavna = r?.datoteke?.find((d) => d.glavna);
  const izvorShranjen = !!(n.vir?.trim() && n.ustanova?.trim() && n.licenca?.trim());

  const izvedi = async (telo: Record<string, unknown>) => {
    setNapaka(null);
    setZaseden(true);
    try {
      await dejanje(n.id, telo);
      osvezi();
    } catch (e) {
      setNapaka(e instanceof Error ? e.message : String(e));
    } finally {
      setZaseden(false);
    }
  };

  const paralaksaIzTega = async () => {
    if (!glavna) return;
    setNapaka(null);
    try {
      await novaNaloga({
        vrsta: "paralaksa",
        vhod: [{ pot: glavna.pot, vloga: "slika" }],
        naziv: n.naziv ? `${n.naziv} — 2,5D` : null,
        vir: n.vir,
        vir_url: n.vir_url,
        ustanova: n.ustanova,
        licenca: n.licenca,
        parametri: { gibanje: "priblizaj", sekund: 6, moc: 1 },
      });
      osvezi();
    } catch (e) {
      setNapaka(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-zinc-400">#{n.id}</span>
        <span className="text-base font-semibold text-zinc-900">{n.naziv || RENDER_VRSTA_OZNAKE[n.vrsta]}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{RENDER_VRSTA_OZNAKE[n.vrsta]}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RENDER_STATUS_SLOGI[n.status]}`}>
          {RENDER_STATUS_OZNAKE[n.status]}
        </span>
        {n.objavljeno && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600">Objavljeno</span>}
        <span className="ml-auto text-xs text-zinc-400">
          vpisano {cas(n.ustvarjeno)}
          {n.konec ? ` · končano ${cas(n.konec)}` : ""}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-400">Vhod: {n.vhod.map((v) => `${v.ime ?? v.pot.split("/").pop()}${v.vloga && v.vloga !== "slika" ? ` (${v.vloga})` : ""}`).join(", ")}</p>

      {(n.status === "caka" || n.status === "tece") && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full bg-accent transition-all" style={{ width: `${n.napredek}%` }} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {n.napredek} % {n.faza ? `· ${n.faza}` : ""}
          </p>
        </div>
      )}

      {n.status === "napaka" && n.napaka && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{n.napaka}</p>
      )}

      {n.status === "rabi_tocke" && r?.staro && r?.kandidat && (
        <div className="mt-3">
          <IzbiraTock
            staro={renderDatotekaUrl(r.staro)}
            danes={renderDatotekaUrl(r.kandidat)}
            poslji={async (t) => {
              await izvedi({ dejanje: "tocke", ...t });
            }}
          />
        </div>
      )}

      {n.status === "koncano" && r && (
        <div className="mt-4 space-y-4">
          {r.primerjava && (
            <div className="mx-auto max-w-3xl">
              <Drsnik
                levo={renderDatotekaUrl(r.primerjava.levo)}
                desno={renderDatotekaUrl(r.primerjava.desno)}
                levoOznaka={r.primerjava.levoOznaka}
                desnoOznaka={r.primerjava.desnoOznaka}
                alt={n.naziv ?? RENDER_VRSTA_OZNAKE[n.vrsta]}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(r.datoteke ?? []).map((d) => (
              <a
                key={d.pot}
                href={renderDatotekaUrl(d.pot)}
                target="_blank"
                rel="noreferrer"
                className="group block overflow-hidden rounded-xl border border-zinc-200 hover:border-zinc-300"
              >
                {d.vrsta === "video" ? (
                  <video src={renderDatotekaUrl(d.pot)} muted loop playsInline autoPlay className="aspect-video w-full bg-zinc-900 object-contain" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- slika z D: prek naše poti
                  <img src={renderDatotekaUrl(d.pot)} alt={d.opis} loading="lazy" className="aspect-video w-full bg-zinc-100 object-contain" />
                )}
                <span className="block px-3 py-2 text-xs text-zinc-600">
                  {d.opis}
                  {d.ai && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">{d.ai}</span>}
                </span>
              </a>
            ))}
          </div>
          {(r.opombe ?? []).map((o) => (
            <p key={o} className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
              {o}
            </p>
          ))}
          {r.meritve && (
            <p className="text-xs text-zinc-400">
              Čas: {r.meritve.sekund ?? "?"} s · VRAM največ {r.meritve.vramNajvecMB ?? "?"} MB (pred nalogo{" "}
              {r.meritve.vramPredMB ?? "?"} MB) · rezerva obveze {r.meritve.obvezaGB?.toFixed(1).replace(".", ",") ?? "?"} GB
              {r.meritevUjemanja?.metoda ? ` · ujemanje: ${r.meritevUjemanja.metoda}, ${r.meritevUjemanja.inlierji} točk` : ""}
            </p>
          )}

          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-sm font-semibold text-zinc-700">Izvor in objava</p>
            <ObrazecIzvora izvor={izvor} nastavi={setIzvor} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={zaseden} onClick={() => izvedi({ dejanje: "izvor", ...izvor })} className={GUMB_SVETEL}>
                Shrani izvor
              </button>
              {n.objavljeno ? (
                <button type="button" disabled={zaseden} onClick={() => izvedi({ dejanje: "skrij" })} className={GUMB_SVETEL}>
                  Umakni z javne strani
                </button>
              ) : (
                <button type="button" disabled={zaseden || !izvorShranjen} onClick={() => izvedi({ dejanje: "objavi" })} className={GUMB}>
                  Objavi na kodatim.si/render
                </button>
              )}
              {!izvorShranjen && !n.objavljeno && (
                <span className="text-xs text-zinc-500">Za objavo shrani vir, ustanovo in licenco.</span>
              )}
              {n.vrsta === "obnova" && glavna && (
                <button type="button" onClick={paralaksaIzTega} className={`${GUMB_SVETEL} ml-auto`}>
                  2,5D gibanje iz obnovljene
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {["caka", "tece", "rabi_tocke"].includes(n.status) && (
          <button type="button" disabled={zaseden} onClick={() => izvedi({ dejanje: "preklici" })} className={GUMB_SVETEL}>
            Prekliči
          </button>
        )}
        {["napaka", "preklicano"].includes(n.status) && (
          <button type="button" disabled={zaseden} onClick={() => izvedi({ dejanje: "ponovi" })} className={GUMB_SVETEL}>
            Poskusi znova
          </button>
        )}
      </div>
      {napaka && <p className="mt-2 text-sm text-red-600">{napaka}</p>}
    </div>
  );
}

// --- celota ---------------------------------------------------------------------------

type Zavihek = "vse" | RenderStatus;
const ZAVIHKI: Zavihek[] = ["vse", "caka", "tece", "rabi_tocke", "koncano", "napaka"];

export default function RenderKonzola({ zacetne, zacetnoStanje }: { zacetne: RenderNaloga[]; zacetnoStanje: Stanje }) {
  const [naloge, setNaloge] = useState(zacetne);
  const [delavec, setDelavec] = useState<Stanje>(zacetnoStanje);
  const [zavihek, setZavihek] = useState<Zavihek>("vse");

  const osvezi = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/render/naloge", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { naloge: RenderNaloga[]; delavec: Stanje };
      setNaloge(j.naloge);
      setDelavec(j.delavec);
    } catch {
      // Naslednji krog.
    }
  }, []);

  const aktivne = naloge.some((n) => n.status === "caka" || n.status === "tece");
  useEffect(() => {
    if (!aktivne) return;
    const t = setInterval(osvezi, 3_000);
    return () => clearInterval(t);
  }, [aktivne, osvezi]);

  const stevci = useMemo(() => {
    const s: Record<string, number> = { vse: naloge.length };
    for (const n of naloge) s[n.status] = (s[n.status] ?? 0) + 1;
    return s;
  }, [naloge]);
  const vidne = zavihek === "vse" ? naloge : naloge.filter((n) => n.status === zavihek);

  // Utrip, starejši od 2 min, pomeni, da delavec ne teče (piše ga vsakih 5 s).
  const delavecZiv = delavec && delavec.starostS < 120;

  return (
    <div className="mt-6 space-y-6">
      <p
        className={`rounded-xl px-4 py-2 text-sm ring-1 ${
          delavecZiv ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"
        }`}
      >
        {delavecZiv
          ? `Delavec teče: ${delavec.besedilo} (pred ${delavec.starostS} s)`
          : `Delavec ne teče${delavec ? ` — zadnji utrip pred ${Math.round(delavec.starostS / 60)} min („${delavec.besedilo}“)` : ""}. Naloge čakajo, dokler ga nadzornik ne zažene.`}
      </p>

      <NovaNaloga ustvarjena={osvezi} />

      <div className="flex flex-wrap gap-2">
        {ZAVIHKI.map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZavihek(z)}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium ${
              zavihek === z ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {z === "vse" ? "Vse" : RENDER_STATUS_OZNAKE[z]}
            <span className={`rounded-full px-1.5 text-xs ${zavihek === z ? "bg-white/20" : "bg-zinc-100"}`}>{stevci[z] ?? 0}</span>
          </button>
        ))}
      </div>

      {vidne.length === 0 ? (
        <p className="text-sm text-zinc-500">Tu še ni nalog.</p>
      ) : (
        vidne.map((n) => <KarticaNaloge key={`${n.id}-${n.status}`} n={n} osvezi={osvezi} />)
      )}
    </div>
  );
}
