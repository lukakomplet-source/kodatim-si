/**
 * Folders on the "Spletne strani in aplikacije" screen (src/lib/demoMape.ts).
 * Run: npx tsx scripts/test-demo-mape.ts
 */
import assert from "node:assert/strict";
import {
  BREZ,
  PRAZNO,
  VSE,
  dodajMapo,
  izbrisiMapo,
  kljucBaze,
  kljucVgrajene,
  napakaImena,
  naprejDo,
  nastaviDodatek,
  normaliziraj,
  preimenujMapo,
  premakni,
  sporociloZaStranko,
  stevilaPoMapah,
  vMapi,
} from "../src/lib/demoMape";

let n = 0;
function test(ime: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok  ${ime}`);
}

const kam = kljucVgrajene("kamenaric");
const urv = kljucVgrajene("urvis");
const row = kljucBaze("8b1e");

test("prazno ali pokvarjeno shranjeno stanje je prazno", () => {
  assert.deepEqual(normaliziraj(null), PRAZNO);
  assert.deepEqual(normaliziraj("x"), PRAZNO);
  assert.deepEqual(normaliziraj({ mape: "x", razporeditev: 3 }), { mape: [], razporeditev: {}, dodatki: {} });
});

test("normalizacija zavrže dvojnike, prazna imena, rezervirane id-je in razporeditev v neobstoječo mapo", () => {
  const s = normaliziraj({
    mape: [{ id: "a", ime: " Stranke " }, { id: "a", ime: "Dvojnik" }, { id: "b", ime: "" }, { id: "vse", ime: "X" }],
    razporeditev: { [kam]: "a", [urv]: "izbrisana", [row]: 5 },
    dodatki: { [kam]: { stranka: " Kamenarič ", status: "neznan" }, [urv]: { opombe: "  " } },
  });
  assert.deepEqual(s.mape, [{ id: "a", ime: "Stranke" }]);
  assert.deepEqual(s.razporeditev, { [kam]: "a" });
  assert.deepEqual(s.dodatki, { [kam]: { stranka: "Kamenarič" } });
});

test("ustvari, premakni, preimenuj", () => {
  let s = dodajMapo(PRAZNO, "Za ponudbo", "a");
  s = premakni(s, kam, "a");
  s = premakni(s, row, "a");
  s = preimenujMapo(s, "a", "Ponudbe");
  assert.equal(s.mape[0].ime, "Ponudbe");
  assert.equal(vMapi(s, kam, "a"), true);
  assert.equal(vMapi(s, urv, "a"), false);
  assert.equal(vMapi(s, urv, BREZ), true);
  assert.equal(vMapi(s, kam, VSE), true);
});

test("brisanje mape ne izbriše del — gredo v Brez mape", () => {
  let s = dodajMapo(PRAZNO, "A", "a");
  s = dodajMapo(s, "B", "b");
  s = premakni(s, kam, "a");
  s = premakni(s, urv, "b");
  s = izbrisiMapo(s, "a");
  assert.deepEqual(s.mape.map((m) => m.id), ["b"]);
  assert.equal(vMapi(s, kam, BREZ), true);
  assert.equal(vMapi(s, urv, "b"), true);
});

test("premik v Brez mape ali v neobstoječo mapo odstrani razporeditev", () => {
  let s = premakni(dodajMapo(PRAZNO, "A", "a"), kam, "a");
  assert.deepEqual(premakni(s, kam, BREZ).razporeditev, {});
  s = premakni(s, kam, "ni-je");
  assert.deepEqual(s.razporeditev, {});
});

test("števila po mapah štejejo samo obstoječa dela", () => {
  let s = dodajMapo(PRAZNO, "A", "a");
  s = premakni(s, kam, "a");
  s = premakni(s, kljucBaze("izbrisan-zapis"), "a");
  const st = stevilaPoMapah(s, [kam, urv, row]);
  assert.equal(st.get(VSE), 3);
  assert.equal(st.get("a"), 1);
  assert.equal(st.get(BREZ), 2);
});

test("ime mape: prazno, predolgo, že obstaja (ne glede na velike črke)", () => {
  const s = dodajMapo(PRAZNO, "Stranke", "a");
  assert.match(napakaImena(s, "  ") ?? "", /Vpišite/);
  assert.match(napakaImena(s, "x".repeat(61)) ?? "", /predolgo/);
  assert.match(napakaImena(s, "stranke") ?? "", /že obstaja/);
  assert.equal(napakaImena(s, "stranke", "a"), null);
  assert.equal(napakaImena(s, "Ponudbe"), null);
});

test("dodatki pri delu v kodi: nastavi, prepiše, prazno odstrani", () => {
  let s = nastaviDodatek(PRAZNO, kam, { stranka: "Kamenarič d.o.o.", status: "za_predogled" });
  s = nastaviDodatek(s, kam, { status: "pri_stranki" });
  assert.deepEqual(s.dodatki[kam], { stranka: "Kamenarič d.o.o.", status: "pri_stranki" });
  s = nastaviDodatek(s, kam, { stranka: undefined, status: undefined });
  assert.equal(s.dodatki[kam], undefined);
});

test("status predogleda gre samo naprej", () => {
  assert.equal(naprejDo(undefined, "za_predogled"), "za_predogled");
  assert.equal(naprejDo("v_izdelavi", "za_predogled"), "za_predogled");
  assert.equal(naprejDo("za_predogled", "pri_stranki"), "pri_stranki");
  assert.equal(naprejDo("pri_stranki", "za_predogled"), null);
  assert.equal(naprejDo("odobreno", "pri_stranki"), null);
  assert.equal(naprejDo("preseljeno", "za_predogled"), null);
});

test("sporočilo za stranko vsebuje naziv in povezavo", () => {
  const t = sporociloZaStranko("Kamenarič — promo izdelki", "https://kodatim.si/kamenaric");
  assert.ok(t.includes("Kamenarič — promo izdelki"));
  assert.ok(t.split("\n").includes("https://kodatim.si/kamenaric"));
});

console.log(`\n${n} testov uspešnih`);
