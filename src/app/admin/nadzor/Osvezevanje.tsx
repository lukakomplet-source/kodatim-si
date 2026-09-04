"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Samodejno osveževanje nadzorne strani — zmerno in samo, ko jo kdo gleda.
 *
 * Vsak izris pomeni nekaj poizvedb v bazo, dva klica delavcem in (redkeje,
 * zaradi predpomnilnika) zagon nvidia-smi in PowerShella. Na stroju, ki je ob
 * prvem izrisu kazal 100 % procesorja, tega ne sme sprožati skrit zavihek na
 * drugem zaslonu — zato se ob skritem zavihku štoparica ustavi in ob vrnitvi
 * takoj osveži.
 */
export function Osvezevanje({ vsakoS }: { vsakoS: number }) {
  const router = useRouter();

  useEffect(() => {
    let stoparica: ReturnType<typeof setInterval> | null = null;

    const zazeni = () => {
      if (stoparica) return;
      stoparica = setInterval(() => router.refresh(), vsakoS * 1000);
    };
    const ustavi = () => {
      if (!stoparica) return;
      clearInterval(stoparica);
      stoparica = null;
    };
    const obVidnosti = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        zazeni();
      } else {
        ustavi();
      }
    };

    if (document.visibilityState === "visible") zazeni();
    document.addEventListener("visibilitychange", obVidnosti);
    return () => {
      ustavi();
      document.removeEventListener("visibilitychange", obVidnosti);
    };
  }, [router, vsakoS]);

  return null;
}
