/**
 * GPU vertex/index buffers of the native renderer (R1.1, SPEC-0495): one set per geometry and per
 * object's instance attributes, kept in sync by the three's `version`. Split out of
 * `NativeRenderer.ts` (SPEC-0682, SPEC-0668).
 *
 * GPU buffers are cached per SOURCE (attribute, `InterleavedBuffer` or index, ADR-0692): the variants of
 * semantics over one geometry (depth `position`, main `position,normal,uv`) share the buffer instead of
 * uploading it again, and the shadow pass reads the same buffers (`shadowBuffers`, `uvSlot`). A source whose
 * array was replaced gets a new buffer, and `onBufferReplaced` listeners hear of it (the caster registry
 * registers the id again).
 *
 * A source uploaded by the shadow pass that no main-draw state uses yet (`_shadowOnly`) is nobody else's to keep
 * current: the three draws that mesh and rewrites only its own copy. `refreshShadowSources` (per frame, from the
 * caster registry) rewrites it on `version`, rebuilds it on a replaced array, and hands the shadow pass over to the
 * three's copy as soon as the three has one (no VRAM twice, `needsUpdate` followed).
 */
import type { Object3D } from 'three';
import type { GeometryBuffers } from '../GeometryDesc.js';
import { POSITION_FORMAT_REFUSAL, uvLayoutInto, type ShadowUvSlot, type UvLayout } from '../ShadowGeometrySource.js';
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

/** Components of a shadow-pass position (`float32x3`). */
const POSITION_COMPONENTS = 3;
/** Refusal of `shadowBuffers` that retrying does not fix (besides the position format). */
const INDEX_FORMAT = 'indice-nao-uint16-uint32';

/** The GPU buffer of one source and what it holds: the array uploaded, its `version` and the usage flags. */
interface SourceBuffer {
  buffer: Gpu;
  array: ArrayBufferView;
  seen: number;
  usage: number;
}

/** A source of a GPU buffer: an attribute, an `InterleavedBuffer` or an index. */
type BufferSource = { array: ArrayBufferView; version: number };

export class NativeGeometryStore {
  private readonly _geos = new WeakMap<object, GeoState>();
  /** GPU buffer per source (ADR-0692): shared by every variant and by the shadow pass. */
  private readonly _bySource = new WeakMap<object, SourceBuffer>();
  private readonly _replacedListeners = new Set<(source: object) => void>();
  /** Sources uploaded by the shadow pass that no main-draw state uses: `refreshShadowSources` keeps them current. */
  private readonly _shadowOnly = new Set<BufferSource>();
  /** Reused `uv` layout of `uvSlot` (no allocation per frame). */
  private readonly _uvLayout: UvLayout = { owner: null, stride: 0, offset: 0 };
  /** Bytes uploaded so far (the shadow registry's per-frame budget is the difference). */
  uploadedBytes = 0;
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
        geo.buffers.push(this._bufferFor(source, array, BUFFER_VERTEX));
        // The main draw owns the source now: `refreshSet` keeps it current.
        this._shadowOnly.delete(source);
        geo.sources.push({ src: source, array, seen: source.version });
        geo.layouts.push({ arrayStride: stride, stepMode, attributes: [] });
      }
      geo.layouts[slot]!.attributes.push({ shaderLocation: loc, offset, format });
      parts.push(`${slot}:${stride}:${offset}:${format}:${stepMode}`);
    }
    if (geometry.index) {
      const idx = geometry.index;
      geo.index32 = !(idx.array instanceof Uint16Array);
      geo.index = this._bufferFor(idx, idx.array, BUFFER_INDEX);
      this._shadowOnly.delete(idx);
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
        this._write(set.buffers[i], s.array);
        this._markShared(s.src, set.buffers[i], v);
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
    if (copy) this._write(copy, array);
  }

  /** The buffer is the shared per-source one (ADR-0692): mark its version there too, so it is not written twice. */
  private _markShared(src: object, buffer: Gpu, version: number): void {
    const shared = this._bySource.get(src);
    if (shared && shared.buffer === buffer) shared.seen = version;
  }

  refreshGeometry(geometry: GeometryLike, geo: GeoState): boolean {
    const idx = geo.indexSource;
    if (!this.refreshSet(geo) || geometry.index !== idx) {
      geo.stale = true;
      return false;
    }
    if (idx && idx.version !== geo.indexSeen) {
      geo.indexSeen = idx.version;
      this._write(geo.index, idx.array);
      this._markShared(idx, geo.index, idx.version);
    }
    return true;
  }

  /** Hears of a source's buffer being rebuilt (its array was replaced); returns the `off`. */
  onBufferReplaced(listener: (source: object) => void): () => void {
    this._replacedListeners.add(listener);
    return () => this._replacedListeners.delete(listener);
  }

  /**
   * The shadow pass's view of a geometry (ADR-0692): the `position` buffer (only `float32x3`, not normalized)
   * and the index. Without `upload`, only what the store already holds (`null` = not here); with it, uploads
   * position and index through the same per-source cache, so the main draw reuses them later. `null` also covers
   * "no data yet" (no position, or empty): like the three's `geometryBuffers`, it stays pending until filled. A
   * string is a refusal that retrying does not fix.
   */
  shadowBuffers(geometry: GeometryLike, upload: boolean): GeometryBuffers | string | null {
    const pos = geometry.attributes['position'];
    if (!pos) return null;
    const interleaved = pos.isInterleavedBufferAttribute === true;
    const array = interleaved ? pos.data!.array : pos.array;
    if (!(array instanceof Float32Array) || pos.itemSize !== POSITION_COMPONENTS || pos.normalized) return POSITION_FORMAT_REFUSAL;
    const idx = geometry.index;
    if (idx && !(idx.array instanceof Uint16Array) && !(idx.array instanceof Uint32Array)) return INDEX_FORMAT;
    const indexCount = idx ? idx.count : 0;
    const vertexCount = idx ? 0 : pos.count;
    if (indexCount === 0 && vertexCount === 0) return null;
    const vertexBuffer = this._sourceBuffer(interleaved ? pos.data! : pos, array, BUFFER_VERTEX, upload);
    if (vertexBuffer === null) return null;
    const indexBuffer = idx ? this._sourceBuffer(idx, idx.array, BUFFER_INDEX, upload) : null;
    if (idx && indexBuffer === null) return null;
    return {
      vertexBuffer,
      indexBuffer,
      indexCount,
      vertexCount,
      indexIs32Bit: idx ? !(idx.array instanceof Uint16Array) : false,
      vertexStride: interleaved ? pos.data!.stride * FLOAT_BYTES : POSITION_COMPONENTS * FLOAT_BYTES,
      vertexOffset: interleaved ? (pos.offset ?? 0) * FLOAT_BYTES : 0,
    };
  }

  /**
   * Writes into `out` the buffer slot carrying the `uv` (stride and offset in bytes); with `upload`, uploads it when
   * missing. `false` = no buffer. No allocation: the alpha clip asks every frame.
   */
  uvSlot(geometry: GeometryLike, upload: boolean, out: ShadowUvSlot): boolean {
    const uv = geometry.attributes['uv'];
    const layout = this._uvLayout;
    if (!uv || !uvLayoutInto(uv, layout)) return false;
    const array = uv.isInterleavedBufferAttribute === true ? uv.data!.array : uv.array;
    const buffer = this._sourceBuffer(layout.owner as BufferSource, array, BUFFER_VERTEX, upload);
    if (buffer === null) return false;
    out.buffer = buffer;
    out.stride = layout.stride;
    out.offset = layout.offset;
    return true;
  }

  /**
   * Per frame (the caster registry): keeps the shadow-only sources current. Cost proportional to them alone (zero
   * once the main draws own their sources or the three has its copies).
   */
  refreshShadowSources(): void {
    if (this._shadowOnly.size > 0) this._shadowOnly.forEach(this._refreshShadowOnly);
  }

  /** The geometry was disposed: stop refreshing its shadow-only sources (they would hold its arrays, SPEC-0289). */
  forgetShadowSources(geometry: GeometryLike): void {
    if (this._shadowOnly.size === 0) return;
    const pos = geometry.attributes['position'];
    if (pos) this._shadowOnly.delete((pos.isInterleavedBufferAttribute === true ? pos.data! : pos) as BufferSource);
    if (geometry.index) this._shadowOnly.delete(geometry.index);
    const uv = geometry.attributes['uv'];
    if (uv) this._shadowOnly.delete((uv.isInterleavedBufferAttribute === true ? uv.data! : uv) as BufferSource);
  }

  /**
   * One shadow-only source: (a) the three drew the mesh and holds its own copy, which its `needsUpdate` keeps
   * current: forget ours and tell the listeners (the registry registers the id again, now with the three's buffer,
   * and the host's release drops ours); (b) its array was replaced: upload again (the listeners hear of it); (c)
   * otherwise rewrite it when the version moved.
   */
  private readonly _refreshShadowOnly = (source: BufferSource): void => {
    const known = this._bySource.get(source);
    if (!known) {
      this._shadowOnly.delete(source);
      return;
    }
    if (this._host.backend.get(source)['buffer']) {
      this._bySource.delete(source);
      this._shadowOnly.delete(source);
      this._replacedListeners.forEach((listener) => listener(source));
      return;
    }
    if (source.array !== known.array) this._bufferFor(source, source.array, known.usage);
    else this._refreshSource(source, known);
  };

  /** The cached buffer of a source (refreshed when its version moved), or a new upload when `upload`. */
  private _sourceBuffer(source: BufferSource, array: ArrayBufferView, usage: number, upload: boolean): Gpu | null {
    const known = this._bySource.get(source);
    if (upload) {
      const buffer = this._bufferFor(source, array, usage);
      // A new upload here is the shadow pass's alone until a main-draw state takes the source.
      if (this._bySource.get(source) !== known) this._shadowOnly.add(source);
      return buffer;
    }
    if (!known || known.array !== array || (known.usage & usage) !== usage) return null;
    this._refreshSource(source, known);
    return known.buffer;
  }

  /**
   * The GPU buffer of a source: the cached one when it still holds this array (rewritten if the version moved),
   * otherwise a new upload — and, when it replaces one, the listeners hear of it.
   */
  private _bufferFor(source: BufferSource, array: ArrayBufferView, usage: number): Gpu {
    const known = this._bySource.get(source);
    if (known && known.array === array && (known.usage & usage) === usage) {
      this._refreshSource(source, known);
      return known.buffer;
    }
    // A source read as vertex AND index (rare) keeps both usages in one buffer.
    const flags = usage | (known && known.array === array ? known.usage : 0);
    const entry: SourceBuffer = { buffer: this._uploadBuffer(array, flags), array, seen: source.version, usage: flags };
    this._bySource.set(source, entry);
    if (known) this._replacedListeners.forEach((listener) => listener(source));
    return entry.buffer;
  }

  private _refreshSource(source: BufferSource, known: SourceBuffer): void {
    if (known.seen === source.version) return;
    known.seen = source.version;
    this._write(known.buffer, known.array);
  }

  private _uploadBuffer(array: ArrayBufferView, usage: number): Gpu {
    // writeBuffer needs a 4-byte multiple; a uint16 index buffer with an odd count is padded.
    const size = Math.ceil(array.byteLength / FLOAT_BYTES) * FLOAT_BYTES;
    const buffer = this._device.createBuffer({ size, usage: usage | BUFFER_COPY_DST });
    this.uploadedBytes += size;
    this._write(buffer, array);
    return buffer;
  }

  /** `writeBuffer` of the whole array, padded to the 4-byte multiple it needs (odd uint16 index count). */
  private _write(buffer: Gpu, array: ArrayBufferView): void {
    const size = Math.ceil(array.byteLength / FLOAT_BYTES) * FLOAT_BYTES;
    if (size === array.byteLength) this._device.queue.writeBuffer(buffer, 0, array);
    else {
      const padded = new Uint8Array(size);
      padded.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      this._device.queue.writeBuffer(buffer, 0, padded);
    }
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
