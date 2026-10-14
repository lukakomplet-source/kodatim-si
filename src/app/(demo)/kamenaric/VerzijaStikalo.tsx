"use client";

/**
 * Preklop med staro (splošno) in novo verzijo demo strani — tako lahko
 * pokažemo obe, vsako s svojimi paketi 1/2/3. Paket se ohrani ob preklopu.
 */
export default function VerzijaStikalo({ verzija, paket }: { verzija: "stara" | "nova"; paket: number }) {
  const href = (v: "stara" | "nova") => (v === "stara" ? `?verzija=stara&paket=${paket}` : `?paket=${paket}`);
  return (
    <div className="flex items-center rounded-md bg-white/10 p-0.5 text-[11px] font-semibold">
      {(["stara", "nova"] as const).map((v) => (
        <a
          key={v}
          href={href(v)}
          className={`rounded px-2.5 py-1 transition ${verzija === v ? "bg-white text-[#0b1530]" : "text-white/70 hover:text-white"}`}
        >
          {v === "stara" ? "Stara" : "Nova"}
          <span className="hidden sm:inline"> verzija</span>
        </a>
      ))}
    </div>
  );
}
