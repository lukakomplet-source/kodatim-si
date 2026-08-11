import "dotenv/config";
import { connect } from "./db.js";
import { prejemnik, type Iskanje } from "./alerts.js";

/**
 * Proves the recipient chain: search address, then the account setting, then the
 * login address.
 *
 * Uses a real profile so the lookups are real, and writes the account setting to
 * a temporary value that is restored afterwards — a test must not leave someone
 * subscribed to an address they never chose.
 *
 *   npm run test:prejemnik
 */

const napake: string[] = [];
function preveri(pogoj: boolean, opis: string): void {
  console.log(`  ${pogoj ? "OK  " : "NAPAKA"} ${opis}`);
  if (!pogoj) napake.push(opis);
}

function iskanjeZa(lastnik: string | null, email: string | null): Iskanje {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    naziv: "Test",
    znamka: null, model: null,
    letnik_min: null, letnik_max: null,
    km_min: null, km_max: null,
    moc_min: null, moc_max: null,
    cena_min: null, cena_max: null,
    gorivo: null, menjalnik: null,
    prodajalec_filter: "vsi",
    samo_dealerji: false,
    email_obvestila: email,
    created_by: lastnik,
  };
}

async function main(): Promise<void> {
  const db = connect();

  const { data: profil } = await db.from("profiles").select("id, email").limit(1).maybeSingle();
  if (!profil) {
    console.log("Ni nobenega profila v bazi - testa ni mogoce izvesti.");
    process.exitCode = 1;
    return;
  }
  const lastnik = profil.id as string;
  const prijavniEmail = profil.email as string;
  console.log(`Uporabnik za test: ${prijavniEmail}\n`);

  // Remember whatever is there now, so it can be put back.
  const { data: prej } = await db
    .from("avtonet_uporabniki")
    .select("id, obvestila_email")
    .eq("uporabnik", lastnik)
    .maybeSingle();
  const prejsnjiVpis = prej as { id: string; obvestila_email: string | null } | null;

  console.log("1. Naslov vpisan pri spremljanju ima prednost");
  const a = await prejemnik(db, iskanjeZa(lastnik, "pri-spremljanju@primer.si"));
  preveri(a.email === "pri-spremljanju@primer.si" && a.vir === "spremljanje", `${a.email} (vir: ${a.vir})`);

  console.log("\n2. Prazno pri spremljanju -> naslov iz Nastavitev");
  await db
    .from("avtonet_uporabniki")
    .upsert({ uporabnik: lastnik, obvestila_email: "iz-nastavitev@primer.si" }, { onConflict: "uporabnik" });
  const b = await prejemnik(db, iskanjeZa(lastnik, null));
  preveri(b.email === "iz-nastavitev@primer.si" && b.vir === "nastavitve", `${b.email} (vir: ${b.vir})`);

  console.log("\n3. Prazno oboje -> prijavni e-naslov");
  await db.from("avtonet_uporabniki").update({ obvestila_email: null }).eq("uporabnik", lastnik);
  const c = await prejemnik(db, iskanjeZa(lastnik, null));
  preveri(c.email === prijavniEmail && c.vir === "prijava", `${c.email} (vir: ${c.vir})`);

  console.log("\n4. Spremljanje brez lastnika -> ni prejemnika");
  const d = await prejemnik(db, iskanjeZa(null, null));
  preveri(d.email === null && d.vir === "ni", `${d.email} (vir: ${d.vir})`);

  // Restore.
  if (prejsnjiVpis) {
    await db
      .from("avtonet_uporabniki")
      .update({ obvestila_email: prejsnjiVpis.obvestila_email })
      .eq("id", prejsnjiVpis.id);
  } else {
    await db.from("avtonet_uporabniki").delete().eq("uporabnik", lastnik);
  }
  console.log("\nPrvotno stanje povrnjeno.");

  console.log("\n" + "-".repeat(50));
  console.log(napake.length === 0 ? "TEST USPESEN." : `TEST NI USPEL - ${napake.length} napak.`);
  if (napake.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("TEST NI USPEL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
