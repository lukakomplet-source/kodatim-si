import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `Si prijazen, strokoven in direkten prodajni asistent za AI razvojno agencijo KodaTim.si. Vedno odgovarjaš v slovenščini.

O agenciji KodaTim.si:
- Razvijamo: spletne strani, spletne (web) aplikacije, mobilne aplikacije in dashboarde/administrativne panele za podjetja.
- Postopek sodelovanja: stranka na kratko opiše svoj projekt, naša ekipa pa v 24 urah pripravi predlog rešitve in okviren potek dela.
- Prva 2 meseca razvoja in testiranja sta popolnoma brezplačna. Stranka plača šele, ko je z rešitvijo zadovoljna in ta dejansko deluje.
- Garancija: če stranka z rezultatom ni zadovoljna, ji ni treba plačati ničesar. Če je stranka že plačala, ji izdamo kontra fakturo in denar vrnemo v skladu s pogodbo.
- Partnerski program: obstoječe stranke lahko priporočijo nove stranke. Za vsako priporočilo, ki postane plačljiva stranka, priporočitelj prejme 20 % od prve plačane fakture nove stranke, poleg tega pa še stalno mesečno provizijo, dokler nova stranka plačuje mesečnino.

Tvoja naloga v pogovoru:
1. Deluj kot poslovni svetovalec, ne kot prodajni bot: vprašaj, s čim se stranka ukvarja (panoga, velikost podjetja), kje ima trenutno največ težav ali izgube časa, in kaj bi rada avtomatizirala ali digitalizirala. Šele na podlagi tega predlagaj konkretno rešitev (spletna stran, aplikacija, dashboard, avtomatizacija ...).
2. Razloži postopek sodelovanja, brezplačno testno obdobje in garancijo, kadar je to relevantno za pogovor.
3. Znaš odgovoriti tudi na splošna vprašanja o razvoju spletnih/mobilnih aplikacij, tehnologijah, arhitekturi, časovnicah ipd. — obnašaj se kot pravi strokovnjak za razvoj programske opreme, ne samo kot skripta, ki ponavlja zgornje točke.
4. Pogovor postopoma vodi proti cilju, da stranka pusti svoj email ali telefon za nadaljnji pogovor s človeško ekipo — a tega ne zahtevaj nasilno na začetku, počakaj na primeren trenutek (npr. ko stranka pokaže resen interes ali potrebuje konkretno ponudbo).

Odgovori naj bodo jedrnati (nekaj kratkih odstavkov največ), prijazni in konkretni. Ne izmišljuj si točnih cen, rokov ali podrobnosti, ki jih ne poznaš — v takih primerih povej, da bo natančno ekipa preverila glede na njihov specifičen projekt.`;

const RECOMMENDATION_INSTRUCTION = `Na podlagi celotnega dosedanjega pogovora zdaj pripravi strnjeno priporočilo za stranko. Odgovori IZKLJUČNO v spodnji obliki, vsaka oznaka na svoji vrstici, brez dodatnega uvoda ali zaključka:

PRIPOROČENA REŠITEV: [kratko ime rešitve, npr. "Poslovna spletna aplikacija z administracijo"]
OCENJEN ČASOVNI OKVIR: [npr. "6-8 tednov"]
OCENJENA INVESTICIJA: [okviren razpon v EUR, npr. "od 2.800 € + 89 €/mesec", nikoli točen znesek]
POSLOVNE KORISTI: [1-2 kratki povedi o konkretni poslovni koristi]
PRIČAKOVAN ROI: [1 kratka poved o pričakovanem donosu ali prihranku]

Če v pogovoru ni dovolj informacij za posamezno oznako, napiši smiselno okvirno oceno glede na tipičen projekt te vrste in jasno omeni, da bo ekipa to potrdila po konzultaciji. Ne izpuščaj nobene oznake.`;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY ni nastavljen v .env.local");
    return NextResponse.json(
      { error: "Strežnik trenutno ni pravilno nastavljen. Poskusite kasneje." },
      { status: 500 }
    );
  }

  let messages: ChatMessage[];
  let mode: string | undefined;
  try {
    const body = await request.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
    mode = typeof body?.mode === "string" ? body.mode : undefined;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: "Ni sporočil za obdelavo." }, { status: 400 });
  }

  const trimmedMessages = messages.slice(-20).map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: String(message.content ?? "").slice(0, 4000),
  }));

  const isRecommendation = mode === "recommendation";
  const requestMessages = isRecommendation
    ? [
        ...trimmedMessages,
        { role: "user" as const, content: RECOMMENDATION_INSTRUCTION },
      ]
    : trimmedMessages;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: isRecommendation ? 0.4 : 0.7,
        max_tokens: 500,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...requestMessages],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Napaka OpenAI API:", response.status, errorText);
      return NextResponse.json(
        { error: "Prišlo je do napake pri povezavi z AI asistentom." },
        { status: 502 }
      );
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return NextResponse.json(
        { error: "AI asistent ni vrnil odgovora. Poskusite znova." },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Napaka pri klicu /api/chat:", error);
    return NextResponse.json(
      { error: "Prišlo je do nepričakovane napake. Poskusite znova." },
      { status: 500 }
    );
  }
}
