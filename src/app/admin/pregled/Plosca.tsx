import type { ReactNode } from "react";

export type PloscaProps = {
  /** id naslova (aria-labelledby razdelka). */
  id: string;
  naslov: ReactNode;
  /** Ena vrstica pod naslovom. */
  opis?: ReactNode;
  /** Desno od naslova (npr. izbira pogleda). */
  desno?: ReactNode;
  /** h2 za razdelek strani, h3 za ploščo znotraj razdelka (Prihodki: graf, po produktu). */
  raven?: "h2" | "h3";
  className?: string;
  /** Odmiki telesa; tabela gre od roba do roba, zato ima svoje. */
  teloClassName?: string;
  children: ReactNode;
};

/**
 * Plošča Pregleda: isti okvir, glava in odmiki za Lijak, tabelo, Koledar in Prihodke. Drobno besedilo je najmanj
 * 12 px; text-zinc-400 samo za onemogočeno ali prihodnje.
 */
export function Plosca({
  id,
  naslov,
  opis,
  desno,
  raven = "h2",
  className = "",
  teloClassName = "px-4 pb-4 pt-4 sm:px-5 sm:pb-5",
  children,
}: PloscaProps) {
  const Naslov = raven;
  return (
    <section aria-labelledby={id} className={`@container rounded-xl bg-white ring-1 ring-zinc-200 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <Naslov id={id} className="text-[15px] font-semibold text-zinc-900">
            {naslov}
          </Naslov>
          {opis ? <div className="mt-1 max-w-3xl text-sm text-zinc-500">{opis}</div> : null}
        </div>
        {desno}
      </div>
      <div className={teloClassName}>{children}</div>
    </section>
  );
}
