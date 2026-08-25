import HisaClient from "./HisaClient";

/**
 * 3D model hiše na Parmovi ulici 4 v Vojniku — obstoječe stanje po Street View,
 * prenova pa po PZI/IDZ načrtih, ko bodo dodani v docs/vojnik-nacrti/.
 * NOINDEX podeduje od (demo) layouta.
 */
export const metadata = { title: "3D model hiše — Parmova 4, Vojnik" };

export default function Hisa3DPage() {
  return <HisaClient />;
}
