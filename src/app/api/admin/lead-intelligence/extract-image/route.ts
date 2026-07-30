import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { chatJSONWithImages } from "@/lib/openai";
import { IMPORT_FIELDS, type ImportField } from "@/lib/lead-intelligence/types";

const MAX_IMAGES = 8;
const MAX_TOTAL_CHARS = 20_000_000;

const SYSTEM_PROMPT = `Si natančen asistent, ki iz ene ali več priloženih slik izlušči podatke o poslovnih leadih (podjetjih). Slike so lahko vizitke, screenshoti spletnih strani, oglasi, seznami kontaktov, ali (pogosto) screenshoti iz poslovnih/bonitetnih registrov (npr. CompanyWall, Bizi, AJPES, GVIN, ePRS) — take slike imajo goste tabele z veliko označenimi polji (DŠ, MŠ, SKD, lastniki, direktorji, kontakti, finančni podatki ipd.).

Prejel boš eno ali več slik hkrati. Tvoja naloga:
1. Za vsako sliko ugotovi, kateremu podjetju pripada (ime podjetja, DŠ, spletna stran ipd. so ključni znaki za prepoznavo).
2. Če več slik očitno pripada ISTEMU podjetju (npr. dve fotografiji iste vizitke, dva screenshota istega profila, enako ime/DŠ/website), jih ZDRUŽI v EN sam vnos in kombiniraj podatke iz vseh teh slik (dopolnjuj polja, ne podvajaj).
3. Če slike pripadajo RAZLIČNIM podjetjem, za vsako podjetje vrni svoj ločen vnos.

Preberi VSO vidno besedilo na vsaki sliki, tudi manjše besedilo in stranske stolpce/tabele — ne le najbolj vidnega naslova.

Vrni IZKLJUČNO JSON objekt oblike {"leads": [ {...}, {...} ]}. Vsak element naj ima polja (vsa nizi, string):
company_name, industry, website, email, phone, address_street, address_city, address_region, address_country, vat_id, contact_person, notes, revenue_year, revenue_amount, skd_code, skd_name.

Kako mapirati pogosta polja iz registrskih strani:
- "vat_id": davčna številka / DŠ (npr. "SI97304999").
- "industry": glavna dejavnost / SKD opis v prosti obliki (če ni ločenega SKD polja).
- "skd_code" in "skd_name": če je na sliki viden uradni SKD zapis (standardna klasifikacija dejavnosti, npr. "52.260 - Druge spremljajoče prevozne dejavnosti"), razdeli ga na kodo ("52.260") in naziv ("Druge spremljajoče prevozne dejavnosti") — to je pogosto na registrskih straneh (CompanyWall, Bizi, AJPES) v razdelku "Osnovni podatki" ali podobno.
- "contact_person": če so na sliki navedeni direktorji, zastopniki, odgovorne osebe ali lastniki (npr. vrstice "Direktor", "Zastopnik", "Lastniki"), navedi VSA njihova imena, ločena z vejico (npr. "Komplet Jaka, Komplet Luka"). To polje je pogosto prezrto — bodi posebej pozoren nanj.
- "email": poišči kakršenkoli viden e-poštni naslov, tudi če je v majhni pisavi v tabeli kontaktov.
- "revenue_year" in "revenue_amount": če je na sliki viden letni prihodek/promet podjetja (npr. v razdelku "Finančni podatki"), navedi leto (npr. "2024") in znesek samo kot število brez valute/pik/vejic (npr. "185000"). Če je prikazanih več let, uporabi najnovejše.
- "notes": sem daj kratek povzetek preostalih pomembnih podatkov, ki ne sodijo drugam (npr. matična številka/MŠ, datum vpisa v register, velikost podjetja, bonitetna ocena, registrski organ).

Splošna pravila:
- Vsak vnos v "leads" naj ima vsaj "company_name".
- Polje izpolni samo, če je podatek dejansko viden/razviden na sliki. Če ga ni, polje izpusti (ne izmišljuj).
- Telefonske številke in email prepiši natančno tako, kot so zapisani.
- Če slika ne vsebuje uporabnega leada, jo preprosto ne upoštevaj (ne vrni praznega vnosa zanjo).

Primer odgovora za dve slike istega podjetja + eno drugo podjetje: {"leads": [{"company_name": "Primer d.o.o.", "vat_id": "SI12345678", "contact_person": "Janez Novak", "email": "info@primer.si", "revenue_year": "2024", "revenue_amount": "185000", "skd_code": "62.010", "skd_name": "Računalniško programiranje"}, {"company_name": "Drugo podjetje d.o.o.", "phone": "+386 40 123 456"}]}`;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka." },
      { status: 401 }
    );
  }

  let imageDataUrls: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.imageDataUrls)) {
      imageDataUrls = body.imageDataUrls.filter((u: unknown) => typeof u === "string");
    } else if (typeof body?.imageDataUrl === "string") {
      imageDataUrls = [body.imageDataUrl];
    }
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  if (imageDataUrls.length === 0) {
    return NextResponse.json({ error: "Manjkajo slike." }, { status: 400 });
  }

  if (imageDataUrls.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `Naenkrat lahko naložite največ ${MAX_IMAGES} slik.` },
      { status: 400 }
    );
  }

  if (!imageDataUrls.every((u) => u.startsWith("data:image/"))) {
    return NextResponse.json({ error: "Neveljavna slika v zahtevi." }, { status: 400 });
  }

  const totalChars = imageDataUrls.reduce((sum, u) => sum + u.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return NextResponse.json(
      { error: "Slike so skupaj prevelike. Poskusite z manj ali manjšimi slikami." },
      { status: 413 }
    );
  }

  try {
    type RawLead = Partial<Record<ImportField, string>> & {
      revenue_year?: string;
      revenue_amount?: string;
      skd_code?: string;
      skd_name?: string;
    };

    const parsed = await chatJSONWithImages<{ leads?: RawLead[] }>(
      SYSTEM_PROMPT,
      "Izlušči podatke o leadih iz priloženih slik in jih vrni v zahtevani JSON obliki. Slike, ki pripadajo istemu podjetju, združi v en vnos. Pozorno preberi tudi manjše besedilo in vse tabele/stolpce, ne le naslove.",
      imageDataUrls,
      { imageDetail: "high" }
    );

    const rawLeads = Array.isArray(parsed.leads) ? parsed.leads : [];
    const leads = rawLeads
      .map((raw) => {
        const fields: Partial<Record<ImportField, string>> & {
          revenue_year?: string;
          revenue_amount?: string;
          skd_code?: string;
          skd_name?: string;
        } = {};
        for (const field of IMPORT_FIELDS) {
          const value = raw[field];
          if (typeof value === "string" && value.trim()) {
            fields[field] = value.trim().slice(0, 2000);
          }
        }
        if (typeof raw.revenue_year === "string" && raw.revenue_year.trim()) {
          fields.revenue_year = raw.revenue_year.trim().slice(0, 20);
        }
        if (typeof raw.revenue_amount === "string" && raw.revenue_amount.trim()) {
          fields.revenue_amount = raw.revenue_amount.replace(/[^\d.]/g, "").slice(0, 20);
        }
        if (typeof raw.skd_code === "string" && raw.skd_code.trim()) {
          fields.skd_code = raw.skd_code.trim().slice(0, 20);
        }
        if (typeof raw.skd_name === "string" && raw.skd_name.trim()) {
          fields.skd_name = raw.skd_name.trim().slice(0, 200);
        }
        return fields;
      })
      .filter((fields) => Boolean(fields.company_name));

    if (leads.length === 0) {
      return NextResponse.json(
        {
          error:
            "AI na slikah ni prepoznal nobenega imena podjetja. Poskusite z jasnejšimi slikami ali vnesite ročno.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ leads });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Prepoznavanje slik ni uspelo." },
      { status: 502 }
    );
  }
}
