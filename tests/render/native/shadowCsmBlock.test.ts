/**
 * O `ShadowBlock` em modo CSM (SPEC-0690, item 5): dirige o nó uma vez por quadro, escreve uma matriz e liga uma
 * textura por cascata (bindings 10..15), aumenta `version` na troca, e não toca no sol principal. E o WGSL do
 * receptor com o ramo da CSM.
 */
import { describe, expect, it, vi } from 'vitest';
import { DirectionalLight, PCFSoftShadowMap, Scene } from 'three';

vi.mock('../../../src/core/NativeSceneMirror.js', () => ({ activeSceneMirror: () => undefined }));

import { ShadowBlock, SHADOW_ENABLED_AT, SHADOW_LAST_BINDING, SHADOW_MAP_SIZE_AT, SHADOW_UBO_FLOATS } from '../../../src/render/native/frame/shadow.js';
import {
  CASCADE_BIAS_AT,
  CASCADE_ENABLED_AT,
  CASCADE_MATRIX_AT,
  CASCADE_NORMAL_BIAS_AT,
  CASCADE_RANGE_AT,
  CSM_CAMERA_NEAR_AT,
  CSM_CASCADE_FLOATS,
  CSM_CASCADES_AT,
  CSM_COUNT_AT,
  CSM_FADE_AT,
  CSM_FIRST_MAP_BINDING,
  CSM_MAX_CASCADES,
  CSM_SHADOW_FAR_AT,
  type CsmCascadeReceiver,
  type CsmReceiverState,
} from '../../../src/render/native/frame/shadowCsm.js';
import { NativeSunShadowPass, type SunLight } from '../../../src/render/native/shadow/NativeSunShadowPass.js';
import { lambertModel } from '../../../src/render/native/models/lambert.js';
import type { NativeRendererHost } from '../../../src/render/native/NativeRenderer.js';

const MAP_SIZE = 2048;
const FRAME_ID = 41;
const STD140_ALIGN_FLOATS = 4;

function fakeHost() {
  const writes: Float32Array[] = [];
  const device = {
    createBuffer: (d: unknown) => ({ kind: 'buffer', d }),
    createSampler: (d: unknown) => ({ kind: 'sampler', d }),
    createTexture: (d: unknown) => ({ kind: 'empty', d, createView: () => ({ of: 'empty' }) }),
    queue: { writeBuffer: (_b: unknown, _o: number, a: Float32Array) => writes.push(a.slice()) },
  };
  const host = {
    backend: { device, get: () => ({}) },
    shadowMap: { enabled: true, type: PCFSoftShadowMap },
    _nodes: { nodeFrame: { frameId: FRAME_ID } },
  };
  return { device, host: host as unknown as NativeRendererHost, writes };
}

function cascade(i: number, enabled: boolean): CsmCascadeReceiver {
  return {
    enabled,
    matrix: new Float32Array(16).fill(i + 1),
    texture: { name: `cascata-${i}`, createView: () => ({ of: `cascata-${i}` }) },
    bias: -0.001 * (i + 1),
    normalBias: 0.02,
    near: i * 0.3,
    far: i === 0 ? 0.3 : 1,
  };
}

/** Um nó CSM falso: o bloco só conhece o contrato `CsmShadowSource`. */
function fakeCsm(cascades: CsmCascadeReceiver[]) {
  const state: CsmReceiverState = {
    count: cascades.length, cameraNear: 0.5, shadowFar: 100, fade: true, mapWidth: MAP_SIZE, mapHeight: MAP_SIZE, intensity: 0.8, cascades,
  };
  return { isCSMShadowNode: true as const, updateNative: vi.fn(), nativeReceiverState: () => state, state };
}

function csmScene(cascades: CsmCascadeReceiver[]) {
  const scene = new Scene();
  const sun = new DirectionalLight();
  sun.castShadow = true;
  scene.add(sun, sun.target);
  const csm = fakeCsm(cascades);
  (sun.shadow as unknown as { shadowNode: unknown }).shadowNode = csm;
  return { scene, sun, csm };
}

const views = (block: ShadowBlock) => (block.resources() as Array<{ binding: number; resource: unknown }>).slice(2).map((r) => r.resource);

describe('ShadowBlock em modo CSM (SPEC-0690)', () => {
  it('chama updateNative uma vez por quadro com o host e o frameId do three, antes de escrever', () => {
    const { device, host } = fakeHost();
    const { scene, csm } = csmScene([cascade(0, true), cascade(1, true)]);
    const block = new ShadowBlock(device, host, true, false, null);
    const camera = { isPerspectiveCamera: true };
    block.update(scene, camera);
    expect(csm.updateNative).toHaveBeenCalledTimes(1);
    expect(csm.updateNative).toHaveBeenCalledWith(camera, scene, host, FRAME_ID);
  });

  it('escreve uma matriz, bias, faixa e enabled por cascata, e os globais da CSM', () => {
    const { device, host, writes } = fakeHost();
    const { scene } = csmScene([cascade(0, true), cascade(1, true)]);
    new ShadowBlock(device, host, true, false, null).update(scene, null);
    const d = writes.at(-1)!;
    expect(d.length).toBe(SHADOW_UBO_FLOATS);
    expect(d[SHADOW_ENABLED_AT]).toBe(1);
    expect(d[CSM_COUNT_AT]).toBe(2);
    expect(d[CSM_CAMERA_NEAR_AT]).toBe(0.5);
    expect(d[CSM_SHADOW_FAR_AT]).toBe(100);
    expect(d[CSM_FADE_AT]).toBe(1);
    expect(d[SHADOW_MAP_SIZE_AT]).toBe(MAP_SIZE);
    for (let i = 0; i < 2; i++) {
      const at = CSM_CASCADES_AT + i * CSM_CASCADE_FLOATS;
      expect(Array.from(d.slice(at + CASCADE_MATRIX_AT, at + CASCADE_MATRIX_AT + 16))).toEqual(new Array(16).fill(i + 1));
      expect(d[at + CASCADE_BIAS_AT]).toBeCloseTo(-0.001 * (i + 1));
      expect(d[at + CASCADE_NORMAL_BIAS_AT]).toBeCloseTo(0.02);
      expect(d[at + CASCADE_ENABLED_AT]).toBe(1);
      expect(d[at + CASCADE_RANGE_AT + 1]).toBeCloseTo(i === 0 ? 0.3 : 1);
    }
  });

  it('liga a textura de cada cascata no binding dela, a vazia no resto, e aumenta version na troca', () => {
    const { device, host } = fakeHost();
    const cascades = [cascade(0, true), cascade(1, true)];
    const { scene } = csmScene(cascades);
    const block = new ShadowBlock(device, host, true, false, null);
    const before = block.version;
    block.update(scene, null);
    expect(block.version).toBe(before + 1);
    expect(views(block)).toEqual([{ of: 'cascata-0' }, { of: 'cascata-1' }, ...new Array(CSM_MAX_CASCADES - 2).fill({ of: 'empty' })]);
    block.update(scene, null);
    expect(block.version).toBe(before + 1);
    // O three recriou o mapa da cascata 1 (o estado do nó guarda a mesma lista).
    cascades[1]!.texture = { createView: () => ({ of: 'nova' }) };
    block.update(scene, null);
    expect(block.version).toBe(before + 2);
    expect(views(block)[1]).toEqual({ of: 'nova' });
  });

  it('cascata recusada fica desligada com a textura vazia; todas recusadas desligam a sombra', () => {
    const { device, host, writes } = fakeHost();
    const { scene } = csmScene([cascade(0, true), cascade(1, false)]);
    const block = new ShadowBlock(device, host, true, false, null);
    block.update(scene, null);
    let d = writes.at(-1)!;
    expect(d[SHADOW_ENABLED_AT]).toBe(1);
    expect(d[CSM_CASCADES_AT + CSM_CASCADE_FLOATS + CASCADE_ENABLED_AT]).toBe(0);
    expect(views(block)[1]).toEqual({ of: 'empty' });
    const off = csmScene([cascade(0, false), cascade(1, false)]);
    block.update(off.scene, null);
    d = writes.at(-1)!;
    expect(d[SHADOW_ENABLED_AT]).toBe(0);
  });

  it('com CSM não chama o updateMatrices do sol nem o NativeSunShadowPass', () => {
    const { device, host } = fakeHost();
    const { scene, sun } = csmScene([cascade(0, true)]);
    const updateMatrices = vi.spyOn(sun.shadow, 'updateMatrices');
    const pass = { update: vi.fn() } as unknown as NativeSunShadowPass;
    sun.shadow.autoUpdate = true;
    new ShadowBlock(device, host, true, false, pass).update(scene, null);
    expect(updateMatrices).not.toHaveBeenCalled();
    expect((pass as unknown as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
  });

  it('NativeSunShadowPass sai cedo com CSM sem tocar em autoUpdate/needsUpdate do sol', () => {
    const { host } = fakeHost();
    const { scene, sun } = csmScene([cascade(0, true)]);
    sun.shadow.autoUpdate = true;
    sun.shadow.needsUpdate = true;
    const pass = new NativeSunShadowPass(host as never, false, false);
    pass.update(sun as unknown as SunLight, scene, null);
    expect(sun.shadow.autoUpdate).toBe(true);
    expect(sun.shadow.needsUpdate).toBe(true);
    expect(pass.stats).toEqual({ drawn: 0, handedBack: 0 });
  });

  it('sem CSM o modo é o de mapa único (cascadeCount 0) e as cascatas 1..5 ficam vazias', () => {
    const { device, host, writes } = fakeHost();
    const scene = new Scene();
    const sun = new DirectionalLight();
    sun.castShadow = true;
    scene.add(sun);
    const block = new ShadowBlock(device, host, true, false, null);
    block.update(scene, null);
    expect(writes.at(-1)![CSM_COUNT_AT]).toBe(0);
    expect(views(block).every((v) => (v as { of: string }).of === 'empty')).toBe(true);
  });
});

describe('layout e WGSL do receptor CSM (SPEC-0690)', () => {
  it('bindings 10..15 de profundidade dentro de 8..15, e resources na mesma ordem', () => {
    const { device, host } = fakeHost();
    const block = new ShadowBlock(device, host, true, false, null);
    const entries = block.layoutEntries() as Array<{ binding: number; texture?: { sampleType: string } }>;
    const maps = entries.filter((e) => e.texture);
    expect(maps.map((e) => e.binding)).toEqual(Array.from({ length: CSM_MAX_CASCADES }, (_, i) => CSM_FIRST_MAP_BINDING + i));
    expect(maps.every((e) => e.texture!.sampleType === 'depth')).toBe(true);
    expect(Math.max(...entries.map((e) => e.binding))).toBe(SHADOW_LAST_BINDING);
    expect((block.resources() as Array<{ binding: number }>).map((r) => r.binding)).toEqual(entries.map((e) => e.binding));
  });

  it('UBO std140: cascatas alinhadas em 16 bytes, 24 floats cada', () => {
    expect(CSM_CASCADES_AT % STD140_ALIGN_FLOATS).toBe(0);
    expect(CSM_CASCADE_FLOATS % STD140_ALIGN_FLOATS).toBe(0);
    expect(SHADOW_UBO_FLOATS).toBe(CSM_CASCADES_AT + CSM_MAX_CASCADES * CSM_CASCADE_FLOATS);
  });

  it('o WGSL declara cada mapa uma vez, tem nativeShadowCsm, chaves equilibradas, e o lambert passa positionView', () => {
    const { device, host } = fakeHost();
    const wgsl = new ShadowBlock(device, host, true, false, null).wgsl;
    for (let i = 1; i < CSM_MAX_CASCADES; i++) {
      expect(wgsl.match(new RegExp(`var nativeShadowMap${i} : texture_depth_2d;`, 'g'))).toHaveLength(1);
      expect(wgsl).toContain(`@binding(${CSM_FIRST_MAP_BINDING + i}) var nativeShadowMap${i}`);
    }
    expect(wgsl).toContain(`cascades : array<NativeShadowCascade, ${CSM_MAX_CASCADES}>`);
    expect(wgsl).toMatch(/fn nativeShadowCsm\(positionWorld : vec3<f32>, normalWorld : vec3<f32>, positionView : vec3<f32>\) -> f32/);
    expect(wgsl).toContain('return nativeShadowCsm(positionWorld, normalWorld, positionView);');
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']] as const) {
      expect(wgsl.split(open).length).toBe(wgsl.split(close).length);
    }
    // Cada função chamada está declarada.
    for (const fn of ['nativeShadowTap', 'nativeShadowPcf', 'nativeShadowCascade', 'nativeShadowCsm']) {
      expect(wgsl).toContain(`fn ${fn}(`);
    }
    expect(lambertModel.wgsl(['receiveShadow'])).toContain('nativeShadow(in.positionWorld, normalize((vec4<f32>(normal, 0.0) * view.view).xyz), in.positionView)');
  });
});
