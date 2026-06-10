import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Color,
  type ColorRepresentation,
} from 'three';

/** Opções de {@link Terrain}. */
export interface TerrainOptions {
  /** Largura × profundidade em unidades de mundo (XZ). Número = quadrado. Default `50`. */
  size?: number | [number, number];
  /**
   * Segmentos por lado (resolução da grade) — `(resolution+1)²` vértices. Mais =
   * detalhe mais fino, heightmap maior. Default `64`.
   */
  resolution?: number;
  /** Heightmap inicial (row-major, `(res+1)²` alturas) — restaura a autoria. */
  heights?: number[];
  /** Cor base do material. Default verde-grama. */
  color?: ColorRepresentation;
}

/**
 * **Terreno** estilo Unity: um plano horizontal (no chão, XZ) subdividido numa
 * grade, com um **heightmap** que você **esculpe** ({@link Terrain.sculpt}) —
 * levanta/abaixa a altura (Y) dos vértices com um pincel de falloff suave. Pensado
 * pra jogos top-down/3D (combine com a câmera top-down). O heightmap é serializável
 * ({@link Terrain.getHeights}) — o editor persiste e o {@link buildScene} restaura.
 *
 * O mesh fica em `terrain.mesh` (centrado na origem local; posicione o objeto). O
 * controlador é guardado em `mesh.userData.cortexTerrain` pra o editor esculpir.
 *
 * @example
 * const terrain = new Terrain({ size: 60, resolution: 96 })
 * scene.add(terrain.mesh)
 * terrain.sculpt(0, 0, 8, 2) // levanta um morro de raio 8 no centro
 */
export class Terrain {
  /** O mesh do terreno (adicione à cena). */
  readonly mesh: Mesh;
  /** Segmentos por lado (grade `(resolution+1)²`). */
  readonly resolution: number;
  /** Largura (X) em unidades de mundo. */
  readonly width: number;
  /** Profundidade (Z) em unidades de mundo. */
  readonly depth: number;

  private readonly heights: Float32Array;
  private readonly geometry: BufferGeometry;

  constructor(options: TerrainOptions = {}) {
    const size = options.size ?? 50;
    this.width = Array.isArray(size) ? size[0] : size;
    this.depth = Array.isArray(size) ? size[1] : size;
    this.resolution = Math.max(1, Math.floor(options.resolution ?? 64));
    const n = this.resolution + 1;

    this.heights = new Float32Array(n * n);
    if (options.heights) this.heights.set(options.heights.slice(0, n * n));

    const positions = new Float32Array(n * n * 3);
    const uvs = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        positions[idx * 3] = (i / this.resolution - 0.5) * this.width;
        positions[idx * 3 + 1] = this.heights[idx]!;
        positions[idx * 3 + 2] = (j / this.resolution - 0.5) * this.depth;
        uvs[idx * 2] = i / this.resolution;
        uvs[idx * 2 + 1] = j / this.resolution;
      }
    }
    const indices: number[] = [];
    for (let j = 0; j < this.resolution; j++) {
      for (let i = 0; i < this.resolution; i++) {
        const a = j * n + i;
        const b = j * n + i + 1;
        const c = (j + 1) * n + i;
        const d = (j + 1) * n + i + 1;
        indices.push(a, c, b, b, c, d); // viradas pra cima (+Y)
      }
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const material = new MeshStandardMaterial({
      color: options.color !== undefined ? new Color(options.color) : new Color(0x6ab04c),
      roughness: 1,
      metalness: 0,
    });
    this.mesh = new Mesh(geo, material);
    this.mesh.receiveShadow = true;
    (this.mesh.userData as Record<string, unknown>)['cortexTerrain'] = this;
  }

  /** Altura X/Z (local) de um vértice da grade — usado internamente e em testes. */
  private vertexXZ(i: number, j: number): [number, number] {
    return [(i / this.resolution - 0.5) * this.width, (j / this.resolution - 0.5) * this.depth];
  }

  /**
   * **Esculpe** o terreno: soma `delta` à altura num círculo de `radius` (em
   * coordenadas LOCAIS do terreno, no plano XZ centrado), com **falloff suave**
   * (cheio no centro → 0 na borda). `delta > 0` levanta, `< 0` abaixa. Recalcula
   * normais (iluminação acompanha). Retorna `true` se algum vértice mudou.
   */
  sculpt(localX: number, localZ: number, radius: number, delta: number): boolean {
    if (radius <= 0 || delta === 0) return false;
    const n = this.resolution + 1;
    const pos = this.geometry.getAttribute('position') as Float32BufferAttribute;
    const r2 = radius * radius;
    let changed = false;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const [vx, vz] = this.vertexXZ(i, j);
        const dx = vx - localX;
        const dz = vz - localZ;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        const tdist = 1 - Math.sqrt(d2) / radius; // 1 centro → 0 borda
        const w = tdist * tdist * (3 - 2 * tdist); // smoothstep
        const idx = j * n + i;
        this.heights[idx]! += delta * w;
        pos.setY(idx, this.heights[idx]!);
        changed = true;
      }
    }
    if (changed) {
      pos.needsUpdate = true;
      this.geometry.computeVertexNormals();
      this.geometry.computeBoundingSphere();
    }
    return changed;
  }

  /**
   * Altura (Y **local**) do terreno num ponto `(localX, localZ)` por **interpolação
   * bilinear** do heightmap — pra colisão/ground (o player fica em cima). Retorna
   * `null` se o ponto está **fora** da área do terreno. Coords locais (centradas);
   * use `mesh.worldToLocal` antes pra partir de um ponto de mundo.
   */
  heightAt(localX: number, localZ: number): number | null {
    const hw = this.width / 2;
    const hd = this.depth / 2;
    if (localX < -hw || localX > hw || localZ < -hd || localZ > hd) return null;
    const n = this.resolution + 1;
    const gx = (localX / this.width + 0.5) * this.resolution; // 0..resolution
    const gz = (localZ / this.depth + 0.5) * this.resolution;
    const i0 = Math.min(Math.floor(gx), this.resolution - 1);
    const j0 = Math.min(Math.floor(gz), this.resolution - 1);
    const fx = gx - i0;
    const fz = gz - j0;
    const h00 = this.heights[j0 * n + i0]!;
    const h10 = this.heights[j0 * n + i0 + 1]!;
    const h01 = this.heights[(j0 + 1) * n + i0]!;
    const h11 = this.heights[(j0 + 1) * n + i0 + 1]!;
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  /** Heightmap atual (row-major, `(res+1)²`) — serializável pra persistência. */
  getHeights(): number[] {
    return Array.from(this.heights);
  }

  /** Substitui o heightmap inteiro (ex.: restaurar autoria salva) e atualiza o mesh. */
  setHeights(heights: number[]): void {
    const n = this.resolution + 1;
    this.heights.set(heights.slice(0, n * n));
    const pos = this.geometry.getAttribute('position') as Float32BufferAttribute;
    for (let k = 0; k < n * n; k++) pos.setY(k, this.heights[k]!);
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}
