/**
 * Materials of the native renderer (R1.1, SPEC-0495): params buffer, textures and group 2, checked
 * once per frame per material (SPEC-0495 §4). Split out of `NativeRenderer.ts` (SPEC-0682,
 * SPEC-0668), no change of behavior.
 */
import type { Material } from 'three';
import type { NativeModelDef } from './models/NativeModel.js';
import {
  BUFFER_COPY_DST,
  BUFFER_UNIFORM,
  FILTERABLE,
  FLOAT_BYTES,
  FLOAT_TYPE,
  NOT_READY,
  STAGE_FRAGMENT,
  STAGE_VERTEX,
  TINT_DELTA,
  UNFILTERABLE,
  uploadedTexture,
  type Gpu,
  type MatState,
  type NativeRendererHost,
  type NativeRendererStats,
} from './nativeRendererShared.js';

export class NativeMaterialStore {
  private readonly _mats = new WeakMap<Material, MatState>();
  /** Group-2 layouts by texture kinds (`f`/`u` per texture). */
  private readonly _layouts = new Map<string, Gpu>();

  constructor(
    private readonly _device: Gpu,
    private readonly _host: NativeRendererHost,
    private readonly _stats: NativeRendererStats,
    private readonly _tint: boolean,
  ) {}

  material(material: Material, model: NativeModelDef, variant: string[]): MatState | null {
    const known = this._mats.get(material);
    if (known && known.model === model && known.variant.join() === variant.join()) return known;
    const mat: MatState = {
      model, variant, version: material.version,
      params: new Float32Array(model.paramFloats),
      scratch: new Float32Array(model.paramFloats),
      buffer: this._device.createBuffer({ label: `native.${model.name}`, size: model.paramFloats * FLOAT_BYTES, usage: BUFFER_UNIFORM | BUFFER_COPY_DST }),
      textures: [...model.textures(material, variant)],
      kinds: '',
      gpuTextures: [],
      textureVersions: [],
      group: null,
      frame: -1,
      generation: known ? known.generation + 1 : 0,
    };
    this._writeParams(material, mat, mat.params);
    this._device.queue.writeBuffer(mat.buffer, 0, mat.params);
    if (!this._bindMaterial(mat)) return null;
    this._mats.set(material, mat);
    return mat;
  }

  refreshMaterial(material: Material, mat: MatState): void {
    if (material.version !== mat.version) {
      // needsUpdate: textures or code may have changed; rebuild the group, keep the variant check
      // for the next take (a changed classification refuses through `_build`).
      mat.version = material.version;
      mat.textures = [...mat.model.textures(material, mat.variant)];
      this._bindMaterial(mat);
    } else {
      // Like the three's bindings, only a moved `texture.version` reaches the upload (updateSampler
      // builds a string key per call). A render target's GPU texture is recreated on resize without a
      // version bump, so it is checked every frame (SPEC-0585 1a).
      for (let i = 0; i < mat.textures.length; i++) {
        const tex = mat.textures[i] as { version: number; isRenderTargetTexture?: boolean };
        if (tex.version === mat.textureVersions[i] && !tex.isRenderTargetTexture) continue;
        if (this._gpuTexture(tex) !== mat.gpuTextures[i]) {
          this._bindMaterial(mat);
          break;
        }
        mat.textureVersions[i] = tex.version;
      }
    }
    this._writeParams(material, mat, mat.scratch);
    const a = mat.params;
    const b = mat.scratch;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        a.set(b);
        this._device.queue.writeBuffer(mat.buffer, 0, a);
        this._stats.paramWrites++;
        return;
      }
    }
  }

  /** Model params, plus the known-answer tint (every model starts its block with the color). */
  private _writeParams(material: Material, mat: MatState, out: Float32Array): void {
    mat.model.writeParams(material, out);
    if (this._tint) out[0] = out[0]! + TINT_DELTA;
  }

  /** The three's uploaded GPU texture (uploading it if needed); `null` = not ready. */
  private _gpuTexture(texture: unknown): unknown {
    return uploadedTexture(this._host, texture);
  }

  private _bindMaterial(mat: MatState): boolean {
    const entries: unknown[] = [{ binding: 0, resource: { buffer: mat.buffer } }];
    mat.gpuTextures = [];
    mat.textureVersions = mat.textures.map(() => NOT_READY);
    for (let i = 0; i < mat.textures.length; i++) {
      const tex = mat.textures[i];
      const gpu = this._gpuTexture(tex) as { createView(): unknown } | null;
      const sampler = this._host.backend.get(tex)['sampler'];
      if (!gpu || !sampler) return false;
      mat.gpuTextures.push(gpu);
      mat.textureVersions[i] = (tex as { version: number }).version;
      entries.push({ binding: 1 + 2 * i, resource: sampler }, { binding: 2 + 2 * i, resource: gpu.createView() });
    }
    mat.kinds = mat.textures.map((t) => ((t as { type?: number }).type === FLOAT_TYPE ? UNFILTERABLE : FILTERABLE)).join('');
    mat.group = this._device.createBindGroup({ layout: this.layout(mat.kinds), entries });
    mat.generation++;
    return true;
  }

  /** Group-2 layout for these texture kinds (`f`/`u` per texture), visible in both stages. */
  layout(kinds: string): Gpu {
    let layout = this._layouts.get(kinds);
    if (!layout) {
      const entries: unknown[] = [{ binding: 0, visibility: STAGE_VERTEX | STAGE_FRAGMENT, buffer: { type: 'uniform' } }];
      for (let i = 0; i < kinds.length; i++) {
        const unfilterable = kinds[i] === UNFILTERABLE;
        entries.push(
          { binding: 1 + 2 * i, visibility: STAGE_VERTEX | STAGE_FRAGMENT, sampler: { type: unfilterable ? 'non-filtering' : 'filtering' } },
          { binding: 2 + 2 * i, visibility: STAGE_VERTEX | STAGE_FRAGMENT, texture: { sampleType: unfilterable ? 'unfilterable-float' : 'float' } },
        );
      }
      layout = this._device.createBindGroupLayout({ label: `native.material.${kinds}`, entries });
      this._layouts.set(kinds, layout);
    }
    return layout;
  }
}
