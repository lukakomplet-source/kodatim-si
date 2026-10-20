import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import {
  predajVPromocije,
  preberiEkipo,
  preberiLijak,
  type Lijak,
  type PredajaRezultat,
} from "@/lib/prodajna-ekipa";
import { Osvezevanje } from "../nadzor/Osvezevanje";
import { Diagram } from "./Diagram";

/**
 * Prodajna ekipa KodaTim: Harvey kot ekipa delavcev, od iskanja do prodaje.
 *
 * Vsak izris prebere Harveyjev povzetek in odgovore z zanimanjem preda v
 * Promocije (brez podvajanja), zato je predaja tam, kjer jo Luka vidi, tudi
 * če Promocij ne odpre. Klik na delavca odpre njegove podrobnosti.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Prodajna ekipa" };

const OSVEZI_VSAKIH_S = 15;

export default async function ProdajnaEkipaPage() {
  await requireAdmin();
  const { povzetek, napaka } = await preberiEkipo();

  let predaja: PredajaRezultat | null = null;
  let lijak: Lijak | null = null;
  if (povzetek) {
    [predaja, lijak] = await Promise.all([
      predajVPromocije().catch(() => null),
      preberiLijak().catch(() => null),
    ]);
  }

  return (
    <div>
      <Osvezevanje vsakoS={OSVEZI_VSAKIH_S} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-zinc-900">Prodajna ekipa</h1>
        <span className="text-xs text-zinc-400">
          {povzetek
            ? `osveženo ${new Date(povzetek.ustvarjeno).toLocaleTimeString("sl-SI", { timeZone: "Europe/Ljubljana" })} · `
            : ""}
          samodejno vsakih {OSVEZI_VSAKIH_S} s
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Harvey za KodaTim kot ekipa delavcev: od iskanja podjetij v registru do prodaje. Klik na
        delavca pokaže, kaj dela in kaj je naredil nazadnje. Številke so Harveyjeve, v živo.{" "}
        <Link href="/admin/prodajna-ekipa/panoge" className="text-zinc-900 underline underline-offset-2">
          Panoge
        </Link>{" "}
        — kaj lastnike v posamezni panogi muči.
      </p>

      {napaka ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          {napaka} Zaženeš ga z opravilom »Harvey - iskanje kupcev« ali ob prijavi v Windows.
        </p>
      ) : null}

      {povzetek && !povzetek.posiljanje.vklopljeno ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Pošiljanje je izklopljeno: {povzetek.posiljanje.razlog}. Osnutki se pišejo in čakajo na
          tvojo odobritev, ven ne gre nič.
        </p>
      ) : null}

      {predaja && predaja.predanih > 0 ? (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          {predaja.predanih === 1
            ? "Eno podjetje je odgovorilo z zanimanjem in je zdaj"
            : `${predaja.predanih} podjetij je odgovorilo z zanimanjem in so zdaj`}{" "}
          v Promocijah z nalogo »Pokliči«.{" "}
          {lijak?.kampanjaId ? (
            <Link href={`/admin/promocije/${lijak.kampanjaId}`} className="underline">
              Odpri kampanjo
            </Link>
          ) : null}
        </p>
      ) : null}
      {predaja?.napaka ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          Predaja v Promocije: {predaja.napaka}
        </p>
      ) : null}

      {povzetek ? <Diagram povzetek={povzetek} lijak={lijak} /> : null}
    </div>
  );
}
