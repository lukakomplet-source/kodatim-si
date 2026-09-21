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
  // Kam gre zgrajena stran. Privzeto ".next", objava (objava.ps1) pa gradi v
  // ".next_nova" — z drugo mapo lahko gradnja teče, MEDTEM ko stara verzija še
  // streže obiskovalce, in se mapi zamenjata šele na koncu. Prej je moral
  // strežnik pred gradnjo umreti (Windows ne pusti prepisovati odprtih datotek
  // v .next) in kodatim.si je bil vsakič 5–9 minut nedosegljiv.
  //
  // Ta vrstica je edini način, da to sploh dela: Next 16 nima stikala
  // --dist-dir in NEXT_DIST_DIR sam po sebi ne bere nikjer. Brez nje je
  // `$env:NEXT_DIST_DIR = ".next_nova"` tiho brez učinka — gradnja gre v .next
  // pod nogami tekoči strani, menjava pa nima česa preimenovati.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
