import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import Link from "next/link";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiSistem } from "@/lib/avtonet/sistem";
import { ResearchPanel } from "../ResearchPanel";
import { WorkerHealth } from "../Freshness";
import { PregledClient } from "./PregledClient";

/**
 * The development centre — admin only.
 *
 * Everything technical that used to sit on the product's front page lives here:
 * the research trigger, the worker's health, and the live log of what the
 * scraper is doing right now. A person looking for a car has no use for page
 * counters; a person debugging a sweep has no use for anything else.
 *
 * `requireAdmin` throws for everyone else and the route redirects to the login,
 * so this is a real gate and not a hidden link.
 */

export const dynamic = "force-dynamic";

export default async function PregledPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/prijava?redirect=/avtonet/pregled");
  }

  const db = createAvtonetClient();
  const sistem = await preberiSistem();
  const [zdravjeRes, aktivnaRes, pdfRes, pdfStanjeRes, vidRes] = await Promise.all([
    db.from("avtonet_zdravje").select("*").eq("id", "worker").maybeSingle(),
    db
      .from("avtonet_raziskave")
      .select("id, status, updated_at")
      .in("status", ["zahtevano", "tece"])
      .limit(1)
      .maybeSingle(),
    db.from("avtonet_pdf_povzetek").select("datotek, bajtov, zadnji").maybeSingle(),
    db.from("avtonet_statistika").select("podatki, izracunano").eq("kljuc", "pdf_arhiv").maybeSingle(),
    db.from("avtonet_statistika").select("podatki, izracunano").eq("kljuc", "vid").maybeSingle(),
  ]);

  const vid =
    ((vidRes.data as {
      podatki?: {
        model?: string;
        obdelanih?: number;
        cakajocih?: number;
        v24h?: number;
        stanje?: string;
        odZagona?: number;
      };
    } | null)?.podatki) ?? null;
  const vidOb = (vidRes.data as { izracunano?: string } | null)?.izracunano ?? null;
  const vidObdelanih = Number(vid?.obdelanih ?? 0);
  const vidCaka = Number(vid?.cakajocih ?? 0);
  const vidSkupaj = vidObdelanih + vidCaka;
  const vidDelez = vidSkupaj > 0 ? Math.round((vidObdelanih / vidSkupaj) * 100) : 0;
  const vidNaDan = Number(vid?.v24h ?? 0);
  const vidDni = vidNaDan > 0 && vidCaka > 0 ? vidCaka / vidNaDan : null;
  const vidEta =
    vidDni === null
      ? null
      : vidDni < 1
        ? `${Math.max(1, Math.round(vidDni * 24))} h`
        : `${Math.round(vidDni)} dni`;

  const zdravje = (zdravjeRes.data ?? null) as {
    zadnji_uspeh: string | null;
    zadnja_napaka: string | null;
    stanje: string | null;
    zaporednih_napak: number | null;
    strani_zadnjic: number | null;
    najdenih_zadnjic: number | null;
    novih_zadnjic: number | null;
  } | null;

  const aktivna = aktivnaRes.data as { status: string; updated_at: string | null } | null;
  const tece = aktivna?.status === "tece";

  const pdfArhiv = (pdfRes.data ?? null) as { datotek: number; bajtov: number; zadnji: string | null } | null;
  const pdfStanje =
    ((pdfStanjeRes.data as { podatki?: { stanje?: string; kapicaGb?: number; cakajocih?: number; v24h?: number } } | null)
      ?.podatki) ?? null;
  const pdfGb = Number(pdfArhiv?.bajtov ?? 0) / 1e9;
  const pdfKapica = Number(pdfStanje?.kapicaGb ?? 150);
  const pdfDelez = Math.min(100, Math.round((pdfGb / pdfKapica) * 100));
  // Koliko oglasov še gre na disk: preostanek do kapice, deljen s povprečnim
  // PDF-jem. Bolj uporabno od "še X GB" — pove, ali vrsta sploh gre skozi.
  const pdfCaka = Number(pdfStanje?.cakajocih ?? 0);
  // ETA iz dejanskega izkupicka zadnjih 24 ur. Tempo je enakomeren (~4.000/dan),
  // zato je preprosto deljenje dovolj; ce podatka o tempu ni, ocene ne kazemo,
  // ker je izmisljena ocena slabsa od nobene.
  const pdfNaDan = Number(pdfStanje?.v24h ?? 0);
  const pdfDni = pdfNaDan > 0 && pdfCaka > 0 ? pdfCaka / pdfNaDan : null;
  // Izhodisce je cas, ko je arhivar zadnjic objavil stanje (nekaj minut nazaj),
  // ne trenutek izrisa: podatek iz baze je cist, Date.now() pa bi bil neciste
  // branje ure sredi izrisa in bi vsak ponovni izris dal drugacen rezultat.
  const pdfOb = (pdfStanjeRes.data as { izracunano?: string } | null)?.izracunano ?? null;
  const pdfKonec =
    pdfDni === null || pdfOb === null
      ? null
      : new Date(new Date(pdfOb).getTime() + pdfDni * 86_400_000).toLocaleDateString("sl-SI", {
          day: "numeric",
          month: "long",
        });
  const pdfPovprecje = pdfArhiv?.datotek ? Number(pdfArhiv.bajtov) / Number(pdfArhiv.datotek) : 1.4e6;
  const pdfSeGre = Math.max(0, Math.floor(((pdfKapica * 0.97 - pdfGb) * 1e9) / pdfPovprecje));

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Research console</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-zinc-500">
            Tehnični del SBN Auto: zagon pregleda trga, stanje zbiralnika in dnevnik tega, kar scraper
            dejansko počne. Uporabnik tega ne vidi.
          </p>
        </div>
        <WorkerHealth
          zadnjiUspeh={zdravje?.zadnji_uspeh ?? null}
          napaka={zdravje?.zadnja_napaka ?? null}
          stanje={zdravje?.stanje ?? "ok"}
          zaporednihNapak={zdravje?.zaporednih_napak ?? 0}
          strani={zdravje?.strani_zadnjic ?? null}
          najdenih={zdravje?.najdenih_zadnjic ?? null}
          novih={zdravje?.novih_zadnjic ?? null}
          pregledOsvezen={tece ? (aktivna?.updated_at ?? null) : null}
        />
      </header>

      <div className="mt-6 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              PDF arhiv oglasov{" "}
              <span className="font-normal text-zinc-500">(stran + vse slike, verzija ob vsaki spremembi cene)</span>
            </p>
            <p className="mt-0.5 text-sm text-zinc-600">
              {Number(pdfArhiv?.datotek ?? 0).toLocaleString("sl-SI")} PDF-jev ·{" "}
              <strong>{pdfGb.toFixed(1)} GB</strong> / {pdfKapica} GB
              {pdfArhiv?.zadnji
                ? ` · zadnji zajem ${new Date(pdfArhiv.zadnji).toLocaleString("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}`
                : ""}
              {pdfStanje?.stanje && pdfStanje.stanje !== "tece" ? ` · stanje: ${pdfStanje.stanje}` : ""}
            </p>
            {pdfDni !== null && (
              <p className="mt-0.5 text-sm text-zinc-600">
                tempo <strong>{pdfNaDan.toLocaleString("sl-SI")}</strong> PDF/dan · vrsta prazna
                predvidoma{" "}
                <strong>
                  {pdfDni < 1 ? "danes" : `${Math.round(pdfDni)} dni (${pdfKonec})`}
                </strong>
              </p>
            )}
            {pdfCaka > 0 ? (
              <p className="mt-0.5 text-sm text-zinc-500">
                čaka še {pdfCaka.toLocaleString("sl-SI")} oglasov (~
                {((pdfCaka * pdfPovprecje) / 1e9).toFixed(0)} GB) · do kapice je prostora še za{" "}
                <strong className={pdfSeGre < pdfCaka ? "text-amber-600" : "text-zinc-700"}>
                  {pdfSeGre.toLocaleString("sl-SI")}
                </strong>{" "}
                {pdfSeGre < pdfCaka ? "— za ostale bo potreben večji disk" : ""}
              </p>
            ) : null}
          </div>
          <div className="w-full max-w-xs">
            <div className="h-2 rounded-full bg-zinc-100">
              <div
                className={`h-2 rounded-full ${pdfDelez > 90 ? "bg-red-500" : pdfDelez > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.max(1, pdfDelez)}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-zinc-500">{pdfDelez} % kapice</p>
          </div>
        </div>
      </div>

      {/* Lokalni vizualni model: kaj razbere s slik oglasa. Klik odpre primere,
          da se da rocno preveriti, ali mu je sploh mogoce verjeti. */}
      <Link
        href="/avtonet/vid"
        className="mt-4 block rounded-xl bg-white p-4 ring-1 ring-zinc-200 transition hover:ring-zinc-300"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              Vizualni pregled slik{" "}
              <span className="font-normal text-zinc-500">
                (lokalni AI na tej grafični kartici — oprema in facelift s slik)
              </span>
            </p>
            <p className="mt-0.5 text-sm text-zinc-600">
              <strong>{vidObdelanih.toLocaleString("sl-SI")}</strong> pregledanih ·{" "}
              {vidCaka.toLocaleString("sl-SI")} čaka
              {vidNaDan > 0 ? ` · tempo ${vidNaDan.toLocaleString("sl-SI")}/dan` : ""}
              {vidEta ? ` · vrsta prazna čez ${vidEta}` : ""}
              {vid?.model ? ` · ${vid.model}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {vid?.stanje === "tece"
                ? "teče"
                : vid?.stanje === "vse_obdelano"
                  ? "vse obdelano, čaka nove oglase"
                  : vid?.stanje
                    ? `stanje: ${vid.stanje}`
                    : "še ni tekel"}
              {vidOb
                ? ` · osveženo ${new Date(vidOb).toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })}`
                : ""}{" "}
              · klikni za primere, kaj je prebral
            </p>
          </div>
          <div className="w-full max-w-xs">
            <div className="h-2 rounded-full bg-zinc-100">
              <div
                className="h-2 rounded-full bg-indigo-500"
                style={{ width: `${Math.max(1, vidDelez)}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-zinc-500">{vidDelez} % novih oglasov</p>
          </div>
        </div>

        {/* Obremenitev stroja: model si kartico deli z zbiralnikom in arhivarjem,
            zato je koristno videti, ali je se kaj prostora. */}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-zinc-100 pt-2 text-xs text-zinc-600">
          {sistem.gpuIme && (
            <span>
              <span className="text-zinc-400">GPU</span> {sistem.gpuIme}
              {sistem.gpuOdstotek !== null ? ` · ${sistem.gpuOdstotek} %` : ""}
            </span>
          )}
          {sistem.vramSkupajGb !== null && (
            <span>
              <span className="text-zinc-400">VRAM</span> {sistem.vramUporabljenoGb?.toFixed(1)} /{" "}
              {sistem.vramSkupajGb.toFixed(0)} GB
            </span>
          )}
          {sistem.ramSkupajGb !== null && (
            <span>
              <span className="text-zinc-400">RAM</span> {sistem.ramUporabljenoGb?.toFixed(1)} /{" "}
              {sistem.ramSkupajGb.toFixed(0)} GB
            </span>
          )}
          {sistem.cpuOdstotek !== null && (
            <span>
              <span className="text-zinc-400">CPU</span> {sistem.cpuOdstotek} %
            </span>
          )}
        </div>
      </Link>

      <ResearchPanel />

      <div className="mt-8">
        <PregledClient tece={tece} />
      </div>
    </div>
  );
}
