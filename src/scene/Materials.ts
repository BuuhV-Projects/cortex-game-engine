import {
  MeshBasicMaterial,
  MeshToonMaterial,
  BackSide,
  FrontSide,
  DoubleSide,
  Color,
  Mesh,
  SkinnedMesh,
  DataTexture,
  RedFormat,
  UnsignedByteType,
  NearestFilter,
  LinearFilter,
  type Object3D,
  type Material,
  type Texture,
  type ColorRepresentation,
  type Side,
  MeshStandardMaterial,
} from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { modelWorldMatrix, normalLocal, positionLocal, vec4 } from 'three/tsl';

/**
 * **Sistema de materiais por objeto** (SPEC-0058). Troca o material dos meshes de
 * um objeto por um preset selecionável (como atribuir um shader a um objeto na
 * Unity), preservando a textura de cor (`map`). O material original é cacheado em
 * `userData` no primeiro swap, então `'standard'`/{@link clearMaterial} restaura.
 *
 * Presets:
 * - `standard` — restaura o material original (PBR do `.glb`).
 * - `unlit` — `MeshBasicMaterial` (textura × cor, **sem iluminação**), com os
 *   controles de render do shader Unity portados (cull→`side`, zwrite→`depthWrite`,
 *   ztest→`depthTest`, color, opacity). Reproduz o `Supyrb/Unlit/Texture`. Aceita
 *   o mesmo **contorno** do toon (inverted-hull) — "unlit toon": cor chapada +
 *   borda de silhueta.
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
      /**
       * Usa a textura (`map`) do modelo. Default `true`. `false` = cor
       * **CHAPADA**, ignorando o texture do GLB — some com o `map` e pinta a
       * malha com `color` puro. Útil quando o asset embute um **atlas de paleta**
       * (a UV amostra um swatch fixo): aí `color` sozinho só multiplica o swatch
       * e não consegue clarear/trocar o matiz; com `textured: false` a cor é
       * exatamente a escolhida (ex.: moeda amarelo-sol, independente do swatch).
       */
      textured?: boolean;
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
      /**
       * Espessura do contorno (inverted-hull, em unidades de mundo). 0 = sem
       * contorno. O mesmo contorno do `toon` — "unlit toon": cor chapada sem
       * iluminação + borda de silhueta.
       */
      outline?: number;
      /** Cor do contorno. Default preto. */
      outlineColor?: ColorRepresentation;
      /**
       * **Intensidade de emissão (HDR)** — multiplica a cor. `1` (default) = cor
       * normal, no máximo branco (1.0). **Acima de 1** leva a cor pra faixa HDR
       * (ex.: `3` = 3×), que é o que faz o objeto **brilhar no bloom** com o
       * threshold no padrão de mercado (~1.0): só o que passa de 1.0 vira glow.
       * É o "quanto este objeto emite luz" do Unity/Unreal, por objeto.
       */
      intensity?: number;
    }
  | {
      type: 'toon';
      /** Acabamento: `bands` (default) quantiza a luz; `cel` usa dois tons com uma transição suave curta. */
      shading?: 'bands' | 'cel';
      /** Mantém PBR nos materiais originais metálicos (>= 0.2) ou polidos (roughness <= 0.35), com contorno toon. Default false. */
      preserveGloss?: boolean;
      /** Cor base. Default: mantém a do material original (ou branco). */
      color?: ColorRepresentation;
      /** Nº de bandas de luz (2–8), usado apenas em `shading: 'bands'`. */
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

/** Props visuais lidas do material original pra preservar no novo (por-material). */
interface SrcMat extends Partial<Pick<MeshStandardMaterial,
  'name' | 'side' | 'depthWrite' | 'depthTest' | 'alphaMap' | 'emissive' |
  'emissiveMap' | 'emissiveIntensity' | 'normalMap' | 'normalScale' |
  'bumpMap' | 'bumpScale' | 'aoMap' | 'aoMapIntensity' | 'fog'>> {
  map?: Texture | null;
  color?: Color;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
}

/**
 * Constrói o material `unlit` a partir de UM material original, **preservando**
 * `map`, `vertexColors` e a `color` própria (a menos que o config force uma cor) —
 * assim objetos com várias cores (vertex colors / multi-material, ex.: árvore com
 * folha verde + tronco marrom) não viram uma cor só.
 */
function buildUnlit(orig: Material, config: Extract<MaterialConfig, { type: 'unlit' }>): MeshBasicMaterial {
  const o = orig as unknown as SrcMat;
  const transparent = config.transparent ?? (config.opacity !== undefined ? config.opacity < 1 : (o.transparent ?? false));
  // Cor base × intensidade: `intensity > 1` leva a cor pra HDR (o material é
  // `toneMapped: false`, então o valor passa direto). É o que faz o objeto
  // brilhar no bloom com threshold alto (padrão de mercado). Só objetos com
  // intensidade > 1 brilham; o resto fica ≤ 1 e não vira glow.
  const baseColor = config.color !== undefined ? new Color(config.color) : (o.color?.clone() ?? new Color(0xffffff));
  if (config.intensity !== undefined && config.intensity !== 1) baseColor.multiplyScalar(config.intensity);
  return new MeshBasicMaterial({
    // `textured: false` → cor chapada: descarta o map do modelo (atlas de paleta).
    map: config.textured === false ? null : (o.map ?? null),
    vertexColors: o.vertexColors ?? false,
    color: baseColor,
    transparent,
    opacity: config.opacity ?? o.opacity ?? 1,
    side: sideOf(config.cull),
    depthWrite: config.depthWrite ?? true,
    depthTest: config.depthTest ?? true,
    alphaTest: config.alphaTest ?? o.alphaTest ?? 0,
    toneMapped: false,
  });
}

/**
 * Constrói o material `toon` (cel-shading) **em cima** de UM material original,
 * preservando `map`, `vertexColors` e a `color` própria — só troca o modelo de
 * sombreamento (gradientMap em bandas). Não força cor (preserva as cores reais).
 */
function buildToon(orig: Material, config: Extract<MaterialConfig, { type: 'toon' }>): MeshToonMaterial | MeshStandardMaterial {
  if (config.preserveGloss && orig instanceof MeshStandardMaterial && (orig.metalness >= 0.2 || orig.roughness <= 0.35)) {
    const surface = orig.clone();
    if (config.color !== undefined) surface.color.set(config.color);
    return surface;
  }
  const o = orig as unknown as SrcMat;
  return new MeshToonMaterial({
    name: o.name ?? '',
    map: o.map ?? null,
    vertexColors: o.vertexColors ?? false,
    color: config.color !== undefined ? new Color(config.color) : (o.color?.clone() ?? new Color(0xffffff)),
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    alphaTest: o.alphaTest ?? 0,
    side: o.side ?? FrontSide,
    depthWrite: o.depthWrite ?? true,
    depthTest: o.depthTest ?? true,
    alphaMap: o.alphaMap ?? null,
    emissive: o.emissive?.clone() ?? new Color(0),
    emissiveMap: o.emissiveMap ?? null,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    normalMap: o.normalMap ?? null,
    ...(o.normalScale ? { normalScale: o.normalScale.clone() } : {}),
    bumpMap: o.bumpMap ?? null,
    bumpScale: o.bumpScale ?? 1,
    aoMap: o.aoMap ?? null,
    aoMapIntensity: o.aoMapIntensity ?? 1,
    fog: o.fog ?? true,
    gradientMap: sharedGradient(config),
  });
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

// ── Cache de presets derivados (SPEC-0196) ────────────────────────────────────

/**
 * Presets já construídos, por material de ORIGEM × config. O cache de `loadGLB`
 * compartilha geometria e material entre os clones de um `.glb`, então as 34
 * árvores iguais de uma cena chegam aqui com o MESMO material de origem — sem
 * este cache, cada malha ganhava um material próprio (e uma rampa própria).
 *
 * Isso não é só memória: material distinto = bind group distinto por frame, e o
 * {@link mergeStaticScene} agrupa POR MATERIAL — material único por malha
 * neutraliza o merge estático (SPEC-0120).
 *
 * `WeakMap` na origem: quando o `.glb` sai do cache de assets, os presets dele
 * saem junto.
 */
let _presets = new WeakMap<Material, Map<string, Material>>();

/** Presets vivos — o `WeakMap` não itera, e {@link clearMaterialPresetCache} precisa. */
const _livePresets = new Set<Material>();

/**
 * Chave estável de uma config pro cache de presets: só o que muda o MATERIAL.
 * `outline`/`outlineColor` ficam de fora de propósito — o contorno é uma malha
 * extra (inverted-hull), não uma propriedade do material.
 */
function presetKey(config: Extract<MaterialConfig, { type: 'toon' | 'unlit' }>): string {
  const fields = { ...(config as unknown as Record<string, unknown>) };
  delete fields['outline'];
  delete fields['outlineColor'];
  // A lista de chaves ORDENADA como replacer: a saída sai na ordem do array, então
  // `{a,b}` e `{b,a}` geram a mesma chave.
  return JSON.stringify(fields, Object.keys(fields).sort());
}

/**
 * Marca um recurso como **residente** (`userData.cortexCached`): o
 * `Scene.disposeAll` pula o dispose dele na troca de fase — sem isso, trocar de
 * fase destruiria um preset que outras cenas/objetos ainda compartilham. O
 * despejo explícito é o {@link clearMaterialPresetCache}.
 */
function markShared(resource: { userData: Record<string, unknown> }): void {
  resource.userData['cortexCached'] = true;
}

/** Constrói (ou reusa) o preset de `orig` pra `config`. */
function presetFor(orig: Material, config: Extract<MaterialConfig, { type: 'toon' | 'unlit' }>): Material {
  let byConfig = _presets.get(orig);
  if (!byConfig) {
    byConfig = new Map();
    _presets.set(orig, byConfig);
  }
  const key = presetKey(config);
  let preset = byConfig.get(key);
  if (!preset) {
    preset = config.type === 'unlit' ? buildUnlit(orig, config) : buildToon(orig, config);
    markShared(preset);
    byConfig.set(key, preset);
    _livePresets.add(preset);
  }
  return preset;
}

/**
 * **Despeja os presets de material e as rampas de tom** (SPEC-0196). Chamado
 * pelo `clearSceneAssetCaches` — os presets derivam dos materiais dos `.glb`
 * cacheados e seguem a mesma política de residência (SPEC-0152).
 */
export function clearMaterialPresetCache(): void {
  for (const preset of _livePresets) preset.dispose();
  _livePresets.clear();
  // O WeakMap não itera: troca o mapa inteiro, senão a próxima aplicação reusaria
  // um preset JÁ DISPOSTO (material sem recurso de GPU na cena nova).
  _presets = new WeakMap();
  for (const tex of _gradients.values()) tex.dispose();
  _gradients.clear();
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

  const cfg = config;
  eachMesh(object, (mesh) => {
    const previous = mesh.userData?.[CACHE] !== undefined ? mesh.material : undefined;
    cacheOriginal(mesh);
    // SEMPRE deriva do material ORIGINAL (cacheado), POR-MATERIAL — preserva
    // textura, vertex colors e a cor de cada submaterial (multi-material/array).
    const source = (mesh.userData?.[CACHE] ?? mesh.material) as Material | Material[];
    // Preset COMPARTILHADO por (material de origem × config) — ver `presetFor`.
    const build = (orig: Material): Material => presetFor(orig, cfg);
    mesh.material = Array.isArray(source) ? source.map(build) : build(source);
    if (previous) disposePreset(previous);
  });

  // Contorno (toon E unlit — o inverted-hull é independente do material base).
  if ((config.type === 'toon' || config.type === 'unlit') && config.outline && config.outline > 0) {
    addOutline(object, config.outline, config.outlineColor ?? 0x000000);
  }

  object.userData[FLAG] = config.type;
  object.userData.cortexMaterialConfig = { ...config };
}

/** Restaura o material original cacheado (desfaz o swap). */
export function clearMaterial(object: Object3D): void {
  clearOutline(object);
  eachMesh(object, (mesh) => {
    const orig = mesh.userData?.[CACHE] as Material | Material[] | undefined;
    if (orig === undefined) return;
    disposePreset(mesh.material);
    mesh.material = orig;
    delete mesh.userData[CACHE];
  });
  object.userData[FLAG] = 'standard';
  object.userData.cortexMaterialConfig = { type: 'standard' };
}

/** Preset de material ativo no objeto (`'standard'` se nenhum). Pro inspector. */
export function getMaterialType(object: Object3D): string {
  return (object.userData?.[FLAG] as string) ?? 'standard';
}

/**
 * Chave do userData onde a casca de contorno declara a espessura usada no
 * vertex shader. É o que permite descrever o efeito como dado (ADR-0237, M1).
 */
export const OUTLINE_THICKNESS_KEY = 'cortexOutlineThickness';

// ── Contorno toon (inverted-hull): clone com BackSide empurrado pela normal ───────
function addOutline(object: Object3D, thickness: number, color: ColorRepresentation): void {
  // Coleta os meshes ANTES de adicionar filhos — mutar durante o traverse faria
  // o traverse visitar as cascas recém-criadas (recursão infinita).
  const meshes: Mesh[] = [];
  eachMesh(object, (mesh) => meshes.push(mesh));
  for (const mesh of meshes) {
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materials = source.map((original) => {
      const o = original as unknown as SrcMat;
      const mat = new MeshBasicNodeMaterial({
        color, side: BackSide, toneMapped: false,
        // A solid hull behind glass would turn the windows into black panels.
        visible: original.visible && !(o.transparent && (o.opacity ?? 1) < 1),
        map: (o.alphaTest ?? 0) > 0 ? (o.map ?? null) : null,
        alphaMap: o.alphaMap ?? null, alphaTest: o.alphaTest ?? 0,
        fog: o.fog ?? true,
      });
      // Extrude in the vertex shader: off-center geometry stays in place and
      // CPU bounds / placeOnGround still describe the actual model. Compensate
      // the transformed normal length, including nonuniform ancestor scales.
      const normalLength = modelWorldMatrix.mul(vec4(normalLocal, 0)).xyz.length().max(0.00001);
      mat.positionNode = positionLocal.add(normalLocal.mul(thickness).div(normalLength));
      // Declara o parâmetro do efeito como DADO, além do grafo (M1 do ADR-0237).
      // Sem isto, quem lê o material só enxerga "tem positionNode" e não tem
      // como saber que é a casca de contorno nem com que espessura — e o
      // caminho de render nativo deixaria de fora 45% dos materiais da cena,
      // que é quanto o contorno representa no kart-racer.
      mat.userData[OUTLINE_THICKNESS_KEY] = thickness;
      return mat;
    });
    const material = Array.isArray(mesh.material) ? materials : materials[0]!;
    const shell = mesh instanceof SkinnedMesh
      ? new SkinnedMesh(mesh.geometry, material)
      : new Mesh(mesh.geometry, material);
    if (shell instanceof SkinnedMesh && mesh instanceof SkinnedMesh) {
      shell.bindMode = mesh.bindMode;
      shell.bind(mesh.skeleton, mesh.bindMatrix);
    }
    shell.morphTargetInfluences = mesh.morphTargetInfluences;
    shell.morphTargetDictionary = mesh.morphTargetDictionary;
    shell.layers.mask = mesh.layers.mask;
    shell.raycast = () => {}; // Decorative shell must never steal editor picks.
    shell.userData[OUTLINE] = true;
    mesh.add(shell);
  }
}

function clearOutline(object: Object3D): void {
  const toRemove: Object3D[] = [];
  object.traverse((child) => {
    // `child !== object`: NUNCA remover o próprio objeto-raiz — só as cascas
    // (filhas) marcadas. Antes o raiz também era marcado e o clearOutline o
    // removia da cena (objeto "sumia" ao reaplicar o material).
    if (child !== object && child.userData?.[OUTLINE] === true) toRemove.push(child);
  });
  for (const o of toRemove) {
    disposeMat((o as Mesh).material);
    o.removeFromParent();
  }
}

// ── Cache de rampas de tom (SPEC-0196) ────────────────────────────────────────

/** Nº de bandas do toon quando a config não especifica. */
const DEFAULT_GRADIENT_STEPS = 3;

/**
 * Rampas de tom por chave de config. Sem isto, cada material toon ganhava uma
 * `DataTexture` PRÓPRIA — numa cena inteira autorada em cel, centenas de
 * texturas idênticas, cada uma ocupando uma entrada de bind group.
 */
const _gradients = new Map<string, Texture>();

/** As rampas compartilhadas, pra o {@link disposePreset} não destruí-las. */
const _sharedGradients = new Set<Texture>();

/** Rampa compartilhada de um preset toon (`cel` ou `bands:N`). */
function sharedGradient(config: Extract<MaterialConfig, { type: 'toon' }>): Texture {
  const steps = config.gradientSteps ?? DEFAULT_GRADIENT_STEPS;
  const key = config.shading === 'cel' ? 'cel' : `bands:${steps}`;
  let tex = _gradients.get(key);
  if (!tex) {
    tex = config.shading === 'cel' ? makeCelGradient() : makeGradient(steps);
    markShared(tex);
    _gradients.set(key, tex);
    _sharedGradients.add(tex);
  }
  return tex;
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

/** Two broad tones; filtering softens only the terminator, not the whole surface. */
function makeCelGradient(): Texture {
  const size = 256;
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const t = Math.max(0, Math.min(1, (i / (size - 1) - 0.50) / 0.06));
    const blend = t * t * (3 - 2 * t);
    data[i] = Math.round((0.22 + 0.78 * blend) * 255);
  }
  const tex = new DataTexture(data, size, 1, RedFormat, UnsignedByteType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function disposeMat(material: Material | Material[] | undefined): void {
  if (!material) return;
  for (const m of Array.isArray(material) ? material : [material]) m.dispose();
}

/**
 * Only the ramp belongs to the preset; source asset textures remain shared.
 *
 * Presets do cache ({@link presetFor}) são COMPARTILHADOS entre malhas — dispor
 * aqui mataria o material das outras. Eles saem só no
 * {@link clearMaterialPresetCache}; o que esta função ainda dispõe são presets
 * avulsos (já substituídos no cache, ou de versões anteriores da cena).
 */
function disposePreset(material: Material | Material[]): void {
  for (const mat of Array.isArray(material) ? material : [material]) {
    if (_livePresets.has(mat)) continue;
    if (mat instanceof MeshToonMaterial && mat.gradientMap && !_sharedGradients.has(mat.gradientMap)) {
      mat.gradientMap.dispose();
    }
    mat.dispose();
  }
}
