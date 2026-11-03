import { notFound } from "next/navigation";
import { zahtevajStran } from "@/lib/require-admin";
import { IME_OSNUTKA, preberiMail, type MailZaOgled } from "@/lib/komunikacija";
import { OgledMaila, Opozorilo } from "../../skupno";

/**
 * »Poglej mail« za panik osnutek: tak, kot bi šel ven (slike vgrajene, priloge po imenu), s kršitvami pravil vsebine,
 * če jih ima. Samo ogled; pošilja se v Pregledu.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Osnutek" };

type Predogled = MailZaOgled & { bcc?: string; vsebina?: string[]; oblika?: string };

export default async function OsnutekPanikPage({ params }: { params: Promise<{ ime: string }> }) {
  await zahtevajStran("kompletko.view");
  const { ime: surovo } = await params;
  let ime = surovo;
  try {
    ime = decodeURIComponent(surovo);
  } catch {
    // already decoded
  }
  if (!IME_OSNUTKA.test(ime) || ime.includes("..")) notFound();
  const { status, data } = await preberiMail("kompletko-osnutek", ime);
  if (!data) {
    return (
      <div className="max-w-4xl">
        <Opozorilo>
          {status === 404
            ? "Tega osnutka ni več (poslan ali umaknjen), ali Harvey Kompletko še ni ponovno zagnan."
            : "Harvey Kompletko (5556) ne odgovarja."}
        </Opozorilo>
      </div>
    );
  }
  const p = data as Predogled;
  return (
    <div>
      {p.vsebina?.length ? (
        <div className="mb-4 max-w-4xl">
          <Opozorilo>Ta osnutek krši pravila in ne gre ven: {p.vsebina.join(" · ")}</Opozorilo>
        </div>
      ) : null}
      <OgledMaila mail={p} nazaj="/admin/komunikacija" nazajIme="Pregled" />
      {p.bcc ? <p className="mt-2 text-xs text-zinc-500">Skrita kopija: {p.bcc}</p> : null}
    </div>
  );
}
