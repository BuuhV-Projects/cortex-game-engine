/**
 * Grade XZ dos troncos de vegetação sólida (SPEC-0674): o empurrão de tronco do {@link CharacterPhysicsSystem}
 * testava TODAS as instâncias por quadro; com a grade, só as das células perto do personagem.
 */

/** Lado (m) da célula. */
export const TRUNK_CELL = 8;
/** Floats por tronco em `trunks`: `[x, z, raio]`. */
const TRUNK_STRIDE = 3;
/** Consulta que cobre mais células que isto devolve `null` (o laço linear é mais barato). */
const MAX_QUERY_CELLS = 64;
/** Chave da célula: `ix * KEY_SPAN + iz` (como no `NearMeshIndex`). */
const KEY_SPAN = 65536;

export class TrunkGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly picked: number[] = [];
  /** Maior raio de tronco da lista (a consulta alcança os centros até ele além do pedido). */
  private maxRadius = 0;

  /** Distribui os troncos (`[x, z, raio]` por tronco) pela célula do centro de cada um. */
  rebuild(trunks: readonly number[]): void {
    for (const [key, list] of this.cells) {
      if (list.length === 0) this.cells.delete(key);
      else list.length = 0;
    }
    this.maxRadius = 0;
    for (let i = 0; i < trunks.length; i += TRUNK_STRIDE) {
      const r = trunks[i + 2]!;
      if (r > this.maxRadius) this.maxRadius = r;
      const key = Math.floor(trunks[i]! / TRUNK_CELL) * KEY_SPAN + Math.floor(trunks[i + 1]! / TRUNK_CELL);
      let list = this.cells.get(key);
      if (!list) this.cells.set(key, (list = []));
      list.push(i / TRUNK_STRIDE);
    }
  }

  /**
   * Índices (crescentes) dos troncos cujo centro pode estar a até `reach + maior raio` de (x, z), ou `null` se a
   * consulta for grande demais (o chamador faz o laço linear). Conservador: nunca deixa de fora um tronco que esteja
   * nessa distância. A lista é da grade: use antes da próxima consulta.
   */
  near(x: number, z: number, reach: number): number[] | null {
    const r = reach + this.maxRadius;
    const ix0 = Math.floor((x - r) / TRUNK_CELL);
    const iz0 = Math.floor((z - r) / TRUNK_CELL);
    const ix1 = Math.floor((x + r) / TRUNK_CELL);
    const iz1 = Math.floor((z + r) / TRUNK_CELL);
    if (!((ix1 - ix0 + 1) * (iz1 - iz0 + 1) <= MAX_QUERY_CELLS)) return null;
    const out = this.picked;
    out.length = 0;
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const list = this.cells.get(ix * KEY_SPAN + iz);
        if (!list) continue;
        for (let j = 0; j < list.length; j++) out.push(list[j]!);
      }
    }
    // a ordem do laço linear: cada tronco está numa célula só, então não há repetição
    for (let a = 1; a < out.length; a++) {
      const v = out[a]!;
      let c = a;
      while (c > 0 && out[c - 1]! > v) {
        out[c] = out[c - 1]!;
        c--;
      }
      out[c] = v;
    }
    return out;
  }
}
