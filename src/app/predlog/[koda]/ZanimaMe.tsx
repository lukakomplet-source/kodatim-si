"use client";

import { useState } from "react";
import { Check } from "lucide-react";

/**
 * »Zanima me« na en klik (Luka, 24. 10. 2026): telefon ali e-pošta, ime in sporočilo po želji.
 * Luka dobi Telegram in pokliče; samodejni follow-up se ustavi.
 */
export function ZanimaMe({ koda, ime }: { koda: string; ime: string }) {
  const [telefon, setTelefon] = useState("");
  const [email, setEmail] = useState("");
  const [oseba, setOseba] = useState("");
  const [sporocilo, setSporocilo] = useState("");
  const [spletna, setSpletna] = useState("");
  const [stanje, setStanje] = useState<"" | "posiljam" | "poslano">("");
  const [napaka, setNapaka] = useState("");

  async function poslji(e: React.FormEvent) {
    e.preventDefault();
    setNapaka("");
    if (telefon.replace(/\D/g, "").length < 6 && !email.includes("@")) {
      setNapaka("Vpišite telefon ali e-pošto, da vas lahko pokličem.");
      return;
    }
    setStanje("posiljam");
    try {
      const r = await fetch(`/predlog/${koda}/zanimanje`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefon, email, ime: oseba, sporocilo, spletna }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; napaka?: string };
      if (r.ok && d.ok) {
        setStanje("poslano");
      } else {
        setStanje("");
        setNapaka(d.napaka ?? "Pošiljanje ni uspelo. Pokličite 040 199 051.");
      }
    } catch {
      setStanje("");
      setNapaka("Pošiljanje ni uspelo. Pokličite 040 199 051.");
    }
  }

  if (stanje === "poslano") {
    return (
      <div className="rounded-3xl bg-white p-7 text-[var(--crn)]">
        <p className="flex items-center gap-3 text-2xl font-bold">
          <Check className="h-7 w-7 text-[var(--b)]" strokeWidth={3} aria-hidden /> Hvala!
        </p>
        <p className="mt-3 leading-relaxed text-[#374151]">
          Pokličem vas še danes in v 15 minutah pokažem, kako bi delovalo pri {ime}. — Luka
        </p>
      </div>
    );
  }

  const polje =
    "w-full rounded-xl border border-[#d6dae2] bg-white px-4 py-3 text-base text-[var(--crn)] placeholder:text-[#9aa1ad] focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_25%,white)]";
  return (
    <form onSubmit={poslji} className="rounded-3xl bg-white p-6 text-[var(--crn)] sm:p-7" noValidate>
      <p className="text-xl font-bold">Zanima me</p>
      <p className="mt-1 text-sm text-[#4b5563]">Pustite telefon ali e-pošto, pokličem vas jaz.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="sr-only">Telefon</span>
          <input type="tel" inputMode="tel" autoComplete="tel" placeholder="Telefon" value={telefon}
            onChange={(e) => setTelefon(e.target.value)} className={polje} />
        </label>
        <label className="block">
          <span className="sr-only">E-pošta</span>
          <input type="email" autoComplete="email" placeholder="ali e-pošta" value={email}
            onChange={(e) => setEmail(e.target.value)} className={polje} />
        </label>
        <label className="block sm:col-span-2">
          <span className="sr-only">Ime</span>
          <input type="text" autoComplete="name" placeholder="Ime (po želji)" value={oseba}
            onChange={(e) => setOseba(e.target.value)} className={polje} />
        </label>
        <label className="block sm:col-span-2">
          <span className="sr-only">Sporočilo</span>
          <textarea rows={2} placeholder="Kdaj vas je najlažje dobiti? (po želji)" value={sporocilo}
            onChange={(e) => setSporocilo(e.target.value)} className={polje} />
        </label>
        {/* skrito polje za robote */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden value={spletna}
          onChange={(e) => setSpletna(e.target.value)} className="hidden" />
      </div>
      {napaka ? <p className="mt-3 text-sm font-medium text-[#b42318]">{napaka}</p> : null}
      <button type="submit" disabled={stanje === "posiljam"}
        className="mt-5 w-full rounded-xl bg-[var(--b)] px-6 py-4 text-lg font-bold text-white shadow-lg shadow-black/10 hover:brightness-110 disabled:opacity-60">
        {stanje === "posiljam" ? "Pošiljam …" : "Zanima me – pokličite me"}
      </button>
    </form>
  );
}
