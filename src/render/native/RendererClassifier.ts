/**
 * What the native renderer (ADR-0465) would do with a drawable: which fixed model and
 * features draw it, or why it is refused (SPEC-0505 §1).
 *
 * Pure and per (object, material). It is the census today (R0) and the material
 * translator's front door later (R1): refuse instead of approximate, always with a
 * reason, so the census can say what is missing.
 */
import type { Material, Object3D } from 'three';
import { OUTLINE_THICKNESS_KEY } from '../../scene/Materials.js';

/** Fixed models of the native renderer (ADR-0465 §3). */
export type NativeModel = 'unlit' | 'lambert' | 'standard' | 'toon' | 'outline';

export type Classification =
  | { kind: 'covered'; model: NativeModel | `wgsl:${string}`; features: string[] }
  | { kind: 'skip' }
  | { kind: 'refused'; reason: string };

/** `userData` key that ties a TSL material to a game WGSL registered in the native renderer. */
export const NATIVE_MATERIAL_KEY = 'nativeMaterial';

const MODEL_BY_TYPE: Record<string, NativeModel | undefined> = {
  MeshBasicMaterial: 'unlit',
  MeshBasicNodeMaterial: 'unlit',
  MeshLambertMaterial: 'lambert',
  MeshLambertNodeMaterial: 'lambert',
  MeshStandardMaterial: 'standard',
  MeshStandardNodeMaterial: 'standard',
  MeshPhysicalMaterial: 'standard',
  MeshPhysicalNodeMaterial: 'standard',
  MeshToonMaterial: 'toon',
  MeshToonNodeMaterial: 'toon',
};

/** Physical features the `standard` model does not reproduce: any of them > 0 is a refusal. */
const PHYSICAL_EXTRAS = ['clearcoat', 'sheen', 'transmission', 'iridescence', 'anisotropy', 'dispersion'] as const;

/** Maps no fixed model covers. */
const UNCOVERED_MAPS = ['envMap', 'alphaMap', 'lightMap', 'aoMap', 'bumpMap', 'displacementMap', 'specularMap'] as const;

/** `three` constants (kept local: the classifier must not depend on a renderer). */
const DOUBLE_SIDE = 2;
const NORMAL_BLENDING = 1;
const ADDITIVE_BLENDING = 2;
const ALPHA_TEST_OFF = 0;
const NO_RENDER_ORDER = 0;

type Bag = Record<string, unknown>;

function hasOwnCallback(object: Object3D, name: 'onBeforeRender' | 'onAfterRender'): boolean {
  // Object3D's default callbacks live on the prototype; an own property is the game's.
  return Object.prototype.hasOwnProperty.call(object, name);
}

function nodeProps(material: Bag): string[] {
  const found: string[] = [];
  for (const key in material) {
    if (key.endsWith('Node') && material[key]) found.push(key);
  }
  return found;
}

function objectKind(object: Object3D): string | null {
  const o = object as unknown as Bag;
  if (o.isSprite) return 'Sprite';
  if (o.isPoints) return 'Points';
  if (o.isLine) return 'Line';
  if (!o.isMesh) return 'other';
  return null;
}

function mapHasTransform(map: Bag | null | undefined): boolean {
  if (!map) return false;
  const offset = map.offset as { x: number; y: number } | undefined;
  const repeat = map.repeat as { x: number; y: number } | undefined;
  return (
    (offset !== undefined && (offset.x !== 0 || offset.y !== 0)) ||
    (repeat !== undefined && (repeat.x !== 1 || repeat.y !== 1)) ||
    (typeof map.rotation === 'number' && map.rotation !== 0)
  );
}

/**
 * Classifies one drawable.
 *
 * @param object - The mesh (or any `Object3D`) being drawn.
 * @param material - Its material (an array is refused before this is called).
 */
export function classifyDrawable(object: Object3D, material: Material | Material[]): Classification {
  const kind = objectKind(object);
  if (kind) return { kind: 'refused', reason: `kind:${kind}` };
  if (Array.isArray(material)) return { kind: 'refused', reason: 'materialArray' };

  const m = material as unknown as Bag;
  const o = object as unknown as Bag;
  if (m.colorWrite === false) return { kind: 'skip' };

  const outline = typeof material.userData?.[OUTLINE_THICKNESS_KEY] === 'number';
  const wgsl = material.userData?.[NATIVE_MATERIAL_KEY];
  const model: NativeModel | `wgsl:${string}` | undefined =
    typeof wgsl === 'string' ? `wgsl:${wgsl}` : outline ? 'outline' : MODEL_BY_TYPE[material.type];
  if (!model) return { kind: 'refused', reason: `type:${material.type}` };

  if (typeof wgsl !== 'string' && !outline) {
    const nodes = nodeProps(m);
    if (nodes.length > 0) return { kind: 'refused', reason: `node:${nodes.sort().join('+')}` };
  }
  for (const extra of PHYSICAL_EXTRAS) {
    if (typeof m[extra] === 'number' && (m[extra] as number) > 0) return { kind: 'refused', reason: `physical:${extra}` };
  }
  for (const map of UNCOVERED_MAPS) {
    if (m[map]) return { kind: 'refused', reason: `map:${map}` };
  }
  if (m.wireframe) return { kind: 'refused', reason: 'wireframe' };
  if (m.blending !== NORMAL_BLENDING && m.blending !== ADDITIVE_BLENDING) return { kind: 'refused', reason: `blending:${String(m.blending)}` };
  if (hasOwnCallback(object, 'onBeforeRender') || hasOwnCallback(object, 'onAfterRender')) {
    return { kind: 'refused', reason: 'onBeforeRender' };
  }
  const geometry = o.geometry as { morphAttributes?: Record<string, unknown[]> } | undefined;
  if (geometry?.morphAttributes && Object.values(geometry.morphAttributes).some((list) => list.length > 0)) {
    return { kind: 'refused', reason: 'morph' };
  }

  const features: string[] = [];
  const add = (cond: unknown, name: string): void => {
    if (cond) features.push(name);
  };
  add(m.map, 'map');
  add(m.normalMap, 'normalMap');
  add(m.metalnessMap || m.roughnessMap, 'metalRoughMap');
  add(m.emissiveMap, 'emissiveMap');
  add(m.vertexColors, 'vertexColors');
  add(typeof m.alphaTest === 'number' && m.alphaTest > ALPHA_TEST_OFF, 'alphaTest');
  add(m.transparent, 'transparent');
  add(m.blending === ADDITIVE_BLENDING, 'additive');
  add(m.side === DOUBLE_SIDE, 'doubleSide');
  add(m.fog, 'fog');
  add(m.toneMapped === false, 'noToneMap');
  add(mapHasTransform(m.map as Bag | null), 'uvTransform');
  add(o.isSkinnedMesh, 'skinned');
  add(o.isInstancedMesh, 'instanced');
  add(o.isInstancedMesh && o.instanceColor, 'instanceColor');
  add(o.receiveShadow, 'receiveShadow');
  add(m.polygonOffset, 'polygonOffset');
  add(m.depthWrite === false, 'noDepthWrite');
  add(o.renderOrder !== NO_RENDER_ORDER, 'renderOrder');
  // Physical with only ior/specular (what the glTF loader creates) is drawn by `standard` with
  // those terms; the feature tells R1.2 which objects need them.
  add(material.type.startsWith('MeshPhysical'), 'specularIor');
  return { kind: 'covered', model, features: features.sort() };
}

/** Stable label of a classification: `lambert+fog+map`, `refused:node:colorNode`, `skip`. */
export function classLabel(c: Classification): string {
  if (c.kind === 'skip') return 'skip';
  if (c.kind === 'refused') return `refused:${c.reason}`;
  return [c.model, ...c.features].join('+');
}
