import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * Kaj je lokalni model prebral s slik — da se da preveriti, ali mu gre verjeti.
 *
 * To ni okrasna stran. Model piše v svojo tabelo in nič od tega ne gre v
 * cenilnik, dokler ne vemo, kako pogosto se moti. Zato so tu poleg ugotovitev
 * vedno tudi povezava na sam oglas in oprema, ki jo je oglas NAPISAL — dve
 * stvari drug ob drugem, iz katerih se v nekaj minutah vidi, ali model
 * prepoznava ali ugiba.
 */

export const dynamic = "force-dynamic";

type Znacilka = { znacilka?: string; zaupanje?: number; kje?: string };

type Vrstica = {
  avtonet_id: string;
  status: string;
  model: string | null;
  slik: number | null;
  ms: number | null;
  oprema: Znacilka[] | null;
  facelift: boolean | null;
  facelift_zaupanje: number | null;
  obrazlozitev: string | null;
  napaka: string | null;
  ustvarjen: string;
};

type Oglas = {
  avtonet_id: string;
  naziv: string | null;
  letnik: number | null;
  cena_eur: number | null;
  url: string | null;
  oprema: unknown;
};

function barvaZaupanja(z: number | undefined): string {
  if (z === undefined) return "bg-zinc-100 text-zinc-700";
  if (z >= 0.9) return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
  if (z >= 0.7) return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
  return "bg-zinc-100 text-zinc-600";
}

export default async function VidPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/prijava?redirect=/avtonet/vid");
  }

  const db = createAvtonetClient();
  const [vidRes, statRes] = await Promise.all([
    db
      .from("avtonet_vid")
      .select("avtonet_id, status, model, slik, ms, oprema, facelift, facelift_zaupanje, obrazlozitev, napaka, ustvarjen")
      .in("status", ["koncano", "napaka"])
      .order("ustvarjen", { ascending: false })
      .limit(40),
    db.from("avtonet_statistika").select("podatki").eq("kljuc", "vid").maybeSingle(),
  ]);

  const vrstice = (vidRes.data ?? []) as Vrstica[];
  const stat = ((statRes.data as { podatki?: Record<string, unknown> } | null)?.podatki) ?? {};

  // Oglasi zraven: brez naziva in cene je ugotovitev modela nepreverljiva.
  const idji = vrstice.map((v) => v.avtonet_id);
  const oglasi = new Map<string, Oglas>();
  if (idji.length > 0) {
    const { data } = await db
      .from("avtonet_oglasi")
      .select("avtonet_id, naziv, letnik, cena_eur, url, oprema")
      .in("avtonet_id", idji);
    for (const o of (data ?? []) as Oglas[]) oglasi.set(o.avtonet_id, o);
  }

  const povprecniMs =
    vrstice.filter((v) => v.ms).reduce((v, r) => v + (r.ms ?? 0), 0) /
    Math.max(1, vrstice.filter((v) => v.ms).length);

  return (
    <div>
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Vizualni pregled slik</h1>
          <Link href="/avtonet/pregled" className="text-sm text-zinc-500 hover:text-zinc-900">
            ← Research console
          </Link>
        </div>
        <p className="mt-2 max-w-3xl text-[15px] text-zinc-500">
          Lokalni model ({String(stat.model ?? "—")}) na tej grafični kartici pogleda slike vsakega novega
          oglasa in pove, kakšno opremo vidi in ali gre za facelift. Ugotovitve so <strong>mnenje s stopnjo
          zaupanja</strong>, ne podatek z oglasnika — zato živijo ločeno in v cenilnik gredo šele, ko na teh
          primerih potrdimo, da so zanesljive.
        </p>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {[
          ["Pregledanih", Number(stat.obdelanih ?? 0).toLocaleString("sl-SI")],
          ["Čaka", Number(stat.cakajocih ?? 0).toLocaleString("sl-SI")],
          ["Zadnjih 24 h", Number(stat.v24h ?? 0).toLocaleString("sl-SI")],
          ["Povprečen čas", povprecniMs ? `${(povprecniMs / 1000).toFixed(1)} s` : "—"],
        ].map(([oznaka, vrednost]) => (
          <div key={oznaka} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
            <p className="text-xs text-zinc-500">{oznaka}</p>
            <p className="mt-0.5 text-xl font-semibold text-zinc-900">{vrednost}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold text-zinc-900">Zadnji pregledi</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Levo je, kar je videl model, desno pa oglas sam — odpri ga in primerjaj. Zelena pomeni, da je model
        prepričan (0,9+), oranžna, da ugiba.
      </p>

      <div className="mt-3 space-y-3">
        {vrstice.length === 0 && (
          <p className="rounded-xl bg-white p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">
            Model še ni pregledal nobenega oglasa.
          </p>
        )}

        {vrstice.map((v) => {
          const o = oglasi.get(v.avtonet_id);
          const oglasnaOprema = Array.isArray(o?.oprema) ? (o?.oprema as string[]) : [];
          return (
            <div key={v.avtonet_id} className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">
                    {o?.naziv ?? v.avtonet_id}
                    {o?.letnik ? <span className="font-normal text-zinc-500"> · {o.letnik}</span> : null}
                    {o?.cena_eur ? (
                      <span className="font-normal text-zinc-500">
                        {" "}
                        · {Math.round(Number(o.cena_eur)).toLocaleString("sl-SI")} €
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {new Date(v.ustvarjen).toLocaleString("sl-SI", {
                      day: "numeric",
                      month: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {v.slik ? ` · ${v.slik} slik` : ""}
                    {v.ms ? ` · ${(v.ms / 1000).toFixed(1)} s` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {v.facelift !== null && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${barvaZaupanja(
                        v.facelift_zaupanje ?? undefined
                      )}`}
                    >
                      {v.facelift ? "facelift" : "predfacelift"}
                      {v.facelift_zaupanje ? ` ${Math.round(Number(v.facelift_zaupanje) * 100)} %` : ""}
                    </span>
                  )}
                  {o?.url && (
                    <a
                      href={o.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg px-2.5 py-1 text-xs text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-900"
                    >
                      oglas ↗
                    </a>
                  )}
                </div>
              </div>

              {v.status === "napaka" ? (
                <p className="mt-2 text-sm text-red-700">Napaka: {v.napaka}</p>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-zinc-500">Kaj vidi model na slikah</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {(v.oprema ?? []).length === 0 && (
                        <span className="text-sm text-zinc-400">ničesar ni prepoznal</span>
                      )}
                      {(v.oprema ?? []).map((z, i) => (
                        <span
                          key={`${z.znacilka}-${i}`}
                          title={z.kje ?? ""}
                          className={`rounded-full px-2.5 py-1 text-xs ${barvaZaupanja(z.zaupanje)}`}
                        >
                          {z.znacilka}
                          {z.zaupanje ? ` ${Math.round(z.zaupanje * 100)} %` : ""}
                        </span>
                      ))}
                    </div>
                    {v.obrazlozitev && (
                      <p className="mt-2 text-xs text-zinc-500">Utemeljitev: {v.obrazlozitev}</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-medium text-zinc-500">Kaj piše v oglasu</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {oglasnaOprema.length === 0 && (
                        <span className="text-sm text-zinc-400">oglas opreme ne našteva</span>
                      )}
                      {oglasnaOprema.slice(0, 14).map((z, i) => (
                        <span
                          key={`${z}-${i}`}
                          className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600"
                        >
                          {String(z)}
                        </span>
                      ))}
                      {oglasnaOprema.length > 14 && (
                        <span className="px-1 text-xs text-zinc-400">+{oglasnaOprema.length - 14}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
