import "dotenv/config";
import { identiteta, prstniOdtis, primerljivostCene, jePoskodovan, cistNaziv } from "./identiteta.js";

/**
 * Zlati primeri: ročno določen pričakovan izid za natanko tiste primere, kjer
 * je stara logika padla. Vsaka sprememba pravil mora ta nabor prestati — brez
 * tega se ob popravku Porscheja tiho pokvari BMW.
 *
 *   npm run test:identiteta
 */

type Primer = Partial<Parameters<typeof identiteta>[0]> & { _ime: string };

let napak = 0;
let vseh = 0;

function preveri(ime: string, dobljeno: unknown, pricakovano: unknown): void {
  vseh++;
  const ok = JSON.stringify(dobljeno) === JSON.stringify(pricakovano);
  if (!ok) {
    napak++;
    console.log(`  NAPAKA  ${ime}\n          pricakovano: ${JSON.stringify(pricakovano)}\n          dobljeno:    ${JSON.stringify(dobljeno)}`);
  }
}

function id(p: Primer) {
  return identiteta({
    naziv: null, znamka: null, model: null, letnik: null, kw: null, gorivo: null,
    menjalnik: null, karoserija: null, pogon: null, oprema: null, opis: null,
    oprema_znacilke: null, dodatni_podatki: null, ...p,
  });
}

console.log("--- IDENTITETA: druzina in izvedenka ---");

// Tesla: vir za vse vpise model "Model" in pusti kW prazen.
const t3 = id({ _ime: "t3", znamka: "Tesla", model: "Model", naziv: "Tesla Model 3 Long Range AWD 498hp", gorivo: "Elektro", karoserija: "limuzina" });
const ts = id({ _ime: "ts", znamka: "Tesla", model: "Model", naziv: "Tesla Model S 90D Dual Motor AWD", gorivo: "Elektro", karoserija: "limuzina" });
preveri("Tesla Model 3 druzina", t3.druzinaModela, "tesla model 3");
preveri("Tesla Model S druzina", ts.druzinaModela, "tesla model s");
preveri("Tesla 3 in S NISTA ista specifikacija", prstniOdtis(t3) === prstniOdtis(ts), false);
preveri("Tesla Model 3 izvedenka", t3.izvedenka, "long-range");

// Porsche: en model "911" za pol stoletja avtomobilov.
const p4s = id({ _ime: "p4s", znamka: "Porsche", model: "911", naziv: "Porsche 911 992 CARRERA 4S PDK", letnik: 2021, kw: 331, karoserija: "coupe", menjalnik: "avtomatski" });
const pgts = id({ _ime: "pgts", znamka: "Porsche", model: "911", naziv: "Porsche 911 Carrera GTS Coupe PDK-CHRONO", letnik: 2022, kw: 353, karoserija: "coupe", menjalnik: "avtomatski" });
preveri("Porsche 4S izvedenka", p4s.izvedenka, "carrera-4s");
preveri("Porsche GTS izvedenka", pgts.izvedenka, "gts");
preveri("4S in GTS NISTA ista specifikacija", prstniOdtis(p4s) === prstniOdtis(pgts), false);
preveri("Porsche 4S je AWD", p4s.pogon, "awd");
preveri("Porsche generacija 992", p4s.generacija, "992");
preveri("Porsche PDK", p4s.menjalnikDruzina, "pdk");

// BMW: M paket ni M3, kamera 360 ni izvedenka.
const b320 = id({ _ime: "b320", znamka: "BMW", model: "serija 3", naziv: "BMW serija 3: 320d M SPORT KAMERA 360 LED", letnik: 2019, kw: 140 });
const bm3 = id({ _ime: "bm3", znamka: "BMW", model: "serija 3", naziv: "BMW serija 3: M3 Competition", letnik: 2021, kw: 375 });
const bx5 = id({ _ime: "bx5", znamka: "BMW", model: "serija X5", naziv: "BMW serija X5: xDrive30d M sport PANORAMA", letnik: 2019, kw: 195 });
preveri("BMW 320d z M paketom NI M3", b320.izvedenka, "320d");
preveri("BMW M3 je M3", bm3.izvedenka, "m3");
preveri("BMW X5 xDrive30d", bx5.izvedenka, "x5-30d");
preveri("BMW X5 je AWD", bx5.pogon, "awd");
preveri("cistNaziv odstrani kamero 360", /360/.test(cistNaziv("BMW 320d KAMERA 360")), false);

// Mercedes: C220d proti C43 AMG.
const c220 = id({ _ime: "c220", znamka: "Mercedes-Benz", model: "C-Razred", naziv: "Mercedes-Benz C-Razred C 220 d Avantgarde", letnik: 2018, kw: 143 });
const c43 = id({ _ime: "c43", znamka: "Mercedes-Benz", model: "C-Razred", naziv: "Mercedes-Benz C-Razred C 43 AMG 4MATIC", letnik: 2019, kw: 287 });
preveri("Mercedes C220d", c220.izvedenka, "c220d");
preveri("Mercedes C43 AMG", c43.izvedenka, "amg43");
preveri("C220d in C43 NISTA isto", prstniOdtis(c220) === prstniOdtis(c43), false);
preveri("C43 4MATIC je AWD", c43.pogon, "awd");

// Audi: S line je paket, S4 je model.
const a4 = id({ _ime: "a4", znamka: "Audi", model: "A4", naziv: "Audi A4 40 TDI quattro S line S tronic", letnik: 2020, kw: 140 });
const s4 = id({ _ime: "s4", znamka: "Audi", model: "S4", naziv: "Audi S4 3.0 TDI quattro", letnik: 2020, kw: 255 });
const rs4 = id({ _ime: "rs4", znamka: "Audi", model: "RS4", naziv: "Audi RS4 Avant 2.9 TFSI quattro", letnik: 2021, kw: 331 });
preveri("Audi 40 TDI (S line ni izvedenka)", a4.izvedenka, "40tdi");
preveri("Audi S4", s4.izvedenka, "s4");
preveri("Audi RS4", rs4.izvedenka, "rs4");
preveri("Audi quattro je AWD", a4.pogon, "awd");
preveri("Audi S tronic", a4.menjalnikDruzina, "s-tronic");

// VW: GTI proti navadnemu, rocni proti DSG.
const golfGti = id({ _ime: "gti", znamka: "Volkswagen", model: "Golf", naziv: "Volkswagen Golf GTI 2.0 TSI DSG", letnik: 2020, menjalnik: "avtomatski" });
const golfTdi = id({ _ime: "gtdi", znamka: "Volkswagen", model: "Golf", naziv: "Volkswagen Golf 2.0 TDI Comfortline", letnik: 2020, menjalnik: "ročni" });
preveri("Golf GTI", golfGti.izvedenka, "gti");
preveri("Golf 2.0 TDI", golfTdi.izvedenka, "2.0tdi");
preveri("GTI in TDI NISTA isto", prstniOdtis(golfGti) === prstniOdtis(golfTdi), false);
preveri("rocni ni DSG", golfTdi.menjalnikDruzina, "rocni");

console.log("--- OPREMA ---");
const opremljen = id({
  _ime: "opr", znamka: "BMW", model: "serija 5", naziv: "BMW serija 5: 530d xDrive M sport",
  oprema: "Matrix LED žarometi; panoramska streha; zračno vzmetenje; Harman/Kardon; hlajeni sedeži; head-up display",
});
preveri("matrix najden", opremljen.oprema.matrix_led === true, true);
preveri("panorama najdena", opremljen.oprema.panorama === true, true);
preveri("zracno vzmetenje najdeno", opremljen.oprema.zracno_vzmetenje === true, true);
preveri("premium avdio najden", opremljen.oprema.premium_audio === true, true);
preveri("hlajeni sedezi najdeni", opremljen.oprema.sedezi_hlajenje === true, true);
preveri("hud najden", opremljen.oprema.hud === true, true);
preveri("teza opreme > 10", opremljen.opremaTeza > 10, true);

console.log("--- PRIMERLJIVOST CENE (zanikanja!) ---");
const pc = (naziv: string, opis: string, cena = 20000) =>
  primerljivostCene({ naziv, opis, cena_eur: cena, cena_na_poziv: false });
preveri("nekaramboliran NI poskodba", pc("BMW 320d", "1 lastnik, nekaramboliran, servisna knjiga").primerljiva, true);
preveri("nikoli poskodovan NI poskodba", pc("Audi A6", "nikoli poškodovan/karamboliran, redno servisiran").primerljiva, true);
preveri("ni bilo karambolirano NI poskodba", pc("Jeep", "stanje: vozilo ni bilo karambolirano, 1. lastnik").primerljiva, true);
preveri("spredaj karambolirano JE poskodba", pc("Peugeot", "v dobrem stanju..spredaj karambolirano...").primerljiva, false);
preveri("zadaj poskodovan JE poskodba", pc("Kombi", "karoserijsko je zadaj na levi strani poškodovan, kar je vidno").primerljiva, false);
preveri("financiranje s pologom NI ara", pc("VW Sharan", "možnost financiranja z minimalnim pologom od 10% naprej").primerljiva, true);
preveri("brez pologa NI ara", pc("Porsche", "minimalni polog ali brez pologa, vaše vozilo lahko služi kot polog").primerljiva, true);
preveri("ara v naslovu JE ara", pc("VW Tiguan ARA 3000", "").primerljiva, false);
preveri("za dele JE izlocitev", pc("Golf 4", "prodam za dele, motor v okvari").primerljiva, false);
preveri("cena na poziv izlocena", primerljivostCene({ naziv: "X", opis: "", cena_eur: 1, cena_na_poziv: true }).primerljiva, false);
preveri("jePoskodovan: cist opis", jePoskodovan("odlicno ohranjen, garaziran, servisna knjiga"), false);

console.log(`\n${vseh - napak}/${vseh} testov OK${napak ? `, ${napak} NAPAK` : ""}`);
process.exit(napak ? 1 : 0);
