/**
 * The shadow pass's geometry source with the native renderer attached (ADR-0692): the native store's
 * buffer first, then the three's backend, then an upload through the native store (position + index
 * only), reused later by the main draw. The texture of an alpha-clipped caster goes up the same way
 * the native materials upload theirs (`_textures.updateTexture/updateSampler`).
 */
import type * as THREE from 'three';
import { geometryBuffers } from '../GeometryDesc.js';
import {
  ThreeShadowSource,
  type ShadowBuffersResult,
  type ShadowGeometrySource,
  type ShadowSourceBackend,
  type ShadowUvSlot,
} from '../ShadowGeometrySource.js';
import type { NativeGeometryStore } from './NativeGeometryStore.js';
import { uploadedTexture, type GeometryLike, type NativeRendererHost } from './nativeRendererShared.js';

export class NativeShadowSource implements ShadowGeometrySource {
  readonly kind = 'nativo';
  private readonly _three: ThreeShadowSource;

  constructor(
    private readonly _store: NativeGeometryStore,
    private readonly _host: NativeRendererHost,
  ) {
    this._three = new ThreeShadowSource(_host.backend as unknown as ShadowSourceBackend);
  }

  get uploadedBytes(): number {
    return this._store.uploadedBytes;
  }

  buffers(geometry: THREE.BufferGeometry, upload: boolean): ShadowBuffersResult {
    const geo = geometry as unknown as GeometryLike;
    const own = this._store.shadowBuffers(geo, false);
    if (own !== null) return own;
    const three = geometryBuffers(this._host.backend as unknown as ShadowSourceBackend, geometry);
    if (three) return three;
    return upload ? this._store.shadowBuffers(geo, true) : null;
  }

  uv(geometry: THREE.BufferGeometry, out: ShadowUvSlot): boolean {
    const geo = geometry as unknown as GeometryLike;
    return this._store.uvSlot(geo, false, out) || this._three.uv(geometry, out) || this._store.uvSlot(geo, true, out);
  }

  /** The shadow-only copies of the store follow `version`, array swaps and the three's own copy (ADR-0692). */
  refresh(): void {
    this._store.refreshShadowSources();
  }

  forget(geometry: THREE.BufferGeometry): void {
    this._store.forgetShadowSources(geometry as unknown as GeometryLike);
  }

  /**
   * The map's GPU texture. In the steady state it is there and current: only a missing one (a caster the main
   * pass never drew) or one behind its `version` (the image loaded after a placeholder upload) pays the upload.
   * The three's default 1×1 placeholder (`createDefaultTexture`, no `version` in the backend data) is never taken as
   * the map: the alpha clip would keep it for good, since its fast path only rereads when the map changes.
   */
  texture(map: unknown): unknown {
    const data = this._host.backend.get(map) as { texture?: unknown; version?: number };
    const version = (map as { version?: number }).version;
    if (data.texture && data.version === version) return data.texture;
    return uploadedTexture(this._host, map);
  }

  onBufferReplaced(listener: (source: object) => void): () => void {
    return this._store.onBufferReplaced(listener);
  }
}
