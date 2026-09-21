/**
 * Ob zagonu strežnika zapiše, KATERO gradnjo je ta proces v resnici naložil.
 *
 * Zakaj to potrebujemo: 19. 9. 2026 je med objavo nekdo zagnal stran iz stare
 * mape `.next`, ki smo jo tik zatem zamenjali z novo. Proces je vračal 200 na
 * naslovnici, vsaka še nenaložena podstran pa je padla na manjkajočem kosu —
 * in ker je bilo od zunaj videti zdravo, je tako ostalo 34 ur.
 *
 * Od zunaj tega ni mogoče izmeriti: Next 16 (App Router) oznake gradnje ne
 * piše v HTML, zato je `buildId` iz odgovora ni. Edini, ki zanesljivo ve, s
 * čim je vstal, je proces sam — zato to zapiše sem, avtodeploy pa datoteko
 * primerja z `.next/BUILD_ID` na disku in ob neskladju stran znova zažene.
 *
 * Zapisujemo PID, ker mora bralec ločiti med „to je zapisal proces, ki še
 * teče“ in ostankom prejšnjega zagona.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { readFile, writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const koren = process.cwd();
    const oznaka = (await readFile(join(koren, ".next", "BUILD_ID"), "utf8")).trim();
    const mapa = join(koren, ".avtodeploy");
    await mkdir(mapa, { recursive: true });
    await writeFile(
      join(mapa, "tekoca-gradnja.txt"),
      `${oznaka} ${process.pid} ${new Date().toISOString()}\n`,
      "utf8"
    );
  } catch {
    // Zapis je diagnostika, ne pogoj za delovanje strani.
  }
}
