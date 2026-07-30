"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(urlError);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (signInError || !data.user) {
        setError("Napačen email ali geslo.");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      const destination =
        redirectTo ?? (profile?.role === "admin" ? "/admin" : "/partner");
      router.push(destination);
      router.refresh();
    } catch {
      setError("Napaka pri povezavi. Preverite internetno povezavo in poskusite znova.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/nastavi-geslo`,
      }
    );

    setLoading(false);
    if (resetError) {
      setError("Prišlo je do napake. Poskusite znova.");
      return;
    }
    setResetSent(true);
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
        {mode === "login" ? (
          <>
            <h1 className="text-2xl font-semibold text-zinc-900">Prijava</h1>
            <p className="mt-2 text-base text-zinc-500">
              Za administratorje in partnerje.
            </p>

            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <div>
                <label className="text-sm font-medium text-zinc-700">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-[15px] text-zinc-900 focus:border-accent/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">
                  Geslo
                </label>
                <div className="relative mt-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-3 pr-11 text-[15px] text-zinc-900 focus:border-accent/50 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Skrij geslo" : "Prikaži geslo"}
                    className="absolute inset-y-0 right-0 flex items-center px-3.5 text-zinc-400 hover:text-zinc-700"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-zinc-900 px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
              >
                {loading ? "Prijavljam …" : "Prijava"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError(null);
              }}
              className="mt-5 text-sm text-zinc-500 hover:text-zinc-900"
            >
              Pozabljeno geslo?
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-zinc-900">
              Ponastavitev gesla
            </h1>
            <p className="mt-2 text-base text-zinc-500">
              Vpišite svoj email in poslali vam bomo povezavo za nastavitev
              novega gesla.
            </p>

            {resetSent ? (
              <p className="mt-8 rounded-xl bg-emerald-50 px-4 py-3.5 text-[15px] text-emerald-700">
                Če račun obstaja, je povezava na poti na {email}.
              </p>
            ) : (
              <form onSubmit={handleReset} className="mt-8 space-y-5">
                <div>
                  <label className="text-sm font-medium text-zinc-700">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-[15px] text-zinc-900 focus:border-accent/50 focus:outline-none"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-zinc-900 px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                >
                  {loading ? "Pošiljam …" : "Pošlji povezavo"}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setResetSent(false);
              }}
              className="mt-5 text-sm text-zinc-500 hover:text-zinc-900"
            >
              ← Nazaj na prijavo
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
