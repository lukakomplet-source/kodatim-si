import { notFound } from "next/navigation";
import { zahtevajStran } from "@/lib/require-admin";
import { preberiMail, type MailZaOgled } from "@/lib/komunikacija";
import { OgledMaila, Opozorilo } from "../../skupno";

/** »Poglej mail« za KodaTim mail, ki ga je poslal Harvey (besedilo iz Harveyjeve baze). Samo administrator. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Poslan mail" };

export default async function KodaTimMailPage({ params }: { params: Promise<{ id: string }> }) {
  await zahtevajStran();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const { status, data } = await preberiMail("kodatim-mail", id);
  if (!data) {
    return (
      <div className="max-w-4xl">
        <Opozorilo>{status === 404 ? "Tega maila ni." : "Harvey KodaTim (5555) ne odgovarja ali še ni ponovno zagnan."}</Opozorilo>
      </div>
    );
  }
  return <OgledMaila mail={data as MailZaOgled} nazaj="/admin/komunikacija/poslano" nazajIme="Poslano" />;
}
