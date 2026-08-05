"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X } from "lucide-react";

/**
 * Semantic search over the lead base.
 *
 * It used to turn the question into URL filters and redirect, so a match
 * depended on the exact word appearing in a field — "avtovleka" missed a towing
 * company registered as "Spremljajoče storitvene dejavnosti v kopenskem
 * prevozu". Results are ranked by meaning now and shown here with the reason
 * each one matched, so it is visible WHY something was found. The filter route
 * is still one click away for the cases where a plain filter is what you want.
 */

type Result = {
  id: string;
  company_name: string;
  industry: string | null;
  email: string | null;
  phone: string | null;
  address_city: string | null;
  contact_person: string | null;
  score: number;
  reason: string;
};

export default function AiSearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/lead-intelligence/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Iskanje ni uspelo.");
        return;
      }
      setResults(json.results ?? []);
      setNote(json.note ?? null);
    } catch {
      setError("Prišlo je do nepričakovane napake.");
    } finally {
      setLoading(false);
    }
  }

  /** The old behaviour, kept for when a plain filtered list is what you want. */
  async function applyAsFilter() {
    if (!query.trim()) return;
    setFiltering(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lead-intelligence/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Filtriranje ni uspelo.");
        return;
      }
      const params = new URLSearchParams(json.filters as Record<string, string>);
      router.push(`/admin/lead-intelligence/leads?${params.toString()}`);
    } catch {
      setError("Prišlo je do nepričakovane napake.");
    } finally {
      setFiltering(false);
    }
  }

  return (
    <div className="rounded-2xl border border-accent/20 bg-accent/5 p-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Sparkles className="hidden h-5 w-5 shrink-0 text-accent sm:block" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='npr. "kdo bi rabil odvoz odpadkov" ali "podjetja z avtovleko blizu Ljubljane"'
          className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || filtering}
          className="flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Iščem …" : "AI iskanje"}
        </button>
        <button
          type="button"
          onClick={applyAsFilter}
          disabled={loading || filtering || !query.trim()}
          className="rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
        >
          {filtering ? "…" : "Uporabi kot filter"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {results && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">
              {note}
              {results.length > 0 && ` Prikazanih ${results.length}.`}
            </p>
            <button
              type="button"
              onClick={() => {
                setResults(null);
                setNote(null);
              }}
              className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
            >
              <X className="h-3.5 w-3.5" />
              Zapri
            </button>
          </div>

          {results.length === 0 ? (
            <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-zinc-500">
              Nič se ne ujema. Poskusite drugače opisati, koga iščete — ali napolnite bazo prek Lead skrejpa.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {results.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/lead-intelligence/leads/${r.id}`}
                  className="block rounded-xl bg-white p-3 transition hover:ring-1 hover:ring-accent/30"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-900">{r.company_name}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        r.score >= 70
                          ? "bg-emerald-50 text-emerald-700"
                          : r.score >= 40
                            ? "bg-amber-50 text-amber-700"
                            : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {r.score}
                    </span>
                  </div>
                  {r.reason && <p className="mt-1 text-xs text-zinc-600">{r.reason}</p>}
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {[r.industry, r.address_city, r.email, r.phone, r.contact_person]
                      .filter(Boolean)
                      .join(" · ") || "brez kontaktnih podatkov"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
