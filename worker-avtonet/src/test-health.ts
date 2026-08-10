import { startHealthServer, update } from "./health.js";

/**
 * The health endpoint's contract, which is the part a hosting platform acts
 * on: a warning must stay 200 and only a give-up must be 503.
 *
 * Worth an actual test rather than a reading, because getting it backwards is
 * invisible in code review and expensive in production — a 503 on the first
 * failed pass makes the platform restart the container into the same wall
 * every minute, and a permanent fault then looks like a busy, healthy service.
 *
 *   npm run test:health
 */

const PORT = 8099;

async function statusFor(state: "ok" | "opozorilo" | "ustavljeno"): Promise<number> {
  update({ state });
  const res = await fetch(`http://127.0.0.1:${PORT}/`);
  return res.status;
}

async function main(): Promise<void> {
  const server = startHealthServer(PORT);
  await new Promise((r) => setTimeout(r, 300));

  let failures = 0;
  const expect = (label: string, actual: number, wanted: number) => {
    const ok = actual === wanted;
    if (!ok) failures += 1;
    console.log(`  ${ok ? "OK   " : "NAPAKA"} ${label.padEnd(34)} HTTP ${actual} (pricakovano ${wanted})`);
  };

  console.log("Health endpoint:");
  expect("stanje ok", await statusFor("ok"), 200);
  expect("stanje opozorilo (brez restarta)", await statusFor("opozorilo"), 200);
  expect("stanje ustavljeno", await statusFor("ustavljeno"), 503);

  const body = (await (await fetch(`http://127.0.0.1:${PORT}/`)).json()) as { ok: boolean; state: string };
  const bodyOk = body.ok === false && body.state === "ustavljeno";
  if (!bodyOk) failures += 1;
  console.log(`  ${bodyOk ? "OK   " : "NAPAKA"} telo odgovora vsebuje stanje`);

  // Wait for the socket to actually close before ending. Calling process.exit
  // while the handle is still closing trips a libuv assertion on Windows, and
  // the script then reports a non-zero exit after printing success — a test
  // that lies about its own result is worse than no test.
  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log(failures === 0 ? "\nTEST USPESEN." : `\n${failures} napak.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("TEST NI USPEL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
