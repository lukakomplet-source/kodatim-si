import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { ResearchPanel } from "../ResearchPanel";
import { WorkerHealth } from "../Freshness";
import { PregledClient } from "./PregledClient";

/**
 * The development centre — admin only.
 *
 * Everything technical that used to sit on the product's front page lives here:
 * the research trigger, the worker's health, and the live log of what the
 * scraper is doing right now. A person looking for a car has no use for page
 * counters; a person debugging a sweep has no use for anything else.
 *
 * `requireAdmin` throws for everyone else and the route redirects to the login,
 * so this is a real gate and not a hidden link.
 */

export const dynamic = "force-dynamic";

export default async function PregledPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/prijava?redirect=/avtonet/pregled");
  }

  const db = createAvtonetClient();
  const [zdravjeRes, aktivnaRes] = await Promise.all([
    db.from("avtonet_zdravje").select("*").eq("id", "worker").maybeSingle(),
    db
      .from("avtonet_raziskave")
      .select("id, status")
      .in("status", ["zahtevano", "tece"])
      .limit(1)
      .maybeSingle(),
  ]);

  const zdravje = (zdravjeRes.data ?? null) as {
    zadnji_uspeh: string | null;
    zadnja_napaka: string | null;
    stanje: string | null;
    zaporednih_napak: number | null;
    strani_zadnjic: number | null;
    najdenih_zadnjic: number | null;
    novih_zadnjic: number | null;
  } | null;

  const tece = (aktivnaRes.data as { status: string } | null)?.status === "tece";

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Research console</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-zinc-500">
            Tehnični del SBN Auto: zagon pregleda trga, stanje zbiralnika in dnevnik tega, kar scraper
            dejansko počne. Uporabnik tega ne vidi.
          </p>
        </div>
        <WorkerHealth
          zadnjiUspeh={zdravje?.zadnji_uspeh ?? null}
          napaka={zdravje?.zadnja_napaka ?? null}
          stanje={zdravje?.stanje ?? "ok"}
          zaporednihNapak={zdravje?.zaporednih_napak ?? 0}
          strani={zdravje?.strani_zadnjic ?? null}
          najdenih={zdravje?.najdenih_zadnjic ?? null}
          novih={zdravje?.novih_zadnjic ?? null}
        />
      </header>

      <ResearchPanel />

      <div className="mt-8">
        <PregledClient tece={tece} />
      </div>
    </div>
  );
}
