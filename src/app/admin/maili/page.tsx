import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/require-admin";
import { preberiDelavca, preberiPosiljanja } from "@/lib/prodajna-ekipa";
import { OdobritevMape } from "../prodajna-ekipa/OdobritevMape";

/**
 * Maili: vse, kar Luka pošlje ali odobri, na enem mestu (Luka, 28. 10. 2026: »sploh nevem kak naj pridem nazaj
 * pod tisto panicbutnoni pa hoteli booking«). Mape (Hoteli, Panik gumb …) z »Odpri v Outlooku«, poslanimi in
 * odpisi; prej je bilo to skrito pod Prodajna ekipa → Ti — odobritev. Stara stran E-pošta preusmeri sem.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Maili" };

const LISTMONK_URL = process.env.NEXT_PUBLIC_LISTMONK_URL || "https://listmonk.kodatim.si";

export default async function MailiPage() {
  await requireAdmin();
  const [podrobnosti, posiljanja] = await Promise.all([preberiDelavca("odobritev"), preberiPosiljanja()]);

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Maili</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Vsaka mapa je ena kampanja: zgoraj koliko si poslal in kdo je odpisal, spodaj maili, ki čakajo nate. Pošlješ
        jih sam – »Odpri v Outlooku«, preglej, Pošlji.
      </p>

      <div className="mt-6">
        {podrobnosti ? (
          <OdobritevMape podrobnosti={podrobnosti} posiljanja={posiljanja?.podjetja} />
        ) : (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Harvey trenutno ne odgovarja, zato map ni mogoče prebrati. Poskusi čez minuto.
          </p>
        )}
      </div>

      <p className="mt-8 text-sm text-zinc-500">
        Novice in obvestila strankam (ne hladni maili) urejaš v{" "}
        <a
          href={LISTMONK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-zinc-900"
        >
          Listmonku <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        .
      </p>
    </div>
  );
}
