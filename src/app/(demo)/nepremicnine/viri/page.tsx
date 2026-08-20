import { redirect } from "next/navigation";

/**
 * Stara stran "Viri" se je preselila v Research konzolo.
 *
 * Upravljanje virov je bilo prej na svoji strani, napredek pregleda pa nikjer.
 * Dve strani, ki obe kažeta stanje istega zbiralnika, bi se prej ali slej
 * razhajali, zato je ostala ena. Preusmeritev je tu zato, da stare zaznamke
 * in povezave ne odpelje v prazno.
 */
export default function NepViriPage() {
  redirect("/nepremicnine/pregled");
}
