import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { preberiPredlog } from "@/lib/predlogi";
import { PredogledStrani } from "../PredogledStrani";

/**
 * Samo nova stran podjetja, čez celo širino — s te poti Harvey naredi sliki
 * predogleda (računalnik, telefon), ki gresta s ponudbo v mail.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PredogledPage({ params }: { params: Promise<{ koda: string }> }) {
  const { koda } = await params;
  const branje = await preberiPredlog(koda);
  if (branje.stanje !== "ok") notFound();
  return (
    <main className="flex-1 bg-white">
      <PredogledStrani p={branje.predlog} okvir={false} />
    </main>
  );
}
