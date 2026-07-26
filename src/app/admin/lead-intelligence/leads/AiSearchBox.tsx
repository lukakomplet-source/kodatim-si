"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

export default function AiSearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lead-intelligence/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Iskanje ni uspelo.");
        return;
      }
      const params = new URLSearchParams(json.filters as Record<string, string>);
      router.push(`/admin/lead-intelligence/leads?${params.toString()}`);
    } catch {
      setError("Prišlo je do nepričakovane napake.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-2xl border border-accent/20 bg-accent/5 p-5 sm:flex-row sm:items-center"
    >
      <Sparkles className="hidden h-5 w-5 shrink-0 text-accent sm:block" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='npr. "gradbena podjetja v Celju" ali "podjetja brez emaila"'
        className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Iščem …" : "AI iskanje"}
      </button>
      {error && <p className="text-sm text-red-500 sm:basis-full">{error}</p>}
    </form>
  );
}
