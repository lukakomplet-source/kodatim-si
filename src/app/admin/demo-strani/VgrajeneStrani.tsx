"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Wrench } from "lucide-react";
import { DEMO_VRSTA_LABELS, type VgrajenaDemoStran } from "@/lib/demoStrani";

/**
 * The demos that are routes in this repository rather than rows in the database.
 *
 * Its own component, not a section inside DemoStraniClient, because that one
 * only renders when the `demo_strani` table exists. These have to be clickable
 * regardless — a finished app that cannot be reached from anywhere is the
 * problem this fixes.
 *
 * No editing, no status, no delete: there is nothing to write to. What they need
 * is what a demo is for — open it, and copy the link for the client.
 */

const CARD = "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm";

export default function VgrajeneStrani({ items }: { items: readonly VgrajenaDemoStran[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  if (items.length === 0) return null;

  /**
   * Built from the live origin rather than a hardcoded domain, so a link copied
   * on localhost points at localhost and one copied on kodatim.si points at
   * kodatim.si.
   */
  function copyLink(slug: string) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    void navigator.clipboard?.writeText(`${origin}/${slug}`);
    setCopied(slug);
    setTimeout(() => setCopied((c) => (c === slug ? null : c)), 2000);
  }

  return (
    <div className="mt-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <Wrench className="h-4 w-4 text-accent" />
        Vgrajene aplikacije
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Te so del kodne baze in ne zapisi v bazi — zato jih tu ni mogoče urejati ali brisati, so pa
        vedno na voljo.
      </p>

      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.slug} className={`${CARD} py-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-900">
                  {item.naziv}
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                    {DEMO_VRSTA_LABELS[item.vrsta]}
                  </span>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                    V kodi
                  </span>
                </p>
                <p className="mt-1 truncate text-xs text-zinc-500">
                  <span className="font-mono text-zinc-700">/{item.slug}</span>
                  {item.stranka && ` · ${item.stranka}`}
                </p>
                <p className="mt-1.5 text-xs text-zinc-600">{item.opis}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/${item.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Odpri
                </a>
                <button
                  type="button"
                  onClick={() => copyLink(item.slug)}
                  className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  {copied === item.slug ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === item.slug ? "Kopirano" : "Kopiraj povezavo"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
