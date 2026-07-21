import { System } from '../ecs/System.js';

/**
 * **Streaming de células** (M-perf-4 / ADR-0138) — o sistema que mantém só as
 * células PRÓXIMAS da câmera residentes na cena, carregando/descarregando o
 * resto conforme o jogador anda. É o que permite um mundo-aberto grande (GTA):
 * a cidade toda existe como DADO, mas só um raio ao redor do jogador é montado —
 * o render/traversal (e a memória) escalam com o raio, não com o mundo.
 *
 * A lógica de residência é **pura** ({@link CellStreamingSystem.step}, testável):
 * dado o centro XZ da câmera, decide o que carregar (dentro do raio, por
 * distância, respeitando um orçamento por frame) e o que descarregar (além de
 * `raio + histerese` — a histerese evita thrash na borda). O BUILD/DISPOSE de
 * verdade é do chamador (callbacks `onLoad`/`onUnload`), porque montar uma célula
 * é lógica de app (buildScene dos nós da célula) — o engine só orquestra QUANDO.
 */

/** Uma célula do mundo: chave estável + centro no plano XZ. */
export interface StreamingCell {
  /** Identificador estável (ex.: `"3,7"`). */
  key: string;
  /** Centro da célula no eixo X. */
  x: number;
  /** Centro da célula no eixo Z. */
  z: number;
}

/** Ponto no plano XZ (posição da câmera/jogador). */
export interface Vec2XZ {
  x: number;
  z: number;
}

/** Opções do {@link CellStreamingSystem}. */
export interface CellStreamingOptions {
  /** Raio de carga (m): células com centro dentro dele viram residentes. */
  radius: number;
  /**
   * Folga de descarga (m): só descarrega além de `radius + hysteresis`. Evita
   * carregar/descarregar em loop quando a câmera fica na borda. Default `radius/4`.
   */
  hysteresis?: number;
  /** Máx. de células carregadas POR FRAME (espalha o custo). Default `1`. */
  budgetPerFrame?: number;
  /** Posição XZ da câmera/jogador a cada tick. */
  getCameraXZ: () => Vec2XZ;
  /**
   * Monta a célula (o app faz buildScene dos nós dela). Pode ser **assíncrono**
   * (carga sob demanda): enquanto a Promise não resolve, a célula conta como
   * "carregando" ({@link CellStreamingSystem.loadingCount}) — o dev usa isso pra
   * uma tela de loading. O app deve conferir se a célula ainda é desejada
   * ({@link CellStreamingSystem.isResident}) antes de adicioná-la (pode ter saído
   * do raio durante a carga).
   */
  onLoad: (key: string) => void | Promise<unknown>;
  /** Descarta a célula (o app remove/libera a GPU). */
  onUnload: (key: string) => void;
  /** Chamado quando o nº de células carregando muda (pra atualizar a tela de loading). */
  onProgress?: (loading: number, resident: number) => void;
}

const DEFAULT_BUDGET = 1;
const HYSTERESIS_FRACTION = 0.25;

/** Distância² no plano XZ (evita a raiz — comparação por quadrado). */
function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export class CellStreamingSystem extends System {
  /** Roda ANTES de tudo — o render vê a residência já atualizada neste frame. */
  override priority = -1000;

  private readonly loadR2: number;
  private readonly unloadR2: number;
  private readonly budget: number;
  /** Células com `onLoad` já chamado (residentes/desejadas — evita re-pedir). */
  private readonly loaded = new Set<string>();
  /** Subconjunto de `loaded` cujo `onLoad` async ainda não terminou. */
  private readonly building = new Set<string>();

  constructor(
    private readonly cells: StreamingCell[],
    private readonly opts: CellStreamingOptions,
  ) {
    super();
    const hysteresis = opts.hysteresis ?? opts.radius * HYSTERESIS_FRACTION;
    this.loadR2 = opts.radius * opts.radius;
    this.unloadR2 = (opts.radius + hysteresis) * (opts.radius + hysteresis);
    this.budget = Math.max(1, opts.budgetPerFrame ?? DEFAULT_BUDGET);
  }

  override update(): void {
    this.step(this.opts.getCameraXZ());
  }

  /**
   * Passo puro do streaming (testável): descarrega o que saiu de `raio+histerese`
   * e carrega, por distância e até o orçamento, o que entrou no raio.
   */
  step(cam: Vec2XZ): void {
    const before = this.building.size;

    // 1) Descarga: residentes além de raio+histerese.
    for (const key of [...this.loaded]) {
      const cell = this.cellByKey(key);
      if (!cell) continue;
      if (dist2(cam.x, cam.z, cell.x, cell.z) > this.unloadR2) {
        this.loaded.delete(key);
        this.building.delete(key);
        this.opts.onUnload(key);
      }
    }

    // 2) Carga: candidatas dentro do raio, ainda não residentes, por distância.
    const candidates: Array<{ key: string; d2: number }> = [];
    for (const cell of this.cells) {
      if (this.loaded.has(cell.key)) continue;
      const d2 = dist2(cam.x, cam.z, cell.x, cell.z);
      if (d2 <= this.loadR2) candidates.push({ key: cell.key, d2 });
    }
    candidates.sort((a, b) => a.d2 - b.d2);

    for (let i = 0; i < candidates.length && i < this.budget; i++) {
      const key = candidates[i]!.key;
      this.loaded.add(key);
      this.building.add(key);
      const result = this.opts.onLoad(key);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        // Carga assíncrona: sai de "building" quando terminar (só se ainda desejada).
        void (result as Promise<unknown>).finally(() => this.markBuilt(key));
      } else {
        this.building.delete(key); // onLoad síncrono → pronta na hora
      }
    }

    if (this.building.size !== before) this.reportProgress();
  }

  private markBuilt(key: string): void {
    if (!this.building.delete(key)) return;
    this.reportProgress();
  }

  private reportProgress(): void {
    this.opts.onProgress?.(this.building.size, this.loaded.size);
  }

  /** Chaves residentes agora (desejadas — inclui as ainda carregando). */
  get resident(): ReadonlySet<string> {
    return this.loaded;
  }

  /** A célula `key` é desejada agora? (o app confere antes de adicionar à cena.) */
  isResident(key: string): boolean {
    return this.loaded.has(key);
  }

  /** Nº de células residentes (desejadas) agora. */
  get residentCount(): number {
    return this.loaded.size;
  }

  /** Nº de células ainda CARREGANDO (onLoad async não terminou) — pra tela de loading. */
  get loadingCount(): number {
    return this.building.size;
  }

  private cellByKey(key: string): StreamingCell | undefined {
    return this.cells.find((c) => c.key === key);
  }
}
