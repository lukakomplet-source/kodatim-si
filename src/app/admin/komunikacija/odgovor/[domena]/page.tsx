import { notFound } from "next/navigation";
import { zahtevajStran } from "@/lib/require-admin";
import { preberiMail, type MailZaOgled } from "@/lib/komunikacija";
import { OgledMaila, Opozorilo } from "../../skupno";

/** »Poglej mail« za odgovor prevoznika (Kompletko): njihov zadnji mail iz predala, samo za branje. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Odgovor" };

export default async function KompletkoOdgovorPage({ params }: { params: Promise<{ domena: string }> }) {
  await zahtevajStran("kompletko.view");
  const { domena } = await params;
  if (!/^[a-z0-9][a-z0-9.-]{1,80}\.[a-z]{2,}$/.test(domena)) notFound();
  const { status, data } = await preberiMail("kompletko-odgovor", domena);
  if (!data) {
    return (
      <div className="max-w-4xl">
        <Opozorilo>
          {status === 404
            ? "Tega odgovora ni v predalu (ali Harvey Kompletko še ni ponovno zagnan)."
            : "Predal luka@kompletko.com ali Harvey Kompletko (5556) trenutno ni dosegljiv."}
        </Opozorilo>
      </div>
    );
  }
  // Attachments are listed by name only (no download route for replies yet).
  return <OgledMaila mail={data as MailZaOgled} nazaj="/admin/komunikacija/odgovori" nazajIme="Odgovori" />;
}
