import { requireAdmin } from "@/lib/require-admin";
import LeadScrapeClient from "./LeadScrapeClient";

export const metadata = { title: "Lead skrejp" };

export default async function LeadScrapePage() {
  await requireAdmin();

  const credentialsReady = Boolean(process.env.AJPES_USERNAME && process.env.AJPES_PASSWORD);

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Lead skrejp</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Poišče podjetja v poslovnem registru AJPES po dejavnosti, imenu ali kraju, jih skrejpa
        prek AJPES, CompanyWall, Bizi in spletne strani, ter sestavi tabelo, ki jo lahko
        prenesete v Excel ali uvozite v Lead Intelligence.
      </p>

      {!credentialsReady && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-200">
          AJPES prijava ni nastavljena (<code>AJPES_USERNAME</code> / <code>AJPES_PASSWORD</code>),
          zato iskanje po registru ne bo delovalo.
        </p>
      )}

      <LeadScrapeClient />
    </div>
  );
}
