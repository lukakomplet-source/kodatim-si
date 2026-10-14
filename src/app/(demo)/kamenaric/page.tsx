import type { Metadata } from "next";
import StaraKamenaric from "./stara/KamenaricClient";
import NovaKamenaric from "./nova/NovaClient";
import type { Paket } from "./stara/podatki";

export const metadata: Metadata = {
  title: "Kamenarič — promo izdelki in poslovna darila (demo)",
  description:
    "Predogled nove spletne strani Kamenarič d.o.o. — nova verzija z njihovimi izdelki in cenami ter starejša splošna verzija, vsaka v treh paketih.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ paket?: string; verzija?: string }>;
}) {
  const { paket, verzija } = await searchParams;
  const zacetni: Paket = paket === "2" ? 2 : paket === "3" ? 3 : 1;
  // Stara (splošna) verzija ostane nespremenjena za predstavitve; privzeta je nova.
  if (verzija === "stara") return <StaraKamenaric zacetniPaket={zacetni} />;
  return <NovaKamenaric zacetniPaket={zacetni} />;
}
