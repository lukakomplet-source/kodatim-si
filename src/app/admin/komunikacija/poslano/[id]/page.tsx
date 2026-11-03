import { notFound } from "next/navigation";
import { zahtevajStran } from "@/lib/require-admin";
import { preberiMail, type MailZaOgled } from "@/lib/komunikacija";
import { OgledMaila, Opozorilo } from "../../skupno";

/** »Poglej mail« za mail, poslan iz admina (Kompletko): prav ta mail iz Poslano po njegovem Message-ID, samo za branje. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Poslan mail" };

export default async function KompletkoPoslanIzAdminaPage({ params }: { params: Promise<{ id: string }> }) {
  await zahtevajStran("kompletko.view");
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  const { status, data } = await preberiMail("kompletko-poslano", id);
  if (!data) {
    return (
      <div className="max-w-4xl">
        <Opozorilo>
          {status === 404
            ? "Tega maila ni v Poslano (ali Harvey Kompletko še ni ponovno zagnan)."
            : "Predal luka@kompletko.com ali Harvey Kompletko (5556) trenutno ni dosegljiv."}
        </Opozorilo>
      </div>
    );
  }
  return <OgledMaila mail={data as MailZaOgled} nazaj="/admin/komunikacija/poslano" nazajIme="Poslano" />;
}
