import type { Metadata } from "next";
import KamenaricClient from "./KamenaricClient";
import type { Paket } from "./podatki";

export const metadata: Metadata = {
  title: "Kamenarič — embalaža, tisk in poslovna darila (demo)",
  description: "Predogled nove spletne strani Kamenarič d.o.o. — tri različice: osnovna, trgovina, premium B2B portal.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ paket?: string }>;
}) {
  const { paket } = await searchParams;
  const zacetni: Paket = paket === "2" ? 2 : paket === "3" ? 3 : 1;
  return <KamenaricClient zacetniPaket={zacetni} />;
}
