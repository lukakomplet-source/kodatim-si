import { execFile } from "node:child_process";
import { promisify } from "node:util";

const izvedi = promisify(execFile);

/**
 * Koliko je stroj zaseden — procesor, pomnilnik in grafična kartica.
 *
 * Stran teče na istem računalniku kot zbiralnik, arhivar in lokalni model, zato
 * se te številke berejo neposredno iz sistema in ne iz baze: v trenutku, ko
 * gledaš konzolo, te zanima stanje ZDAJ, ne stanje ob zadnji objavi delavca.
 *
 * Vsak podatek se bere ločeno in vsaka napaka pomeni le manjkajočo številko —
 * konzola mora delati tudi na stroju brez NVIDIA kartice ali brez pravic do
 * števcev.
 */

export type Sistem = {
  cpuOdstotek: number | null;
  ramUporabljenoGb: number | null;
  ramSkupajGb: number | null;
  vramUporabljenoGb: number | null;
  vramSkupajGb: number | null;
  gpuOdstotek: number | null;
  gpuIme: string | null;
};

const PRAZNO: Sistem = {
  cpuOdstotek: null,
  ramUporabljenoGb: null,
  ramSkupajGb: null,
  vramUporabljenoGb: null,
  vramSkupajGb: null,
  gpuOdstotek: null,
  gpuIme: null,
};

async function grafična(): Promise<Partial<Sistem>> {
  try {
    const { stdout } = await izvedi(
      "C:\\Windows\\System32\\nvidia-smi.exe",
      ["--query-gpu=name,memory.used,memory.total,utilization.gpu", "--format=csv,noheader,nounits"],
      { timeout: 8000 }
    );
    const [ime, uporabljeno, skupaj, util] = stdout.trim().split("\n")[0].split(",").map((v) => v.trim());
    return {
      gpuIme: ime,
      vramUporabljenoGb: Number(uporabljeno) / 1024,
      vramSkupajGb: Number(skupaj) / 1024,
      gpuOdstotek: Number(util),
    };
  } catch {
    return {};
  }
}

async function procesorInPomnilnik(): Promise<Partial<Sistem>> {
  try {
    // Ena sama PowerShell seja za oboje: zagon lupine je dražji od meritve.
    const ukaz = [
      "-NoProfile",
      "-Command",
      "$c=(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average;" +
        "$o=Get-CimInstance Win32_OperatingSystem;" +
        "Write-Output ($c.ToString() + ';' + $o.TotalVisibleMemorySize + ';' + $o.FreePhysicalMemory)",
    ];
    const { stdout } = await izvedi("powershell.exe", ukaz, { timeout: 12000 });
    const [cpu, skupajKb, prostoKb] = stdout.trim().split(";").map((v) => Number(v));
    const skupajGb = skupajKb / 1024 / 1024;
    return {
      cpuOdstotek: Number.isFinite(cpu) ? cpu : null,
      ramSkupajGb: skupajGb,
      ramUporabljenoGb: skupajGb - prostoKb / 1024 / 1024,
    };
  } catch {
    return {};
  }
}

/**
 * Zadnja meritev, da vsak izris konzole ne zaganja dveh zunanjih procesov.
 *
 * Stran se osvezuje in vsak obisk je prej pomenil nov nvidia-smi in nov
 * PowerShell. Merjeno je to sicer hitro (0,2 in 0,4 s), a je zaganjanje
 * procesov ob vsakem izrisu nepotrebno tveganje na stroju, ki hkrati skrejpa,
 * arhivira in poganja model. Dvajset sekund starosti je za prikaz obremenitve
 * povsem dovolj — nadzorna stran se osvežuje na 30 s, zato ob vsakem izrisu
 * nastane največ en par procesov.
 */
let zadnja: { ob: number; vrednost: Sistem } | null = null;
const VELJAVNOST_MS = 20_000;

export async function preberiSistem(): Promise<Sistem> {
  if (zadnja && Date.now() - zadnja.ob < VELJAVNOST_MS) return zadnja.vrednost;
  const [gpu, cpu] = await Promise.all([grafična(), procesorInPomnilnik()]);
  const vrednost = { ...PRAZNO, ...gpu, ...cpu };
  zadnja = { ob: Date.now(), vrednost };
  return vrednost;
}
