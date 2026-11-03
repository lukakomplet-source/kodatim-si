import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { preberiDelavca, preberiPosiljanja } from "@/lib/prodajna-ekipa";
import {
  preberiCaka,
  preberiCakaKodaTimVrstice,
  preberiOsnutkePanik,
  preberiStanjePanik,
  type CakaPosel,
  type CakaVrstica,
} from "@/lib/komunikacija";
import { OdobritevMape } from "../prodajna-ekipa/OdobritevMape";
import { OdobritevSeznam } from "../prodajna-ekipa/OdobritevSeznam";
import { kontekstKomunikacije } from "./kontekst";
import { PosiljanjePanik } from "./PosiljanjePanik";
import { GumbOutlook } from "./GumbOutlook";
import { NaslovPosla, Opozorilo } from "./skupno";

/**
 * Komunikacija › Pregled (faza 5, 3. 11. 2026): ENA vrsta mailov, ki čakajo na človeka, za oba posla po stikalu.
 * - Kompletko: panik osnutki (Harvey Kompletko); administrator jih pošlje tu: najprej TEST na svoj Gmail, »Test je
 *   v redu«, nato »Pošlji N mailov« s potrditvijo.
 * - KodaTim: Odobritev (Odobri, Uredi, Zavrni, Popravi kot prej) in Hoteli z »Odpri v Outlooku« (pošlje Luka sam).
 * Spodaj mape z lijakom (prej stran Maili). Številka »čaka« je ista kot na Danes in v meniju (lib/komunikacija.ts).
 * Stari naslovi /admin/maili, /admin/e-posta in /admin/prodajna-ekipa/odobritev pridejo sem.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Komunikacija" };

const LISTMONK_URL = process.env.NEXT_PUBLIC_LISTMONK_URL || "https://listmonk.kodatim.si";

function Stevilo({ ime, c, zraven }: { ime: string; c: CakaPosel | null; zraven: string }) {
  if (!c) return null;
  return (
    <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-200">
      <p className="text-xs font-medium text-zinc-500">{ime}</p>
      <p className="mt-0.5 text-2xl font-semibold text-zinc-900">
        {c.caka === null ? <span className="text-base font-medium text-zinc-400">ni podatka</span> : c.caka}
      </p>
      {c.zraven ? (
        <p className="text-xs text-zinc-500">
          + {c.zraven} {zraven}
        </p>
      ) : null}
      {c.staro ? <p className="text-xs text-amber-700">po starem pravilu (Harvey KodaTim še ni ponovno zagnan)</p> : null}
    </div>
  );
}

async function Kompletko({ jeAdmin }: { jeAdmin: boolean }) {
  const stanje = await preberiStanjePanik();
  if (stanje && stanje !== "staro") return <PosiljanjePanik stanje={stanje} jeAdmin={jeAdmin} />;
  // Harvey Kompletko still runs without the send routes, or does not answer: the plain list (no sending here).
  const staro = await preberiOsnutkePanik();
  if (!staro) return <Opozorilo>Kompletko: ni podatka. Harvey Kompletko (5556) ne odgovarja.</Opozorilo>;
  return (
    <div className="space-y-3">
      <Opozorilo>
        Pošiljanje iz admina bo na voljo, ko se Harvey Kompletko ponovno zažene. Do takrat so osnutki samo za ogled.
      </Opozorilo>
      <ul className="divide-y divide-zinc-100 rounded-2xl bg-white ring-1 ring-zinc-200">
        {staro.osnutki.map((o) => (
          <li key={o.ime} className="px-4 py-2.5 text-sm">
            <b className="text-zinc-900">{o.podjetje || o.domena}</b> <span className="text-zinc-500">· {o.za}</span>
            <span className="block truncate text-xs text-zinc-500">
              {o.vrsta === "prvi" ? "Prvi mail" : "Follow-up"} · {o.zadeva}
              {o.najprejKlic ? " · najprej klic" : ""}
              {o.zadrzan ? " · dogovorjen klic" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutlookVrstice({ vrstice }: { vrstice: CakaVrstica[] }) {
  const mape = [...new Set(vrstice.map((v) => v.mapa || "Outlook"))];
  return (
    <div className="space-y-4">
      {mape.map((m) => (
        <div key={m}>
          <h3 className="text-sm font-semibold text-zinc-900">
            {m} <span className="font-normal text-zinc-500">({vrstice.filter((v) => (v.mapa || "Outlook") === m).length})</span>
          </h3>
          <p className="mb-2 text-xs text-zinc-500">
            »Odpri v Outlooku« odpre mail s prilogami iz luka@kodatim.si. Preglej, popravi in pošlji sam; ko je poslan,
            izgine od tu.
          </p>
          <ul className="divide-y divide-zinc-100 rounded-xl bg-white ring-1 ring-zinc-200">
            {vrstice
              .filter((v) => (v.mapa || "Outlook") === m)
              .map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    {v.vrsta === "follow_up" ? (
                      <span className="mb-1 inline-block rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900">
                        Follow-up
                      </span>
                    ) : v.vrsta === "odgovor" ? (
                      <span className="mb-1 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                        Odgovor stranki
                      </span>
                    ) : null}
                    <p className="truncate text-sm font-semibold text-zinc-900">{v.naslov}</p>
                    <p className="truncate text-sm text-zinc-700">Zadeva: {v.zadeva}</p>
                    {v.email ? <p className="truncate text-xs text-zinc-500">{v.email}</p> : null}
                  </div>
                  {v.id ? <GumbOutlook id={v.id} odprt={v.odprt} /> : null}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

async function KodaTim() {
  const c = await preberiCakaKodaTimVrstice();
  if ("napaka" in c) {
    return (
      <Opozorilo>
        {c.napaka === "staro"
          ? "Harvey KodaTim še teče brez enotnega seznama (potreben je ponovni zagon). Osnutki so spodaj v mapah."
          : "KodaTim: ni podatka. Harvey KodaTim (5555) ne odgovarja."}
      </Opozorilo>
    );
  }
  const odobritev = c.seznam.filter((v) => v.kje === "odobritev");
  const outlook = c.seznam.filter((v) => v.kje === "outlook");
  return (
    <div className="space-y-5">
      {odobritev.length ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-900">Za odobritev ({odobritev.length})</h3>
          <OdobritevSeznam postavke={odobritev} />
        </div>
      ) : null}
      {outlook.length ? <OutlookVrstice vrstice={outlook} /> : null}
      {!odobritev.length && !outlook.length ? <p className="text-sm text-zinc-500">Nič ne čaka.</p> : null}
      {c.caka_na_prej ? (
        <p className="text-xs text-zinc-500">
          Še {c.caka_na_prej} follow-upov čaka, da prvi mail odide iz Outlooka; niso v številki.
        </p>
      ) : null}
    </div>
  );
}

async function Mape({ jeAdmin, kodatim, kompletko }: { jeAdmin: boolean; kodatim: boolean; kompletko: boolean }) {
  const [vse, posiljanja] = await Promise.all([preberiDelavca("odobritev"), preberiPosiljanja()]);
  if (!vse) return <Opozorilo>Harvey KodaTim ne odgovarja, zato map z lijakom ni mogoče prebrati.</Opozorilo>;
  // Prodaja Kompletko sees only Kompletko folders; the switch hides the other business.
  const mape = (vse.mape ?? []).filter((m) =>
    (m.lastnik ?? "kodatim") === "kompletko" ? kompletko : kodatim && jeAdmin,
  );
  // Only the funnel: the drafts and approvals of these folders are in the one queue above (never twice, and a panic
  // draft never gets a second way out that skips the TEST lock).
  const podrobnosti = { ...vse, mape: mape.map((m) => ({ ...m, osnutki: [] })), seznam: [] };
  return <OdobritevMape podrobnosti={podrobnosti} skrbi={kompletko ? posiljanja?.skrbi : null} samoLijak />;
}

const NALAGAM = <p className="text-sm text-zinc-400">Berem …</p>;

export default async function KomunikacijaPregledPage({
  searchParams,
}: {
  searchParams: Promise<{ mapa?: string; posel?: string }>;
}) {
  const { mapa, posel } = await searchParams;
  const k = await kontekstKomunikacije(posel);
  const caka = await preberiCaka({ kodatim: k.kodatim, kompletko: k.kompletko });

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Komunikacija</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Vsi maili, ki čakajo na človeka, na enem mestu. Številka »čaka« je ista kot na Danes in v meniju: samo maili, ki
        jih lahko obdelaš zdaj.
      </p>

      <div className="mt-5 grid max-w-2xl gap-3 sm:grid-cols-2">
        <Stevilo ime="Kompletko: za poslat" c={caka.kompletko} zraven="danes ne more (klic, dan, odgovor)" />
        <Stevilo ime="KodaTim: čaka tebe" c={caka.kodatim} zraven="follow-upov čaka na prvi mail" />
      </div>

      <div className="mt-8 space-y-10">
        {k.kompletko ? (
          <section>
            <NaslovPosla
              posel="kompletko"
              opis={k.jeAdmin ? "Pošlješ tu: najprej TEST, potem paket do 10 mailov." : "Pošilja administrator."}
            />
            <Suspense fallback={NALAGAM}>
              <Kompletko jeAdmin={k.jeAdmin} />
            </Suspense>
          </section>
        ) : null}

        {k.kodatim ? (
          <section>
            <NaslovPosla posel="kodatim" opis="Odobriš tu, Hotele pošlješ sam iz Outlooka." />
            <Suspense fallback={NALAGAM}>
              <KodaTim />
            </Suspense>
          </section>
        ) : null}

        <details open={!!mapa} className="group rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <summary className="cursor-pointer text-base font-semibold text-zinc-900">
            Mape z lijakom (poslano, odpisali, klic, začeli delati)
          </summary>
          <div className="mt-4">
            <Suspense fallback={NALAGAM}>
              <Mape jeAdmin={k.jeAdmin} kodatim={k.kodatim} kompletko={k.kompletko} />
            </Suspense>
          </div>
        </details>
      </div>

      {k.jeAdmin ? (
        <p className="mt-8 text-sm text-zinc-500">
          Novice in obvestila strankam (ne hladni maili) urejaš v{" "}
          <a
            href={LISTMONK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-zinc-900"
          >
            Listmonku <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
