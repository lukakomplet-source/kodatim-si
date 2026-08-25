import * as THREE from "three";

/**
 * Sprehod v prvi osebi: WASD/puščice + miška (pointer lock), Shift za tek.
 * Kolizije: navpičen valj (r = 0,35 m) proti AABB škatlam — po oseh, da ob
 * steni zdrsne. Ovire do 0,42 m nad stopali ne blokirajo (stopnice, pragovi);
 * po pohodnih površinah (`tla`) se hodi — višina tal se vzorči pod igralcem,
 * zato deluje hoja po zunanjem stopnišču in po etažah.
 */
export class Sprehod {
  polozaj = new THREE.Vector3(-16, 1.65, -2.2);
  yaw = Math.PI / 2;
  pitch = 0;
  private tipke = new Set<string>();
  private radij = 0.35;
  private kolizije: THREE.Box3[] = [];
  private tla: THREE.Box3[] = [];

  nastaviSvet(kolizije: THREE.Box3[], tla: THREE.Box3[]) {
    this.kolizije = kolizije;
    this.tla = tla;
  }

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

  update(dt: number) {
    const t = this.tipke;
    let naprej = 0;
    let vstran = 0;
    if (t.has("KeyW") || t.has("ArrowUp")) naprej += 1;
    if (t.has("KeyS") || t.has("ArrowDown")) naprej -= 1;
    if (t.has("KeyD") || t.has("ArrowRight")) vstran += 1;
    if (t.has("KeyA") || t.has("ArrowLeft")) vstran -= 1;

    const stopala = this.polozaj.y - 1.65;
    if (naprej || vstran) {
      const hitrost = (t.has("ShiftLeft") || t.has("ShiftRight") ? 5.4 : 2.7) * dt;
      const norm = Math.hypot(naprej, vstran) || 1;
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const dx = ((fx * naprej + fz * vstran) / norm) * hitrost;
      const dz = ((fz * naprej - fx * vstran) / norm) * hitrost;
      if (!this.trci(this.polozaj.x + dx, this.polozaj.z, stopala)) this.polozaj.x += dx;
      if (!this.trci(this.polozaj.x, this.polozaj.z + dz, stopala)) this.polozaj.z += dz;
      const r = Math.hypot(this.polozaj.x, this.polozaj.z);
      if (r > 110) {
        this.polozaj.x *= 110 / r;
        this.polozaj.z *= 110 / r;
      }
    }

    // višina tal pod igralcem: teren (0) ali najvišja pohodna površina,
    // ki ni več kot 0,45 m nad stopali (stopnica) in ne pod prejšnjo etažo
    let tlaY = 0;
    for (const b of this.tla) {
      if (
        this.polozaj.x > b.min.x - 0.05 &&
        this.polozaj.x < b.max.x + 0.05 &&
        this.polozaj.z > b.min.z - 0.05 &&
        this.polozaj.z < b.max.z + 0.05 &&
        b.max.y <= stopala + 0.45 &&
        b.max.y > tlaY
      ) {
        tlaY = b.max.y;
      }
    }
    const ciljY = tlaY + 1.65;
    const k = Math.min(1, dt * 12);
    this.polozaj.y += (ciljY - this.polozaj.y) * k;
  }

  private trci(x: number, z: number, stopala: number) {
    for (const b of this.kolizije) {
      if (b.max.y <= stopala + 0.42) continue; // stopnica/prag — čez
      if (b.min.y >= stopala + 1.75) continue; // nad glavo
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
