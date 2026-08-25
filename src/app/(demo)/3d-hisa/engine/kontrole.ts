import * as THREE from "three";

/**
 * Sprehod v prvi osebi: WASD/puščice + miška (pointer lock), Shift za tek.
 * Kolizije so poenostavljene — igralec je navpičen valj (r = 0,35 m), ki ga
 * AABB škatle sveta ustavijo po oseh, zato ob steni zdrsne, ne obtiči.
 */
export class Sprehod {
  polozaj = new THREE.Vector3(-16, 1.65, -2.2);
  yaw = Math.PI / 2; // pogled proti hiši (vzhod), naravnost na uvoz dovoza
  pitch = 0;
  private tipke = new Set<string>();
  private radij = 0.35;

  premakniMisko(dx: number, dy: number) {
    this.yaw -= dx * 0.0022;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0022));
  }

  tipka(koda: string, pritisnjena: boolean) {
    if (pritisnjena) this.tipke.add(koda);
    else this.tipke.delete(koda);
  }

  spustiVse() {
    this.tipke.clear();
  }

  smerPogleda(cilj: THREE.Vector3) {
    cilj.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    return cilj;
  }

  update(dt: number, kolizije: THREE.Box3[]) {
    const t = this.tipke;
    let naprej = 0;
    let vstran = 0;
    if (t.has("KeyW") || t.has("ArrowUp")) naprej += 1;
    if (t.has("KeyS") || t.has("ArrowDown")) naprej -= 1;
    if (t.has("KeyD") || t.has("ArrowRight")) vstran += 1;
    if (t.has("KeyA") || t.has("ArrowLeft")) vstran -= 1;
    if (!naprej && !vstran) return;

    const hitrost = (t.has("ShiftLeft") || t.has("ShiftRight") ? 5.4 : 2.7) * dt;
    const norm = Math.hypot(naprej, vstran) || 1;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const dx = ((fx * naprej + fz * vstran) / norm) * hitrost;
    const dz = ((fz * naprej - fx * vstran) / norm) * hitrost;

    // premik po oseh, da ob oviri zdrsne ob steni
    if (!this.trci(this.polozaj.x + dx, this.polozaj.z, kolizije)) this.polozaj.x += dx;
    if (!this.trci(this.polozaj.x, this.polozaj.z + dz, kolizije)) this.polozaj.z += dz;

    // ostani znotraj modeliranega sveta
    const r = Math.hypot(this.polozaj.x, this.polozaj.z);
    if (r > 110) {
      this.polozaj.x *= 110 / r;
      this.polozaj.z *= 110 / r;
    }
  }

  private trci(x: number, z: number, kolizije: THREE.Box3[]) {
    for (const b of kolizije) {
      if (b.max.y < 0.25 || b.min.y > 1.75) continue; // prenizko/previsoko, hodimo mimo
      if (
        x + this.radij > b.min.x &&
        x - this.radij < b.max.x &&
        z + this.radij > b.min.z &&
        z - this.radij < b.max.z
      ) {
        return true;
      }
    }
    return false;
  }
}
