import { spawn } from "node:child_process";
import { KODA_ZE_TECE } from "./health.js";

/**
 * Two workers, one port: the second must stand down with a sentence, not a stack
 * trace and an endless restart loop.
 *
 * This is here because it happened. An orphaned worker held 8080, and the
 * launcher's restart loop reported EADDRINUSE every ten seconds forever — which
 * reads like a broken machine rather than "it is already running".
 *
 * Spawned WITHOUT a shell on purpose: with `shell: true` on Windows the child is
 * cmd.exe and `kill()` reaps only the shell, leaving the real worker alive and
 * this test hanging until it is killed from outside. Both processes are killed by
 * pid, and a spare port is used so a running production worker is untouched.
 *
 *   npm run test:dvojni
 */

const PORT = "8123";

/**
 * Node runs the worker directly, with tsx loaded as a loader.
 *
 * Not `spawn("tsx.cmd")`: Node refuses to spawn a .cmd without a shell
 * (EINVAL), and `shell: true` would put cmd.exe in between — then `kill()` reaps
 * only the shell and the real worker survives, which hung the first version of
 * this test. Spawning node itself means the pid we hold is the process we mean.
 */
function zazeni() {
  const p = spawn(
    process.execPath,
    ["--import", "tsx/esm", "src/index.ts"],
    {
      env: { ...process.env, PORT, AVTONET_URNIK: "" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let izpis = "";
  p.stdout.on("data", (d) => (izpis += String(d)));
  p.stderr.on("data", (d) => (izpis += String(d)));
  return {
    p,
    izpis: () => izpis,
    konec: new Promise<number>((r) => p.on("exit", (c) => r(c ?? -1))),
  };
}

async function main(): Promise<void> {
  const napake: string[] = [];
  const preveri = (pogoj: boolean, opis: string) => {
    console.log(`  ${pogoj ? "OK  " : "NAPAKA"} ${opis}`);
    if (!pogoj) napake.push(opis);
  };

  console.log(`Prvi worker na portu ${PORT}…`);
  const prvi = zazeni();
  await new Promise((r) => setTimeout(r, 10_000));

  console.log("Drugi worker na istem portu…");
  const drugi = zazeni();
  const koda = await Promise.race([
    drugi.konec,
    new Promise<number>((r) => setTimeout(() => r(-99), 25_000)),
  ]);

  console.log("");
  preveri(koda === KODA_ZE_TECE, `drugi se ustavi s kodo ${KODA_ZE_TECE} (dobil: ${koda})`);
  preveri(/ze tece/i.test(drugi.izpis()), "izpise razumljivo sporocilo namesto stack trace");
  preveri(!/at Server\.setupListenHandle/.test(drugi.izpis()), "brez neobdelane izjeme");

  for (const x of [prvi, drugi]) {
    try {
      x.p.kill("SIGKILL");
    } catch {
      // Already gone.
    }
  }
  await new Promise((r) => setTimeout(r, 1000));

  console.log("\n" + "-".repeat(50));
  console.log(napake.length === 0 ? "TEST USPESEN." : `TEST NI USPEL — ${napake.length} napak.`);
  if (napake.length > 0) process.exitCode = 1;
  // Both children are dead; nothing keeps the loop alive, but be explicit so a
  // lingering handle cannot hang a test that has already reported its result.
  process.exit(napake.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("TEST NI USPEL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
