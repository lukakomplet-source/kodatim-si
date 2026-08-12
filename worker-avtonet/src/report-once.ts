import "dotenv/config";
import { connect } from "./db.js";
import { buildDailyReport, sendDailyReport } from "./report.js";

/**
 * Builds and sends the daily market report right now, on demand — the same
 * report the scheduled worker sends, so the branded layout and the "analiza
 * trga" link can be checked without waiting for the schedule.
 *
 *   npm run report
 */
async function main(): Promise<void> {
  const db = connect();
  const r = await buildDailyReport(db);
  const out = await sendDailyReport(r);
  console.log(
    `poslano=${out} · datum=${r.datum} · novih=${r.novihOglasov} · aktivnih=${r.aktivnih} · ` +
      `izginilih=${r.izginilih} · znizanih=${r.znizanihCen} · lestvica=${r.najhitrejsi.length}`
  );
  if (out !== "poslano") {
    console.log("(ni poslano — preveri RESEND_API_KEY / REPORT_EMAIL_TO / REPORT_EMAIL_FROM v .env)");
  }
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
