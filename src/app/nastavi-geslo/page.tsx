"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Geslo mora imeti vsaj 8 znakov.");
      return;
    }
    if (password !== confirm) {
      setError("Gesli se ne ujemata.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError(
        "Povezava je potekla ali ni veljavna. Zahtevajte novo povezavo prek prijave."
      );
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError("Gesla ni bilo mogoče nastaviti. Poskusite znova.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    router.push(profile?.role === "admin" ? "/admin" : "/partner");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="mx-auto mb-10 flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-base font-bold text-white">
          K
        </span>
        <span className="text-xl font-semibold tracking-tight text-zinc-900">
          KodaTim<span className="text-accent">.si</span>
        </span>
      </Link>

      <div className="rounded-3xl border border-zinc-200 bg-white p-9 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Nastavite geslo
        </h1>
        <p className="mt-2 text-base text-zinc-500">
          Izberite geslo za svoj račun.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="text-sm font-medium text-zinc-700">
              Novo geslo
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-[15px] text-zinc-900 focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">
              Ponovite geslo
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-[15px] text-zinc-900 focus:border-accent/50 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-zinc-900 px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? "Shranjujem …" : "Shrani geslo"}
          </button>
        </form>
      </div>
    </div>
  );
}
