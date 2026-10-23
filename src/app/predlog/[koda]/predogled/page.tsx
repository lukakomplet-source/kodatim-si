import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { preberiPredlog } from "@/lib/predlogi";
import { AgentStran } from "../AgentStran";
import { DemoStran } from "../DemoStran";
import { pisavaPoImenu, pisavaZa } from "../pisave";
import { PredogledStrani } from "../PredogledStrani";
import { imaProdajo, ProdajnaStran } from "../ProdajnaStran";

/**
 * Samo nova stran podjetja, čez celo širino — s te poti Harvey naredi sliki
 * predogleda (računalnik, telefon), ki gresta s ponudbo v mail.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PredogledPage({
  params,
  searchParams,
}: {
  params: Promise<{ koda: string }>;
  searchParams: Promise<{ korak?: string }>;
}) {
  const { koda } = await params;
  // ?korak=0..2: telefon na prvem zaslonu v tem koraku (Harvey iz treh posnetkov naredi GIF za mail).
  const korak = Number.parseInt((await searchParams).korak ?? "", 10);
  const branje = await preberiPredlog(koda);
  if (branje.stanje !== "ok") notFound();
  const k = Number.isNaN(korak) ? undefined : korak;
  if (imaProdajo(branje.predlog)) return <ProdajnaStran p={branje.predlog} samoVrh korak={k} />;
  // Agentova stran brez dela za lastnika: z nje sta sliki za mail in PDF.
  if (branje.predlog.stran && branje.predlog.agent)
    return (
      <AgentStran
        p={branje.predlog}
        zaSliko
        pisava={pisavaPoImenu(branje.predlog.stran.tema.pisava)}
        korak={Number.isNaN(korak) ? undefined : korak}
      />
    );
  // Demo v paketu 3 brez vrstice s paketi: z njega so sliki za mail in PDF.
  if (branje.predlog.demo)
    return <DemoStran p={branje.predlog} zacetniPaket={3} zaSliko pisava={pisavaZa(branje.predlog.dejavnost)} />;
  return (
    <main className="flex-1 bg-white">
      <PredogledStrani p={branje.predlog} okvir={false} />
    </main>
  );
}
