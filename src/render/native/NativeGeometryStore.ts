/**
 * GPU vertex/index buffers of the native renderer (R1.1, SPEC-0495): one set per geometry and per
 * object's instance attributes, kept in sync by the three's `version`. Split out of
 * `NativeRenderer.ts` (SPEC-0682, SPEC-0668), no change of behavior.
 */
import type { Object3D } from 'three';
import { INSTANCE_MATRIX_COLUMNS } from './models/NativeModel.js';
import {
  BUFFER_COPY_DST,
  BUFFER_INDEX,
  BUFFER_STORAGE,
  BUFFER_VERTEX,
  FLOAT_BYTES,
  MAT4_COLUMN_BYTES,
  MAT4_FLOATS,
  OBJECT_SEMANTICS,
  SKIN_HEADER_FLOATS,
  vertexFormat,
  type AttributeLike,
  type GeoState,
  type GeometryLike,
  type Gpu,
  type NativeRendererHost,
  type VertexSet,
} from './nativeRendererShared.js';

export class NativeGeometryStore {
  private readonly _geos = new WeakMap<object, GeoState>();
  /** Frame of the last `skeleton.update()` per skeleton (a skeleton shared by meshes updates once). */
  private readonly _skeletonFrames = new WeakMap<object, number>();

  constructor(
    private readonly _device: Gpu,
    private readonly _host: NativeRendererHost,
  ) {}

  /**
   * Per-object vertex buffers: `instanceColor` at its semantic's location, then the 4 columns of
   * `instanceMatrix` after the model's attributes (`coreWgsl` with `instanced`). A string = refusal.
   */
  instanceSet(object: Object3D, semantics: readonly string[], instanced: boolean): VertexSet | string {
    const o = object as Object3D & { instanceMatrix?: AttributeLike; instanceColor?: AttributeLike | null };
    const set: VertexSet = { buffers: [], sources: [], layouts: [], key: '' };
    const add = (attr: AttributeLike, attributes: VertexSet['layouts'][number]['attributes']): void => {
      set.buffers.push(this._uploadBuffer(attr.array, BUFFER_VERTEX));
      set.sources.push({ src: attr, array: attr.array, seen: attr.version });
      set.layouts.push({ arrayStride: attr.itemSize * FLOAT_BYTES, stepMode: 'instance', attributes });
    };
    const colorAt = semantics.indexOf('instanceColor');
    if (colorAt >= 0) {
      const ic = o.instanceColor;
      if (!ic || vertexFormat(ic.array, ic.itemSize, ic.normalized) !== 'float32x3') return 'attribute:instanceColor';
      add(ic, [{ shaderLocation: colorAt, offset: 0, format: 'float32x3' }]);
    }
    if (instanced) {
      const im = o.instanceMatrix;
      if (!im || !(im.array instanceof Float32Array) || im.itemSize !== MAT4_FLOATS) return 'attribute:instanceMatrix';
      const columns = [];
      for (let col = 0; col < INSTANCE_MATRIX_COLUMNS; col++) {
        columns.push({ shaderLocation: semantics.length + col, offset: col * MAT4_COLUMN_BYTES, format: 'float32x4' });
      }
      add(im, columns);
    }
    set.key = `${colorAt >= 0 ? 'c' : ''}${instanced ? 'm' : ''}`;
    return set;
  }

  /** Own GPU buffers for the attributes the variant reads; a string = refusal reason. */
  geometry(geometry: GeometryLike, semantics: readonly string[]): GeoState | string {
    const key = semantics.join();
    const known = this._geos.get(geometry);
    if (known && !known.stale && known.key.startsWith(key + '#')) return known;
    if (Object.values(geometry.morphAttributes).some((l) => l.length > 0)) return 'morph';
    const geo: GeoState = {
      buffers: [], sources: [], layouts: [], index: null, index32: false, indexSource: null, indexSeen: -1, key: '', stale: false,
    };
    const bySource = new Map<object, number>();
    const parts: string[] = [];
    for (let loc = 0; loc < semantics.length; loc++) {
      if (OBJECT_SEMANTICS.has(semantics[loc]!)) continue;
      const attr = geometry.attributes[semantics[loc]!];
      if (!attr) return `attribute:${semantics[loc]}`;
      const array = attr.isInterleavedBufferAttribute ? attr.data!.array : attr.array;
      const format = vertexFormat(array, attr.itemSize, attr.normalized);
      if (!format) return `format:${semantics[loc]}`;
      const bytes = (array as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
      const stride = attr.isInterleavedBufferAttribute ? attr.data!.stride * bytes : attr.itemSize * bytes;
      const offset = attr.isInterleavedBufferAttribute ? (attr.offset ?? 0) * bytes : 0;
      const source = attr.isInterleavedBufferAttribute ? attr.data! : attr;
      // InstancedBufferAttribute of the geometry (a game WGSL's per-instance data, SPEC-0565).
      const stepMode = (attr.isInterleavedBufferAttribute ? attr.data!.isInstancedInterleavedBuffer : attr.isInstancedBufferAttribute) ? 'instance' : 'vertex';
      let slot = bySource.get(source);
      if (slot === undefined) {
        slot = geo.buffers.length;
        bySource.set(source, slot);
        geo.buffers.push(this._uploadBuffer(array, BUFFER_VERTEX));
        geo.sources.push({ src: source, array, seen: source.version });
        geo.layouts.push({ arrayStride: stride, stepMode, attributes: [] });
      }
      geo.layouts[slot]!.attributes.push({ shaderLocation: loc, offset, format });
      parts.push(`${slot}:${stride}:${offset}:${format}:${stepMode}`);
    }
    if (geometry.index) {
      const idx = geometry.index;
      geo.index32 = !(idx.array instanceof Uint16Array);
      geo.index = this._uploadBuffer(idx.array, BUFFER_INDEX);
      geo.indexSource = idx;
      geo.indexSeen = idx.version;
    }
    geo.key = `${key}#${parts.join('|')}`;
    this._geos.set(geometry, geo);
    return geo;
  }

  /** Rewrites the buffers whose source version changed; `false` = a source array was replaced. */
  refreshSet(set: VertexSet): boolean {
    for (let i = 0; i < set.sources.length; i++) {
      const s = set.sources[i]!;
      if (s.src.array !== s.array) return false;
      const v = s.src.version;
      if (v !== s.seen) {
        s.seen = v;
        this._device.queue.writeBuffer(set.buffers[i], 0, s.array);
        this._syncThreeCopy(s.src, s.array);
      }
    }
    return true;
  }

  /**
   * Keeps the three's GPU copy of a source we rewrote coherent (SPEC-0555, "Céu de dia"): the three
   * does not re-upload an attribute it stopped drawing while we owned it, so an object that goes back
   * to the three (refusal, the parity arm) drew stale data. Only where the three already has a buffer.
   */
  private _syncThreeCopy(src: object, array: ArrayBufferView): void {
    const copy = this._host.backend.get(src)['buffer'];
    if (copy) this._device.queue.writeBuffer(copy, 0, array);
  }

  refreshGeometry(geometry: GeometryLike, geo: GeoState): boolean {
    const idx = geo.indexSource;
    if (!this.refreshSet(geo) || geometry.index !== idx) {
      geo.stale = true;
      return false;
    }
    if (idx && idx.version !== geo.indexSeen) {
      geo.indexSeen = idx.version;
      this._device.queue.writeBuffer(geo.index, 0, idx.array);
    }
    return true;
  }

  private _uploadBuffer(array: ArrayBufferView, usage: number): Gpu {
    // writeBuffer needs a 4-byte multiple; a uint16 index buffer with an odd count is padded.
    const size = Math.ceil(array.byteLength / FLOAT_BYTES) * FLOAT_BYTES;
    const buffer = this._device.createBuffer({ size, usage: usage | BUFFER_COPY_DST });
    if (size === array.byteLength) this._device.queue.writeBuffer(buffer, 0, array);
    else {
      const padded = new Uint8Array(size);
      padded.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      this._device.queue.writeBuffer(buffer, 0, padded);
    }
    return buffer;
  }

  /** Skin storage of a SkinnedMesh: bindMatrix, bindMatrixInverse, then its skeleton's bones. */
  skinBuffer(object: Object3D): { buffer: Gpu; data: Float32Array } | null {
    const skeleton = (object as Object3D & { skeleton?: { boneMatrices: Float32Array | null; bones: unknown[] } }).skeleton;
    if (!skeleton || skeleton.bones.length === 0) return null;
    const data = new Float32Array(SKIN_HEADER_FLOATS + skeleton.bones.length * MAT4_FLOATS);
    const buffer = this._device.createBuffer({ label: 'native.skin', size: data.byteLength, usage: BUFFER_STORAGE | BUFFER_COPY_DST });
    return { buffer, data };
  }

  /** Per frame: `skeleton.update()` once per skeleton (like the three's SkinningNode), then the storage. */
  writeSkin(object: Object3D, skin: { buffer: Gpu; data: Float32Array }, frame: number): void {
    const o = object as Object3D & {
      bindMatrix: { elements: ArrayLike<number> }; bindMatrixInverse: { elements: ArrayLike<number> };
      skeleton: { update(): void; boneMatrices: Float32Array };
    };
    if (this._skeletonFrames.get(o.skeleton) !== frame) {
      this._skeletonFrames.set(o.skeleton, frame);
      o.skeleton.update();
    }
    const d = skin.data;
    for (let i = 0; i < MAT4_FLOATS; i++) {
      d[i] = o.bindMatrix.elements[i]!;
      d[MAT4_FLOATS + i] = o.bindMatrixInverse.elements[i]!;
    }
    d.set(o.skeleton.boneMatrices.subarray(0, d.length - SKIN_HEADER_FLOATS), SKIN_HEADER_FLOATS);
    this._device.queue.writeBuffer(skin.buffer, 0, d);
  }
}
