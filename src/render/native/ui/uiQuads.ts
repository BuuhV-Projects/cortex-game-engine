/**
 * The runtime UI scene of the `RendererUiBackend` read as data (SPEC-0616, ADR-0615): one record per
 * visible mesh, in the three's order for transparent objects, grouped into batches of consecutive
 * records that share a texture (the canvas batching of Godot, `renderer_canvas_render_rd.cpp:2464-2469`).
 *
 * Pure (no GPU): the native UI renderer uploads `data` once per frame and draws one instanced quad per batch.
 */
import type { Material, Object3D, Texture } from 'three';
import { UI_BOX_KEY, UI_IMAGE_KEY } from '../../../ui/runtime/uiNativeData.js';

/** Floats per record: 10 `vec4` instance attributes (`uiWgsl.ts`). */
export const UI_QUAD_FLOATS = 40;
export const UI_QUAD_BYTES = UI_QUAD_FLOATS * Float32Array.BYTES_PER_ELEMENT;
/** Record layout: the mesh world matrix (4 columns), then one `vec4` per row below. */
export const QUAD_MATRIX_AT = 0;
/** size.x, size.y, corner radius, border width. */
export const QUAD_SHAPE_AT = 16;
/** Top color rgb + alpha (also the tint of a tinted texture). */
export const QUAD_TOP_AT = 20;
/** Bottom color rgb + alpha. */
export const QUAD_BOTTOM_AT = 24;
/** Border color rgb + alpha. */
export const QUAD_BORDER_AT = 28;
/** Gradient axis, fill opacity (box) or image opacity, material opacity, kind. */
export const QUAD_MISC_AT = 32;
/** UV repeat.xy, offset.xy. */
export const QUAD_UV_AT = 36;

/** How the fragment shader colors a record. */
export const UiQuadKind = { Box: 0, Tinted: 1, Image: 2 } as const;

const MAT4_FLOATS = 16;
const INITIAL_QUADS = 64;

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The TSL uniforms of the backend (`.value` is a number, `Vector2` or `Color`). */
type Uniforms = Record<string, { value: any }>;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface UiMesh extends Object3D {
  isMesh?: boolean;
  renderOrder: number;
  material: Material & {
    opacity: number;
    color?: { r: number; g: number; b: number };
    map?: Texture | null;
    userData: Record<string, unknown>;
  };
}

/** Consecutive records drawn with one texture (`null` = no texture: boxes). */
export interface UiBatch {
  texture: Texture | null;
  first: number;
  count: number;
}

/** Three's order for transparent objects with equal depth: `renderOrder`, then `id`. */
function byRenderOrder(a: UiMesh, b: UiMesh): number {
  return a.renderOrder !== b.renderOrder ? a.renderOrder - b.renderOrder : a.id - b.id;
}

export class UiQuadList {
  data = new Float32Array(INITIAL_QUADS * UI_QUAD_FLOATS);
  count = 0;
  /** Reused batch objects; only the first `batchCount` are this frame's. */
  readonly batches: UiBatch[] = [];
  batchCount = 0;
  /** Visible meshes with a material the renderer does not know (not drawn). */
  skipped = 0;
  private readonly _meshes: UiMesh[] = [];

  /** Rebuilds the records from the scene's direct children (the backend keeps the UI flat). */
  build(scene: Object3D): void {
    scene.updateMatrixWorld();
    const meshes = this._meshes;
    meshes.length = 0;
    const children = scene.children as UiMesh[];
    for (let i = 0; i < children.length; i++) {
      const m = children[i]!;
      if (m.isMesh && m.visible && m.material.visible !== false) meshes.push(m);
    }
    meshes.sort(byRenderOrder);
    this.count = 0;
    this.batchCount = 0;
    this.skipped = 0;
    if (this.data.length < meshes.length * UI_QUAD_FLOATS) this.data = new Float32Array(meshes.length * 2 * UI_QUAD_FLOATS);
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i]!;
      const texture = this._write(mesh, this.count * UI_QUAD_FLOATS);
      if (texture === undefined) {
        this.skipped++;
        continue;
      }
      this._addToBatch(texture);
      this.count++;
    }
  }

  /** Writes one record; returns its texture (`null` = none) or `undefined` = unknown material. */
  private _write(mesh: UiMesh, at: number): Texture | null | undefined {
    const d = this.data;
    const material = mesh.material;
    const box = material.userData[UI_BOX_KEY] as Uniforms | undefined;
    const image = material.userData[UI_IMAGE_KEY] as { uniforms: Uniforms; texture: Texture } | undefined;
    let texture: Texture | null;
    if (box) {
      writeShape(d, at, box);
      writeColor(d, at + QUAD_TOP_AT, box['colorTop']!.value, box['alphaTop']!.value);
      writeColor(d, at + QUAD_BOTTOM_AT, box['colorBottom']!.value, box['alphaBottom']!.value);
      writeColor(d, at + QUAD_BORDER_AT, box['borderColor']!.value, box['alphaBorder']!.value);
      writeMisc(d, at, box['gradientAxis']!.value, box['fillOpacity']!.value, material.opacity, UiQuadKind.Box);
      writeUv(d, at, 1, 1, 0, 0);
      texture = null;
    } else if (image) {
      const u = image.uniforms;
      writeShape(d, at, u);
      writeMisc(d, at, 0, u['opacity']!.value, material.opacity, UiQuadKind.Image);
      writeUv(d, at, u['repeat']!.value.x, u['repeat']!.value.y, u['offset']!.value.x, u['offset']!.value.y);
      texture = image.texture;
    } else if (material.map && material.color) {
      // Text and `<canvas>`: `vec4(color, 1) × map`, uvTransform of the map (repeat/offset, no rotation).
      const map = material.map;
      writeColor(d, at + QUAD_TOP_AT, material.color, 1);
      writeMisc(d, at, 0, 1, material.opacity, UiQuadKind.Tinted);
      writeUv(d, at, map.repeat.x, map.repeat.y, map.offset.x, map.offset.y);
      texture = map;
    } else {
      return undefined;
    }
    const e = mesh.matrixWorld.elements;
    for (let i = 0; i < MAT4_FLOATS; i++) d[at + QUAD_MATRIX_AT + i] = e[i]!;
    return texture;
  }

  private _addToBatch(texture: Texture | null): void {
    const last = this.batchCount > 0 ? this.batches[this.batchCount - 1]! : null;
    if (last && last.texture === texture) {
      last.count++;
      return;
    }
    let batch = this.batches[this.batchCount];
    if (!batch) this.batches.push((batch = { texture, first: 0, count: 0 }));
    batch.texture = texture;
    batch.first = this.count;
    batch.count = 1;
    this.batchCount++;
  }
}

function writeShape(d: Float32Array, at: number, u: Uniforms): void {
  d[at + QUAD_SHAPE_AT] = u['size']!.value.x;
  d[at + QUAD_SHAPE_AT + 1] = u['size']!.value.y;
  d[at + QUAD_SHAPE_AT + 2] = u['radius']!.value;
  d[at + QUAD_SHAPE_AT + 3] = u['borderWidth']?.value ?? 0;
}

function writeColor(d: Float32Array, at: number, c: { r: number; g: number; b: number }, alpha: number): void {
  d[at] = c.r;
  d[at + 1] = c.g;
  d[at + 2] = c.b;
  d[at + 3] = alpha;
}

function writeMisc(d: Float32Array, at: number, axis: number, fill: number, opacity: number, kind: number): void {
  d[at + QUAD_MISC_AT] = axis;
  d[at + QUAD_MISC_AT + 1] = fill;
  d[at + QUAD_MISC_AT + 2] = opacity;
  d[at + QUAD_MISC_AT + 3] = kind;
}

function writeUv(d: Float32Array, at: number, rx: number, ry: number, ox: number, oy: number): void {
  d[at + QUAD_UV_AT] = rx;
  d[at + QUAD_UV_AT + 1] = ry;
  d[at + QUAD_UV_AT + 2] = ox;
  d[at + QUAD_UV_AT + 3] = oy;
}
