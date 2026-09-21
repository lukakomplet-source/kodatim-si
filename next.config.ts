import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kam gre zgrajena stran. Privzeto ".next", avtodeploy pa gradi v
  // ".next_nova" — z drugo mapo lahko gradnja teče, MEDTEM ko stara verzija še
  // streže obiskovalce. Prej je moral streznik pred gradnjo umreti (Windows ne
  // pusti prepisovati odprtih datotek v .next) in kodatim.si je bil vsakič
  // 5–9 minut nedosegljiv; 17. 9. 2026 se je to zgodilo sedemkrat v uri.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Preverjanje tipov med gradnjo je na tem računalniku redno ostalo brez
  // pomnilnika (Zone Allocation failed): gradnja teče ob workerjih, arhivarju
  // in Dockerju, tsc pa potrebuje ~6 GB. Tipi se zato preverjajo LOČENO z
  // `npx tsc --noEmit` pred vsako gradnjo — to je del delovnega procesa, ne
  // izpuščen korak.
  typescript: { ignoreBuildErrors: true },
  // 15 vzporednih workerjev za staticne strani je ob workerjih in Dockerju
  // preseglo pomnilnik in gradnja je tiho umrla sredi izvoza (manjkajoc
  // prerender-manifest.json, stran pa se ni vec zagnala). Stiri zadoscajo.
  experimental: { cpus: 4 },
};

export default nextConfig;
