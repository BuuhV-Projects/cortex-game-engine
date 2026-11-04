/**
 * Render pipelines and shader modules of the native renderer (R1.1, SPEC-0495), cached by key.
 * Split out of `NativeRenderer.ts` (SPEC-0682, SPEC-0668), no change of behavior.
 */
import { debug } from '../../core/debug.js';
import { recordNativePipelineBirth } from '../../core/PipelineBirthLog.js';
import { coreWgsl } from './models/NativeModel.js';
import type { NativeMaterialStore } from './NativeMaterialStore.js';
import { MS_DIGITS, colorTarget, type Gpu, type Inst, type NativeRendererStats } from './nativeRendererShared.js';

/** Bind group layouts the renderer owns (group 2, the material's, comes from the material store). */
export interface NativeLayouts {
  view: Gpu;
  frame: Gpu;
  object: Gpu;
  objectSkinned: Gpu;
}

export class NativePipelineStore {
  private readonly _pipelines = new Map<string, Gpu>();
  private readonly _modules = new Map<string, Gpu>();

  constructor(
    private readonly _device: Gpu,
    private readonly _layouts: NativeLayouts,
    private readonly _frameWgsl: string,
    private readonly _materials: NativeMaterialStore,
    private readonly _stats: NativeRendererStats,
  ) {}

  /** `frame` only names the frame in the birth log. */
  pipeline(inst: Inst, color: string, depth: string, samples: number, target: string, cull: string, frame: number): Gpu | null {
    const mat = inst.mat;
    const extraKey = inst.extra ? inst.extra.key : '';
    const key = `${mat.model.name}|${mat.variant.join('+')}|${inst.geo.key}|${extraKey}|${inst.state.key}|${cull}|${mat.kinds}|${target}`;
    let pipeline = this._pipelines.get(key);
    if (pipeline) return pipeline;
    const start = performance.now();
    const codeKey = `${mat.model.name}|${mat.variant.join('+')}${inst.instanced ? '|instanced' : ''}${inst.skin ? '|skinned' : ''}`;
    let module = this._modules.get(codeKey);
    if (!module) {
      const core = { instanced: inst.instanced, skinned: inst.skin !== null, attributeTypes: mat.model.attributeTypes };
      const code = coreWgsl(mat.model.attributes(mat.variant), this._frameWgsl, core) + mat.model.wgsl(mat.variant);
      module = this._device.createShaderModule({ label: `native.${codeKey}`, code });
      this._modules.set(codeKey, module);
    }
    const layout = this._device.createPipelineLayout({
      bindGroupLayouts: [
        this._layouts.view, this._layouts.frame, this._materials.layout(mat.kinds), inst.skin ? this._layouts.objectSkinned : this._layouts.object,
      ],
    });
    const s = inst.state;
    const depthStencil: Record<string, unknown> = { format: depth, depthWriteEnabled: s.depthWrite, depthCompare: 'less-equal' };
    if (s.bias) {
      depthStencil['depthBias'] = s.bias[0];
      depthStencil['depthBiasSlopeScale'] = s.bias[1];
      depthStencil['depthBiasClamp'] = 0;
    }
    pipeline = this._device.createRenderPipeline({
      label: `native.${codeKey}`,
      layout,
      vertex: { module, entryPoint: 'vs', buffers: inst.extra ? [...inst.geo.layouts, ...inst.extra.layouts] : inst.geo.layouts },
      fragment: { module, entryPoint: 'fs', targets: [colorTarget(s, color)] },
      primitive: { topology: 'triangle-list', cullMode: cull, frontFace: 'ccw' },
      depthStencil,
      multisample: { count: samples },
    });
    this._pipelines.set(key, pipeline);
    const ms = performance.now() - start;
    this._stats.pipelines++;
    this._stats.pipelineMs += ms;
    recordNativePipelineBirth(inst.object, inst.material, ms, key);
    debug('perf', `[nativeRenderer] pipeline born frame=${frame} ${key} ${ms.toFixed(MS_DIGITS)}ms`);
    return pipeline;
  }
}
