import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
