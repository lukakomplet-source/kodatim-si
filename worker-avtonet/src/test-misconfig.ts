import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * What happens when the secrets are missing?
 *
 * This is not a hypothetical: the first Railway deploy failed exactly here,
 * and reported nothing but "Healthcheck failure" — correct, and useless. The
 * worker must instead come up far enough to say what is wrong, answer 503 so
 * the platform still knows it is broken, and keep saying so.
 *
 *   npm run test:misconfig
 */

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8098;

async function main(): Promise<void> {
  // A deliberately blank environment: no .env is loaded because the child is
  // started from a directory where dotenv finds nothing to read.
  const child = spawn(process.execPath, ["--import", "tsx", join(here, "index.ts")], {
    cwd: join(here, ".."),
    env: {
      PATH: process.env.PATH,
      PORT: String(PORT),
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      DOTENV_CONFIG_PATH: join(here, "nonexistent.env"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (d) => (output += String(d)));
  child.stderr.on("data", (d) => (output += String(d)));

  await new Promise((r) => setTimeout(r, 3500));

  let failures = 0;
  const check = (label: string, ok: boolean) => {
    if (!ok) failures += 1;
    console.log(`  ${ok ? "OK    " : "NAPAKA"} ${label}`);
  };

  console.log("Zagon brez skrivnosti:");

  const explains = /Manjkata SUPABASE_URL/.test(output);
  check("dnevnik pove, kaj manjka", explains);

  let status = 0;
  let stateInBody = "";
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    status = res.status;
    const body = (await res.json()) as { state?: string; lastError?: string };
    stateInBody = body.state ?? "";
    check("health odgovarja (proces ni izginil)", true);
    check("health vrne 503", status === 503);
    check("stanje je 'ustavljeno'", stateInBody === "ustavljeno");
    check("razlog je v odgovoru", /SUPABASE_URL/.test(body.lastError ?? ""));
  } catch {
    check("health odgovarja (proces ni izginil)", false);
  }

  child.kill();
  console.log(failures === 0 ? "\nTEST USPESEN." : `\n${failures} napak.\n--- izpis ---\n${output}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("TEST NI USPEL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
