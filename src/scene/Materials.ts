import {
  MeshBasicMaterial,
  MeshToonMaterial,
  BackSide,
  FrontSide,
  DoubleSide,
  Color,
  Mesh,
  DataTexture,
  RedFormat,
  UnsignedByteType,
  NearestFilter,
  type Object3D,
  type Material,
  type Texture,
  type ColorRepresentation,
  type Side,
} from 'three';

/**
 * **Sistema de materiais por objeto** (ADR-0058). Troca o material dos meshes de
 * um objeto por um preset selecionável (como atribuir um shader a um objeto na
 * Unity), preservando a textura de cor (`map`). O material original é cacheado em
 * `userData` no primeiro swap, então `'standard'`/{@link clearMaterial} restaura.
 *
 * Presets:
 * - `standard` — restaura o material original (PBR do `.glb`).
 * - `unlit` — `MeshBasicMaterial` (textura × cor, **sem iluminação**), com os
 *   controles de render do shader Unity portados (cull→`side`, zwrite→`depthWrite`,
 *   ztest→`depthTest`, color, opacity). Reproduz o `Supyrb/Unlit/Texture`.
 * - `toon` — `MeshToonMaterial` (cel-shading em bandas) + contorno opcional
 *   (inverted-hull).
 *
 * O preset `custom` (GLSL próprio) é tratado à parte (fase S2).
 */

/** Cull mode (Unity) → `side` do three. */
export type CullMode = 'back' | 'front' | 'none';

/** Configuração de material por objeto (data-driven; vai no nó da cena/overlay). */
export type MaterialConfig =
  | { type: 'standard' }
  | {
      type: 'unlit';
      /** Tint multiplicado na textura (`_Color`). Default branco. */
      color?: ColorRepresentation;
      /** Opacidade 0–1 (liga `transparent` se < 1). */
      opacity?: number;
      /** Força transparência (alpha blending). */
      transparent?: boolean;
      /** Cull mode: `back` (default), `front` ou `none` (dois lados). */
      cull?: CullMode;
      /** Escreve no depth buffer (ZWrite). Default `true`. */
      depthWrite?: boolean;
      /** Testa o depth buffer (ZTest on/off). Default `true`. */
      depthTest?: boolean;
      /** Recorte por alpha (0 = sem corte). */
      alphaTest?: number;
    }
  | {
      type: 'toon';
      /** Cor base. Default: mantém a do material original (ou branco). */
      color?: ColorRepresentation;
      /** Nº de bandas de luz (2–8). Mais = degradê mais suave. */
      gradientSteps?: number;
      /** Espessura do contorno (inverted-hull, em unidades de mundo). 0 = sem contorno. */
      outline?: number;
      /** Cor do contorno. Default preto. */
      outlineColor?: ColorRepresentation;
    };

interface MatMesh {
  isMesh?: boolean;
  material?: Material | Material[];
  userData?: Record<string, unknown>;
}

const CACHE = 'cortexOrigMaterial';
const FLAG = 'cortexMaterial';
const OUTLINE = 'cortexOutline';

function eachMesh(object: Object3D, fn: (mesh: Mesh) => void): void {
  object.traverse((child) => {
    const mesh = child as unknown as MatMesh;
    if (mesh.isMesh && mesh.material) fn(child as Mesh);
  });
}

function mapOf(material: Material | Material[]): Texture | null {
  const m = (Array.isArray(material) ? material[0] : material) as { map?: Texture | null } | undefined;
  return m?.map ?? null;
}

function colorOf(material: Material | Material[]): Color | undefined {
  const m = (Array.isArray(material) ? material[0] : material) as { color?: Color } | undefined;
  return m?.color;
}

function sideOf(cull: CullMode | undefined): Side {
  if (cull === 'none') return DoubleSide;
  if (cull === 'front') return BackSide; // Unity Cull Front = renderiza o verso
  return FrontSide;
}

/** Cacheia o material original UMA vez (pra {@link clearMaterial} restaurar). */
function cacheOriginal(mesh: Mesh): void {
  const ud = (mesh.userData ??= {});
  if (ud[CACHE] === undefined) ud[CACHE] = mesh.material;
}

/**
 * Aplica um {@link MaterialConfig} a um objeto (e descendentes). Swap não-destrutivo:
 * o material original fica cacheado e volta com `{ type: 'standard' }`.
 */
export function applyMaterial(object: Object3D, config: MaterialConfig): void {
  if (config.type === 'standard') {
    clearMaterial(object);
    return;
  }

  clearOutline(object);

  eachMesh(object, (mesh) => {
    cacheOriginal(mesh);
    const prev = mesh.material;

    if (config.type === 'unlit') {
      const transparent = config.transparent ?? (config.opacity !== undefined && config.opacity < 1);
      mesh.material = new MeshBasicMaterial({
        map: mapOf(prev),
        color: config.color ?? 0xffffff,
        transparent,
        opacity: config.opacity ?? 1,
        side: sideOf(config.cull),
        depthWrite: config.depthWrite ?? true,
        depthTest: config.depthTest ?? true,
        ...(config.alphaTest !== undefined ? { alphaTest: config.alphaTest } : {}),
        toneMapped: false,
      });
    } else {
      // toon
      const baseColor = config.color !== undefined ? new Color(config.color) : (colorOf(prev)?.clone() ?? new Color(0xffffff));
      mesh.material = new MeshToonMaterial({
        map: mapOf(prev),
        color: baseColor,
        gradientMap: makeGradient(config.gradientSteps ?? 3),
      });
    }
  });

  if (config.type === 'toon' && config.outline && config.outline > 0) {
    addOutline(object, config.outline, config.outlineColor ?? 0x000000);
  }

  object.userData[FLAG] = config.type;
}

/** Restaura o material original cacheado (desfaz o swap). */
export function clearMaterial(object: Object3D): void {
  clearOutline(object);
  eachMesh(object, (mesh) => {
    const orig = mesh.userData?.[CACHE] as Material | Material[] | undefined;
    if (orig === undefined) return;
    disposeMat(mesh.material);
    mesh.material = orig;
    delete mesh.userData[CACHE];
  });
  object.userData[FLAG] = 'standard';
}

/** Preset de material ativo no objeto (`'standard'` se nenhum). Pro inspector. */
export function getMaterialType(object: Object3D): string {
  return (object.userData?.[FLAG] as string) ?? 'standard';
}

// ── Contorno toon (inverted-hull): clone com BackSide empurrado pela normal ───────
function addOutline(object: Object3D, thickness: number, color: ColorRepresentation): void {
  // Coleta os meshes ANTES de adicionar filhos — mutar durante o traverse faria
  // o traverse visitar as cascas recém-criadas (recursão infinita).
  const meshes: Mesh[] = [];
  eachMesh(object, (mesh) => meshes.push(mesh));
  for (const mesh of meshes) {
    const mat = new MeshBasicMaterial({ color, side: BackSide });
    // Casca: mesmo geometry, sólida na cor do contorno, levemente maior, virada
    // pro avesso (BackSide) — vira só a borda atrás da silhueta. Filha do mesh,
    // herda a pose; o `scale` local (1 + fator) cresce a casca.
    const shell = new Mesh(mesh.geometry, mat);
    shell.scale.multiplyScalar(1 + thickness);
    shell.userData[OUTLINE] = true;
    mesh.add(shell);
  }
  object.userData[OUTLINE] = meshes.length > 0;
}

function clearOutline(object: Object3D): void {
  const toRemove: Object3D[] = [];
  object.traverse((child) => {
    if (child.userData?.[OUTLINE] === true) toRemove.push(child);
  });
  for (const o of toRemove) {
    disposeMat((o as Mesh).material);
    o.removeFromParent();
  }
  delete object.userData[OUTLINE];
}

/** Rampa de tom (gradientMap) com `steps` bandas — o que dá o look cel/toon. */
function makeGradient(steps: number): Texture {
  const n = Math.max(2, Math.min(8, Math.floor(steps)));
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.round((i / (n - 1)) * 255);
  const tex = new DataTexture(data, n, 1, RedFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function disposeMat(material: Material | Material[] | undefined): void {
  if (!material) return;
  for (const m of Array.isArray(material) ? material : [material]) m.dispose();
}
