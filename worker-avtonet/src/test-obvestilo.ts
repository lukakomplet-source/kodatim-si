import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { connect } from "./db.js";
import { findMatches, renderAlertHtml, type Iskanje } from "./alerts.js";

/**
 * The "new car" notification, end to end, against real collected data.
 *
 * Everything except the send is exercised regardless of configuration: a real
 * saved-search shape is matched against the real database, the real email is
 * rendered, and the result is written to a file you can open. So the message can
 * be reviewed — wording, columns, the honest note about unverified sellers —
 * before a key exists, and the same command sends it for real once one does.
 *
 * Nothing is written to the database. The search is constructed in memory with a
 * random id, so `avtonet_obvestila` gains no rows and no real advert is marked as
 * already-reported — a test must not consume a notification the user was meant
 * to receive.
 *
 *   npm run test:obvestilo                 -- preview only
 *   npm run test:obvestilo -- --znamka Audi --cena-max 20000
 *   npm run test:obvestilo -- --to luka@primer.si   -- also send, if key exists
 */

function arg(ime: string): string | null {
  const i = process.argv.indexOf(`--${ime}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function stevilka(ime: string): number | null {
  const v = arg(ime);
  if (v === null) return null;
  const n = Number(v.replace(/[.\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function main(): Promise<void> {
  const db = connect();

  const prejemnik = arg("to") ?? process.env.REPORT_EMAIL_TO ?? null;

  // A saved search exactly as the app would store one, but never persisted.
  const iskanje: Iskanje = {
    id: "00000000-0000-4000-8000-000000000000",
    naziv: arg("naziv") ?? "Testno spremljanje",
    znamka: arg("znamka"),
    model: arg("model"),
    letnik_min: stevilka("letnik-min"),
    letnik_max: stevilka("letnik-max"),
    km_min: stevilka("km-min"),
    km_max: stevilka("km-max"),
    moc_min: stevilka("moc-min"),
    moc_max: stevilka("moc-max"),
    cena_min: stevilka("cena-min"),
    cena_max: stevilka("cena-max"),
    gorivo: arg("gorivo"),
    menjalnik: arg("menjalnik"),
    prodajalec_filter: (arg("prodajalec") as Iskanje["prodajalec_filter"]) ?? "vsi",
    samo_dealerji: false,
    email_obvestila: prejemnik,
  };

  console.log("=== POGOJI SPREMLJANJA ===");
  for (const [k, v] of Object.entries(iskanje)) {
    if (v !== null && v !== false && k !== "id") console.log(`  ${k}: ${v}`);
  }

  console.log("\n=== ISKANJE ZADETKOV V BAZI ===");
  const zadetki = await findMatches(db, iskanje, 10);
  console.log(`  najdenih: ${zadetki.length}`);
  if (zadetki.length === 0) {
    console.log("\n  Ni zadetkov. Poskusite ohlapnejse pogoje, npr.:");
    console.log("    npm run test:obvestilo -- --znamka Audi");
    return;
  }
  for (const z of zadetki.slice(0, 5)) {
    const cena = z.cena_eur === null ? "?" : `${Math.round(Number(z.cena_eur)).toLocaleString("sl-SI")} €`;
    console.log(`    - ${String(z.naziv ?? z.avtonet_id).slice(0, 58)} | ${cena} | ${z.letnik ?? "?"}`);
  }

  const html = renderAlertHtml(iskanje, zadetki);
  const pot = path.join(process.cwd(), "obvestilo-predogled.html");
  await writeFile(pot, html, "utf8");
  console.log(`\n=== PREDOGLED ===\n  ${pot}`);
  console.log("  Odprite to datoteko v brskalniku — tako izgleda e-posta stranki.");

  console.log("\n=== POSILJANJE ===");
  const kljuc = process.env.RESEND_API_KEY;
  const posiljatelj = process.env.REPORT_EMAIL_FROM;

  const manjka: string[] = [];
  if (!kljuc) manjka.push("RESEND_API_KEY");
  if (!posiljatelj) manjka.push("REPORT_EMAIL_FROM");
  if (!prejemnik) manjka.push("prejemnik (--to ali REPORT_EMAIL_TO)");

  if (manjka.length > 0) {
    console.log(`  PRESKOCENO — manjka: ${manjka.join(", ")}`);
    console.log("  Vse ostalo je preverjeno: ujemanje, vsebina in oblika e-poste.");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${kljuc}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: posiljatelj,
      to: [prejemnik],
      subject: `[TEST] ${zadetki.length} novih oglasov: ${iskanje.naziv}`,
      html,
    }),
  });

  if (res.ok) {
    console.log(`  POSLANO na ${prejemnik}`);
  } else {
    // The body carries Resend's reason — usually an unverified sender domain,
    // which is the single most common first-time failure.
    console.log(`  NI USPELO — HTTP ${res.status}`);
    console.log(`  ${(await res.text()).slice(0, 400)}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("TEST NI USPEL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
