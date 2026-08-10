import { redirect } from "next/navigation";
import { Bell, Car, Sparkles } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import type { MoznostiFiltrov, Spremljanje } from "@/lib/avtonet/spremljanja";
import { stejUjemanja } from "@/lib/avtonet/ujemanje";
import { SpremljanjaClient } from "./SpremljanjaClient";

/**
 * Moja spremljanja — the product's front door.
 *
 * The promise on this page is one sentence: tell me when a car I want appears.
 * So the page shows watches and what is new in them, and nothing about how the
 * data got here. The scraper's page counters, checkpoints and worker health used
 * to live on this screen and made a search tool look like a monitoring console;
 * they now live behind the admin tab.
 */

// Per-user from here on: what this page shows depends on who is asking, so it
// cannot be cached for everyone the way the public analysis pages can.
export const dynamic = "force-dynamic";

type Kartica = {
  spremljanje: Spremljanje;
  zadetkov: number;
  novih: number;
};

export default async function SpremljanjaPage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/avtonet"));

  const db = createAdminClient();

  // Everyone sees their own watches; an admin sees all of them, because the
  // agency has to be able to support a client who cannot explain their filter.
  let iskanjaQ = db.from("avtonet_iskanja").select("*").order("created_at", { ascending: false });
  if (!dostop.jeAdmin) iskanjaQ = iskanjaQ.eq("created_by", dostop.userId);

  const [iskanjaRes, oglasiRes, zdravjeRes] = await Promise.all([
    iskanjaQ,
    db.from("avtonet_oglasi").select("id", { count: "exact", head: true }).eq("status", "aktiven"),
    db.from("avtonet_zdravje").select("zadnji_uspeh").eq("id", "worker").maybeSingle(),
  ]);

  if (iskanjaRes.error?.code === "PGRST205") {
    return (
      <Opozorilo>
        Baza še ni pripravljena. V Supabase SQL Editorju poženite{" "}
        <code>supabase/migration_avtonet.sql</code>, nato osvežite to stran.
      </Opozorilo>
    );
  }

  // A search saved before the extended columns existed would render with
  // undefined fields everywhere; saying which migration is missing is more use
  // than a screen full of dashes.
  const vrstice = (iskanjaRes.data ?? []) as unknown as Spremljanje[];
  if (vrstice.length > 0 && !("prodajalec_filter" in vrstice[0])) {
    return (
      <Opozorilo>
        Spremljanja še nimajo vseh stolpcev. V Supabase SQL Editorju poženite{" "}
        <code>supabase/migration_avtonet_spremljanja.sql</code>, nato osvežite to stran.
      </Opozorilo>
    );
  }

  // One count query per watch. Cheap at this scale, and it means the badge is
  // the real number of matches rather than the number of emails that happened
  // to go out.
  const kartice: Kartica[] = await Promise.all(
    vrstice.map(async (s) => {
      const [zadetkov, novih] = await Promise.all([
        stejUjemanja(db, s),
        // Never looked at it? Then everything matching is new to this person.
        s.zadnji_ogled ? stejUjemanja(db, s, s.zadnji_ogled) : Promise.resolve(null),
      ]);
      return { spremljanje: s, zadetkov, novih: novih ?? zadetkov };
    })
  );

  const moznosti = await preberiMoznosti(db);

  return (
    <SpremljanjaClient
      kartice={kartice}
      moznosti={moznosti}
      aktivnihOglasov={oglasiRes.count ?? 0}
      zadnjiPregled={(zdravjeRes.data as { zadnji_uspeh: string | null } | null)?.zadnji_uspeh ?? null}
    />
  );
}

/**
 * The dropdown options, taken from the data rather than from a hardcoded list.
 *
 * Deliberate: the source writes fuel as one lowercase word and the exact
 * vocabulary is its own ("bencinski", not "bencin"). A guessed list would offer
 * values that match nothing and quietly return an empty watch forever. Reading
 * the distinct values means the form can only offer what actually exists, and
 * the list grows on its own as the market is swept.
 */
async function preberiMoznosti(db: ReturnType<typeof createAdminClient>): Promise<MoznostiFiltrov> {
  const { data } = await db
    .from("avtonet_oglasi")
    .select("znamka, gorivo, menjalnik")
    .eq("status", "aktiven")
    .limit(5000);

  const rows = (data ?? []) as { znamka: string | null; gorivo: string | null; menjalnik: string | null }[];
  const uniq = (key: "znamka" | "gorivo" | "menjalnik"): string[] =>
    [...new Set(rows.map((r) => r[key]).filter((v): v is string => !!v))].sort((a, b) =>
      a.localeCompare(b, "sl")
    );

  return { znamke: uniq("znamka"), goriva: uniq("gorivo"), menjalniki: uniq("menjalnik") };
}

function Opozorilo({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900">
        <Bell className="h-6 w-6 text-accent" />
        Moja spremljanja
      </h1>
      <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        {children}
      </p>
      <p className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
        <Sparkles className="h-4 w-4" />
        Ko bo baza pripravljena, boste tu ustvarili prvo spremljanje.
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
        <Car className="h-4 w-4" />
        Spremljanje pomeni: povej mi, ko se pojavi nov oglas po mojih pogojih.
      </p>
    </div>
  );
}
