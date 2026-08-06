import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Carry on where you left off" — an offer, not a redirect.
 *
 * Being thrown to a page you did not ask for is worse than one extra click,
 * so this only ever shows a link.
 */

const LABELS: { prefix: string; label: string }[] = [
  { prefix: "/admin/lead-skrejp", label: "Lead skrejp" },
  { prefix: "/admin/lead-intelligence/leads", label: "Baza leadov" },
  { prefix: "/admin/lead-intelligence/import", label: "Uvoz leadov" },
  { prefix: "/admin/lead-intelligence", label: "Lead Intelligence" },
  { prefix: "/admin/promocije/tematska", label: "Tematska kampanja" },
  { prefix: "/admin/promocije", label: "Promocije" },
  { prefix: "/admin/prodajni-coach", label: "Prodajni coach" },
  { prefix: "/admin/partnerji", label: "Partnerji" },
  { prefix: "/admin/podjetja", label: "Podjetja" },
];

function labelFor(path: string): string {
  return LABELS.find((l) => path.startsWith(l.prefix))?.label ?? path;
}

function agoText(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "pravkar";
  if (minutes < 60) return `pred ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `pred ${hours} h`;
  return `pred ${Math.round(hours / 24)} dnevi`;
}

export default async function ResumeCard() {
  let user;
  try {
    user = await requireAdmin();
  } catch {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ui_state")
    .select("value")
    .eq("user_id", user.id)
    .eq("key", "last-path")
    .maybeSingle();

  // The table arrives with a migration the user runs by hand; until then this
  // simply does not appear.
  if (error || !data) return null;

  const value = data.value as { path?: string; at?: number } | null;
  const path = value?.path;
  if (!path || !path.startsWith("/admin") || path === "/admin") return null;

  return (
    <Link
      href={path}
      className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-accent/20 bg-accent/5 px-5 py-4 transition hover:bg-accent/10"
    >
      <div>
        <p className="text-sm font-semibold text-zinc-900">Nadaljujte, kjer ste ostali</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {labelFor(path)}
          {value?.at ? ` · ${agoText(value.at)}` : ""}
        </p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-accent" />
    </Link>
  );
}
