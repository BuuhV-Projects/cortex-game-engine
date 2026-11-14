/**
 * O WGSL da sombra só com as cascatas em uso (SPEC-0732): sem os mapas e as leituras das cascatas que a CSM não
 * desenha, sem `switch` por leitura, recompilado quando a CSM passa a usar mais cascatas, e a chave do código no
 * `NativePipelineStore`.
 */
import { describe, expect, it, vi } from 'vitest';
import { DirectionalLight, PCFSoftShadowMap, Scene } from 'three';

vi.mock('../../../src/core/NativeSceneMirror.js', () => ({ activeSceneMirror: () => undefined }));

import { ShadowBlock } from '../../../src/render/native/frame/shadow.js';
import { CSM_MAX_CASCADES, type CsmCascadeReceiver, type CsmReceiverState } from '../../../src/render/native/frame/shadowCsm.js';
import { csmWgsl, shadowWgsl } from '../../../src/render/native/frame/shadowWgsl.js';
import { NativePipelineStore } from '../../../src/render/native/NativePipelineStore.js';
import type { FrameBlock } from '../../../src/render/native/frame/FrameBlock.js';
import type { NativeRendererHost } from '../../../src/render/native/NativeRenderer.js';

/** Leituras do PCFSoft do three por mapa (`wgsl-0019`). */
const TAPS_PER_MAP = 16;
const GAME_CASCADES = 2;
const FRAME_ID = 7;

const compareSites = (wgsl: string) => wgsl.match(/textureSampleCompareLevel\(/g)?.length ?? 0;
const tapCalls = (wgsl: string, k: number) => wgsl.match(new RegExp(`nativeShadowTap${k}\\(uv`, 'g'))?.length ?? 0;

function fakeHost() {
  const device = {
    createBuffer: (d: unknown) => ({ kind: 'buffer', d }),
    createSampler: (d: unknown) => ({ kind: 'sampler', d }),
    createTexture: (d: unknown) => ({ kind: 'empty', d, createView: () => ({ of: 'empty' }) }),
    queue: { writeBuffer: () => undefined },
  };
  const host = { backend: { device, get: () => ({}) }, shadowMap: { enabled: true, type: PCFSoftShadowMap }, _nodes: { nodeFrame: { frameId: FRAME_ID } } };
  return { device, host: host as unknown as NativeRendererHost };
}

function cascade(i: number): CsmCascadeReceiver {
  return { enabled: true, matrix: new Float32Array(16), texture: { createView: () => ({ of: `c${i}` }) }, bias: 0, normalBias: 0, near: 0, far: 1 };
}

/** Uma cena com um sol e um nó CSM falso cujo `count` o teste troca. */
function csmScene(count: number) {
  const scene = new Scene();
  const sun = new DirectionalLight();
  sun.castShadow = true;
  scene.add(sun, sun.target);
  const state: CsmReceiverState = {
    count, cameraNear: 0.5, shadowFar: 100, fade: true, mapWidth: 1024, mapHeight: 1024, intensity: 1,
    cascades: Array.from({ length: CSM_MAX_CASCADES }, (_, i) => cascade(i)),
  };
  (sun.shadow as unknown as { shadowNode: unknown }).shadowNode = { isCSMShadowNode: true, updateNative: () => undefined, nativeReceiverState: () => state };
  return { scene, state };
}

describe('shadowWgsl (SPEC-0732)', () => {
  it('com 2 cascatas não declara nem lê os mapas 2..5', () => {
    const wgsl = shadowWgsl(GAME_CASCADES);
    expect(wgsl).toContain('var nativeShadowMap : texture_depth_2d;');
    expect(wgsl).toContain('var nativeShadowMap1 : texture_depth_2d;');
    for (let k = GAME_CASCADES; k < CSM_MAX_CASCADES; k++) {
      expect(wgsl).not.toContain(`nativeShadowMap${k}`);
      expect(wgsl).not.toContain(`nativeShadowTap${k}`);
      expect(wgsl).not.toContain(`nativeShadowCascade${k}`);
      expect(wgsl).not.toContain(`${k}u < count`);
    }
    expect(wgsl).toContain(`let count = min(u32(g.z), ${GAME_CASCADES}u);`);
  });

  it('uma leitura de comparação por mapa, 16 chamadas a ela, e nenhum switch', () => {
    for (const n of [0, 1, GAME_CASCADES, CSM_MAX_CASCADES]) {
      const wgsl = shadowWgsl(n);
      const maps = Math.max(n, 1);
      expect(compareSites(wgsl)).toBe(maps);
      for (let k = 0; k < maps; k++) expect(tapCalls(wgsl, k)).toBe(TAPS_PER_MAP + 1);
      expect(wgsl).not.toContain('switch');
    }
  });

  it('o código muda com o número; 0 é só o mapa único, sem o ramo da CSM', () => {
    const codes = [0, 1, GAME_CASCADES, CSM_MAX_CASCADES].map(shadowWgsl);
    expect(new Set(codes).size).toBe(codes.length);
    expect(csmWgsl(0)).toBe('');
    expect(codes[0]).not.toContain('nativeShadowCsm');
    expect(codes[0]).toContain('return nativeShadowPcf0(positionWorld, normalWorld, nativeShadowParams.matrix');
    expect(codes[2]).toContain('return nativeShadowCsm(positionWorld, normalWorld, positionView);');
    // Acima do máximo, fica no máximo.
    expect(shadowWgsl(CSM_MAX_CASCADES + 1)).toBe(codes[3]);
  });

  it('cada cascata chama o próprio fator uma vez, e a 1ª não esmaece na borda de perto', () => {
    const wgsl = csmWgsl(GAME_CASCADES);
    for (let k = 0; k < GAME_CASCADES; k++) {
      expect(wgsl.match(new RegExp(`= nativeShadowCascade${k}\\(`, 'g'))).toHaveLength(1);
    }
    expect(wgsl.match(/ratio = select\(1\.0, ratio, linearDepth > cascadeCenter\);/g)).toHaveLength(1);
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']] as const) {
      expect(wgsl.split(open).length).toBe(wgsl.split(close).length);
    }
  });
});

describe('ShadowBlock recompila pelas cascatas da CSM (SPEC-0732)', () => {
  it('começa no mapa único; o count da CSM sobe o código e o version, e cair não recompila', () => {
    const { device, host } = fakeHost();
    const block = new ShadowBlock(device, host, true, false, null);
    expect(block.codeKey).toBe('shadow:0');
    expect(block.wgsl).toBe(shadowWgsl(0));
    const { scene, state } = csmScene(GAME_CASCADES);
    block.update(scene, null);
    expect(block.codeKey).toBe(`shadow:${GAME_CASCADES}`);
    expect(block.wgsl).toBe(shadowWgsl(GAME_CASCADES));
    const version = block.version;
    block.update(scene, null);
    expect(block.version).toBe(version);
    state.count = 1;
    block.update(scene, null);
    expect(block.codeKey).toBe(`shadow:${GAME_CASCADES}`);
    state.count = GAME_CASCADES + 1;
    block.update(scene, null);
    expect(block.codeKey).toBe(`shadow:${GAME_CASCADES + 1}`);
    expect(block.version).toBeGreaterThan(version);
  });
});

describe('NativePipelineStore com a chave do código dos blocos (SPEC-0732)', () => {
  it('um módulo e um pipeline novos quando a codeKey muda, e o mesmo enquanto ela fica', () => {
    const modules: string[] = [];
    const device = {
      createShaderModule: (d: { code: string }) => (modules.push(d.code), { code: d.code }),
      createPipelineLayout: () => ({}),
      createRenderPipeline: (d: unknown) => ({ d }),
    };
    const block: { -readonly [K in keyof FrameBlock]: FrameBlock[K] } = {
      name: 'fake', version: 0, layoutEntries: () => [], resources: () => [], update: () => undefined, wgsl: '// frame A', codeKey: 'a',
    };
    const materials = { layout: () => ({}) };
    const stats = { taken: 0, refused: 0, moved: 0, paramWrites: 0, pipelines: 0, pipelineMs: 0, recipes: 0 };
    const store = new NativePipelineStore(device, { view: {}, frame: {}, object: {}, objectSkinned: {} }, [block], materials as never, stats);
    const model = { name: 'm', attributes: () => ['position'], wgsl: () => '// model' };
    const inst = {
      mat: { model, variant: ['fog'], kinds: '' }, geo: { key: 'g', layouts: [] }, extra: null, instanced: false, skin: null,
      state: { key: 's', depthWrite: true, bias: null, blend: 'none', colorWrite: true }, object: {}, material: {},
    };
    const draw = () => store.pipeline(inst as never, 'bgra8unorm', 'depth24plus', 1, 't', 'back', 1);
    const first = draw();
    expect(draw()).toBe(first);
    expect(modules).toHaveLength(1);
    expect(modules[0]).toContain('// frame A');
    block.wgsl = '// frame B';
    block.codeKey = 'b';
    expect(draw()).not.toBe(first);
    expect(modules).toHaveLength(2);
    expect(modules[1]).toContain('// frame B');
    expect(modules[1]).not.toContain('// frame A');
  });
});
