import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  Color,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  TextureLoader,
  UnsignedByteType,
  type ColorRepresentation,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { texture as textureNode, uv, uniform, mix, clamp, max } from 'three/tsl';

/** Helper só pra extrair o tipo concreto do nó uniform numérico (TS). */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const uniformNumber = (v: number) => uniform(v);
type RepeatNode = ReturnType<typeof uniformNumber>;

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

/** Uma camada de textura pintável do terreno (splat). */
export interface TerrainPaintLayer {
  /** Caminho da textura (relativo ao projeto, ex. `assets/textures/grama.png`). */
  url: string;
  /** Quantas vezes a textura repete ao longo do terreno inteiro (tiling). */
  repeat: number;
}

/** Pintura do terreno serializável (camadas + splatmap) — persistência do editor. */
export interface TerrainPaintData {
  /** Camadas em uso (1–4; o índice é o canal RGBA do splatmap). */
  layers: TerrainPaintLayer[];
  /** Lado do splatmap (quadrado, `size×size` texels). */
  size: number;
  /** Pesos RGBA do splatmap (`size*size*4` bytes) em base64. */
  splat: string;
}

/** Lado default do splatmap (256² texels — suficiente pra terrenos de ~128u). */
const SPLAT_SIZE = 256;
/** Máximo de camadas pintáveis (1 canal RGBA do splatmap por camada). */
export const TERRAIN_MAX_LAYERS = 4;

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
  /**
   * Delta de moldagem por estrada (cut & fill, ADR-0072 Fase 2) — **não-destrutivo**:
   * o mesh/colisão usam `heights + roadDelta`, mas {@link Terrain.getHeights} devolve
   * só a base autorada (a cicatriz da estrada é recalculada a cada build, não salva).
   */
  private roadDelta: Float32Array | null = null;
  private readonly geometry: BufferGeometry;

  // ── Pintura de textura (splat) — criada sob demanda no primeiro paint/setPaint ──
  private splatData: Uint8Array | null = null;
  private splatTexture: DataTexture | null = null;
  private splatSize = SPLAT_SIZE;
  private readonly layers: TerrainPaintLayer[] = [];
  // Nós TSL estáveis do blend (trocar `.value` propaga sem reconstruir o material).
  // O engine renderiza com WebGPURenderer (node-based) — `onBeforeCompile` NÃO
  // existe nesse pipeline; o blend de splat é um `colorNode` de NodeMaterial.
  private splatTexNode: ReturnType<typeof textureNode> | null = null;
  private layerTexNodes: ReturnType<typeof textureNode>[] = [];
  private repeatNodes: RepeatNode[] = [];

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

  /** Altura **efetiva** de um vértice = base autorada + delta de moldagem da estrada. */
  private effectiveY(idx: number): number {
    return this.heights[idx]! + (this.roadDelta ? this.roadDelta[idx]! : 0);
  }

  /** Reescreve TODO o Y do mesh com a altura efetiva (base+delta) + normais/bounds. */
  private applyHeights(): void {
    const n = this.resolution + 1;
    const pos = this.geometry.getAttribute('position') as Float32BufferAttribute;
    for (let k = 0; k < n * n; k++) pos.setY(k, this.effectiveY(k));
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  /**
   * **Molda o terreno à(s) estrada(s)** (cut & fill, ADR-0072 Fase 2): aplica um
   * `delta` de altura (mesmo tamanho do heightmap) **por cima** da base autorada —
   * **não-destrutivo** (a base/serialização não muda; `null` remove a moldagem). O
   * {@link buildScene} chama isto a cada build a partir das splines de estrada, então
   * mover/remover a estrada re-ajeita o terreno (sem cicatriz salva).
   */
  setRoadMolding(delta: Float32Array | null): void {
    this.roadDelta = delta && delta.length === this.heights.length ? delta : null;
    this.applyHeights();
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
        pos.setY(idx, this.effectiveY(idx)); // mesh = base (recém-esculpida) + delta da estrada
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
   * bilinear** do heightmap — pra colisão/ground (o player fica em cima). Inclui o
   * delta de moldagem da estrada (o player anda sobre o terreno moldado). Retorna
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
    const h00 = this.effectiveY(j0 * n + i0);
    const h10 = this.effectiveY(j0 * n + i0 + 1);
    const h01 = this.effectiveY((j0 + 1) * n + i0);
    const h11 = this.effectiveY((j0 + 1) * n + i0 + 1);
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  /** Heightmap atual (row-major, `(res+1)²`) — serializável pra persistência. */
  getHeights(): number[] {
    return Array.from(this.heights);
  }

  /** Substitui o heightmap **base** inteiro (ex.: restaurar autoria salva) e atualiza
   * o mesh (mantendo o delta de moldagem da estrada por cima, se houver). */
  setHeights(heights: number[]): void {
    const n = this.resolution + 1;
    this.heights.set(heights.slice(0, n * n));
    this.applyHeights(); // base + delta da estrada
  }

  // ── Pintura de textura (splat) ────────────────────────────────────────────────

  /** Camadas de textura em uso (cópia; índice = canal RGBA do splatmap). */
  getLayers(): TerrainPaintLayer[] {
    return this.layers.map((l) => ({ ...l }));
  }

  /**
   * Índice da camada da textura `url` — reusa se já existe, senão **aloca** a
   * próxima livre (carrega a textura e liga o shader de splat). Retorna `-1` se as
   * {@link TERRAIN_MAX_LAYERS} camadas já estão ocupadas por outras texturas.
   */
  layerFor(url: string, repeat?: number): number {
    const existing = this.layers.findIndex((l) => l.url === url);
    if (existing >= 0) return existing;
    if (this.layers.length >= TERRAIN_MAX_LAYERS) return -1;
    const index = this.layers.length;
    this.layers.push({ url, repeat: repeat ?? Math.max(1, Math.round(Math.max(this.width, this.depth) / 4)) });
    this.ensurePaint();
    this.loadLayerTexture(index);
    return index;
  }

  /** Ajusta o tiling (repetições ao longo do terreno) de uma camada. */
  setLayerRepeat(index: number, repeat: number): void {
    const layer = this.layers[index];
    if (!layer) return;
    layer.repeat = Math.max(0.01, repeat);
    this.syncRepeat();
  }

  /**
   * **Pinta** textura no terreno: soma `amount` (0..1 por pincelada; negativo
   * apaga) ao peso da camada `layer` num círculo de `radius` (coords LOCAIS, como
   * {@link Terrain.sculpt}), com o mesmo falloff smoothstep. Pesos das outras
   * camadas são reduzidos quando a soma estoura (a base aparece onde nada foi
   * pintado). Retorna `true` se algum texel mudou.
   */
  paint(localX: number, localZ: number, radius: number, amount: number, layer: number): boolean {
    if (radius <= 0 || amount === 0 || layer < 0 || layer >= this.layers.length) return false;
    this.ensurePaint();
    const data = this.splatData!;
    const size = this.splatSize;
    const r2 = radius * radius;
    // Faixa de texels que o círculo cobre (texel k ↔ local ((k/(size-1))-0.5)*width).
    const toLocalX = (i: number): number => (i / (size - 1) - 0.5) * this.width;
    const toLocalZ = (j: number): number => (j / (size - 1) - 0.5) * this.depth;
    const i0 = Math.max(0, Math.floor(((localX - radius) / this.width + 0.5) * (size - 1)));
    const i1 = Math.min(size - 1, Math.ceil(((localX + radius) / this.width + 0.5) * (size - 1)));
    const j0 = Math.max(0, Math.floor(((localZ - radius) / this.depth + 0.5) * (size - 1)));
    const j1 = Math.min(size - 1, Math.ceil(((localZ + radius) / this.depth + 0.5) * (size - 1)));
    let changed = false;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = toLocalX(i) - localX;
        const dz = toLocalZ(j) - localZ;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        const tdist = 1 - Math.sqrt(d2) / radius;
        const w = tdist * tdist * (3 - 2 * tdist); // smoothstep (igual ao sculpt)
        const base = (j * size + i) * 4;
        const cur = data[base + layer]!;
        const next = Math.max(0, Math.min(255, Math.round(cur + amount * 255 * w)));
        if (next === cur) continue;
        data[base + layer] = next;
        // Soma > 255 = camadas disputando o texel: reduz as OUTRAS proporcionalmente
        // (pintar por cima substitui; onde nada foi pintado a cor base aparece).
        let others = 0;
        for (let c = 0; c < 4; c++) if (c !== layer) others += data[base + c]!;
        if (next + others > 255 && others > 0) {
          const scale = (255 - next) / others;
          for (let c = 0; c < 4; c++) if (c !== layer) data[base + c] = Math.floor(data[base + c]! * scale);
        }
        changed = true;
      }
    }
    if (changed && this.splatTexture) this.splatTexture.needsUpdate = true;
    return changed;
  }

  /** Pintura atual (camadas + splatmap em base64) — serializável, ou `null` se nunca pintou. */
  getPaint(): TerrainPaintData | null {
    if (!this.splatData || this.layers.length === 0) return null;
    return {
      layers: this.getLayers(),
      size: this.splatSize,
      splat: bytesToBase64(this.splatData),
    };
  }

  /** Restaura uma pintura salva ({@link Terrain.getPaint}): camadas + splatmap. */
  setPaint(data: TerrainPaintData): void {
    if (!data.layers.length || !data.splat) return;
    if (!this.splatTexture) {
      this.splatSize = data.size;
      this.ensurePaint();
    } else if (this.splatSize !== data.size) {
      // Recria o splatmap no tamanho salvo e troca no nó (sem reconstruir o material).
      this.splatSize = data.size;
      this.splatTexture.dispose();
      this.splatTexture = this.createSplatTexture();
      this.splatTexNode!.value = this.splatTexture;
    }
    this.layers.length = 0;
    for (const l of data.layers.slice(0, TERRAIN_MAX_LAYERS)) {
      this.layers.push({ url: l.url, repeat: l.repeat });
    }
    const bytes = base64ToBytes(data.splat);
    this.splatData!.set(bytes.subarray(0, this.splatData!.length));
    this.splatTexture!.needsUpdate = true;
    for (let i = 0; i < this.layers.length; i++) this.loadLayerTexture(i);
  }

  /** Cria o `DataTexture` RGBA de pesos (`splatSize²`) apontando pro `splatData`. */
  private createSplatTexture(): DataTexture {
    const size = this.splatSize;
    this.splatData = new Uint8Array(size * size * 4);
    const tex = new DataTexture(this.splatData, size, size, RGBAFormat, UnsignedByteType);
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Liga a infra de pintura uma única vez: cria o splatmap e troca o material por
   * um `MeshStandardNodeMaterial` cujo `colorNode` faz o blend das camadas (TSL).
   * ⚠️ O engine renderiza com **WebGPURenderer** (node-based) — `onBeforeCompile`
   * é silenciosamente ignorado nesse pipeline; o blend TEM que ser via nós. A
   * iluminação/sombra do material padrão continua valendo (só a cor é substituída).
   */
  private ensurePaint(): void {
    if (this.splatTexture) return;
    this.splatTexture = this.createSplatTexture();

    const white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    white.needsUpdate = true;

    const uvNode = uv();
    this.splatTexNode = textureNode(this.splatTexture, uvNode);
    this.repeatNodes = [uniformNumber(1), uniformNumber(1), uniformNumber(1), uniformNumber(1)];
    this.layerTexNodes = this.repeatNodes.map((r) => textureNode(white, uvNode.mul(r)));
    const splat = this.splatTexNode;
    const [t0, t1, t2, t3] = this.layerTexNodes;
    const wsum = splat.r.add(splat.g).add(splat.b).add(splat.a);
    const blended = t0!.rgb
      .mul(splat.r)
      .add(t1!.rgb.mul(splat.g))
      .add(t2!.rgb.mul(splat.b))
      .add(t3!.rgb.mul(splat.a))
      .div(max(wsum, 1e-4)); // média ponderada quando a soma estoura 1

    const old = this.mesh.material as MeshStandardMaterial;
    const material = new MeshStandardNodeMaterial();
    material.color.copy(old.color);
    material.roughness = old.roughness;
    material.metalness = old.metalness;
    // Soma < 1 = mistura com a cor base (uniform aponta pro material.color — edições
    // na MESMA instância de Color propagam ao vivo).
    material.colorNode = mix(uniform(material.color).rgb, blended, clamp(wsum, 0, 1));
    this.mesh.material = material;
    old.dispose();
    this.syncRepeat();
  }

  /** Carrega a textura da camada `index` e a põe no nó (browser; no-op sem DOM). */
  private loadLayerTexture(index: number): void {
    const layer = this.layers[index];
    const node = this.layerTexNodes[index];
    if (!layer || !node) return;
    this.syncRepeat();
    if (typeof document === 'undefined') return; // testes/SSR: sem ImageLoader
    const texture = new TextureLoader().load(layer.url);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
    node.value = texture;
  }

  /** Espelha o `repeat` das camadas nos uniforms (tiling ao vivo, sem rebuild). */
  private syncRepeat(): void {
    for (let i = 0; i < this.repeatNodes.length; i++) {
      this.repeatNodes[i]!.value = this.layers[i]?.repeat ?? 1;
    }
  }
}

/** Bytes → base64 (Node usa Buffer; browser, btoa em blocos pra não estourar a pilha). */
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Base64 → bytes (inverso de {@link bytesToBase64}). */
function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
