/**
 * `UnderwaterPass` real (SPEC-0726): uniforms que o grafo do `PostFX` lê, o
 * desligar (amount 0 nos uniforms), o caminho próprio do navegador, a ponte com o
 * host (primeira chamada e `dispose`) e a opção `underwater` do `PostFX`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

vi.mock('three/webgpu', async () => {
  const m = await import('./underwaterTslMock.mjs');
  return { RenderPipeline: m.FakeRenderPipeline, TSL: m.fakeTSL() };
});
vi.mock('three/tsl', async () => {
  const { chainNode } = await import('./underwaterTslMock.mjs');
  const node = chainNode();
  const fn = () => node;
  return {
    pass: () => ({ getTextureNode: () => node, dispose: vi.fn() }),
    renderOutput: fn,
    screenUV: node,
    vec2: fn,
    length: fn,
    smoothstep: fn,
    oneMinus: fn,
    mix: fn,
    float: fn,
  };
});
vi.mock('three/examples/jsm/tsl/display/BloomNode.js', () => ({ bloom: vi.fn() }));
vi.mock('three/examples/jsm/tsl/display/FXAANode.js', () => ({ fxaa: vi.fn() }));

import { TSL } from 'three/webgpu';
import { UnderwaterPass } from '../../src/core/UnderwaterPass.js';
import { PostFX } from '../../src/core/PostFX.js';
import { FakeRenderPipeline, type FakeScenePass } from './underwaterTslMock.mjs';

const renderer = {} as import('three/webgpu').WebGPURenderer;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const tslPass = TSL.pass as unknown as ReturnType<typeof vi.fn>;
const tslSin = TSL.sin as unknown as ReturnType<typeof vi.fn>;

describe('UnderwaterPass', () => {
  beforeEach(() => {
    FakeRenderPipeline.instances = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uniforms seguem o estado e vão a amount 0 ao desligar (o PostFX lê direto)', () => {
    const p = new UnderwaterPass();
    p.set({ amount: 0.5, color: 0xff0000, tint: 0.3 });
    const u = p.uniforms();
    expect(u.amount.value).toBeCloseTo(0.5);
    expect(u.tint.value).toBeCloseTo(0.3);
    expect(u.color.value.toArray()).toEqual([1, 0, 0]);
    p.set(null);
    expect(u.amount.value).toBe(0);
    p.set({ amount: 0.8 });
    expect(u.amount.value).toBeCloseTo(0.8);
    p.set({ amount: 0 });
    expect(u.amount.value).toBe(0);
  });

  it('uniforms criados depois de desligar começam em amount 0', () => {
    const p = new UnderwaterPass();
    p.set({ amount: 1 });
    p.set(null);
    expect(p.uniforms().amount.value).toBe(0);
  });

  it('navegador: desligado não desenha; ligado cria o pipeline uma vez e troca cena/câmera', () => {
    const p = new UnderwaterPass();
    expect(p.render(renderer, scene, camera)).toBe(false);
    expect(FakeRenderPipeline.instances).toHaveLength(0);
    p.set({ amount: 1 });
    expect(p.render(renderer, scene, camera)).toBe(true);
    const other = new THREE.Scene();
    expect(p.render(renderer, other, camera)).toBe(true);
    expect(FakeRenderPipeline.instances).toHaveLength(1);
    const pipeline = FakeRenderPipeline.instances[0];
    expect(pipeline.render).toHaveBeenCalledTimes(2);
    expect(pipeline.outputColorTransform).toBe(false);
    const scenePass = tslPass.mock.results.at(-1)!.value as FakeScenePass;
    expect(scenePass.scene).toBe(other);
    p.dispose();
    expect(pipeline.dispose).toHaveBeenCalledTimes(1);
    expect(scenePass.dispose).toHaveBeenCalledTimes(1);
    expect(p.state?.amount).toBe(1); // o estado continua depois do dispose
  });

  it('host: a primeira chamada sempre atravessa (o estado global do C++ pode ter sobrado)', () => {
    const host = vi.fn();
    vi.stubGlobal('__cortexUnderwater', host);
    const p = new UnderwaterPass();
    p.set(null);
    expect(host).toHaveBeenCalledWith(null);
    p.set(null);
    expect(host).toHaveBeenCalledTimes(1);
    expect(p.render(renderer, scene, camera)).toBe(false);
  });

  it('host: dispose desliga o efeito no C++ e não repete se já está desligado', () => {
    const host = vi.fn();
    vi.stubGlobal('__cortexUnderwater', host);
    const p = new UnderwaterPass();
    p.set({ amount: 1 });
    p.dispose();
    expect(host).toHaveBeenLastCalledWith(null);
    host.mockClear();
    p.set(null);
    p.dispose();
    expect(host).toHaveBeenCalledTimes(1); // só o set, primeira chamada depois do dispose
  });

  it('host: setUnderwater antes de um PostFX: os uniforms nascem zerados (o blit do host já aplica)', () => {
    vi.stubGlobal('__cortexUnderwater', vi.fn());
    const p = new UnderwaterPass();
    p.set({ amount: 1 });
    expect(p.uniforms().amount.value).toBe(0);
  });

  it('host: a profundidade contínua não atravessa a ponte em todo quadro', () => {
    const host = vi.fn();
    vi.stubGlobal('__cortexUnderwater', host);
    const p = new UnderwaterPass();
    const frames = 100;
    const metersPerFrame = 0.01;
    for (let i = 0; i < frames; i++) p.set({ amount: 1, depth: 10 + i * metersPerFrame });
    expect(host.mock.calls.length).toBeLessThan(frames / 10);
  });
});

describe("PostFX com o efeito embaixo d'água", () => {
  const engineScene = { getThreeScene: () => scene };

  function fakeRenderer() {
    return { threeRenderer: {}, underwaterPass: new UnderwaterPass(), isReady: true };
  }

  it('vem ligado por padrão: os nós do efeito entram no grafo com os uniforms do Renderer', () => {
    tslSin.mockClear();
    const r = fakeRenderer();
    const uniforms = vi.spyOn(r.underwaterPass, 'uniforms');
    new PostFX(r as never, engineScene as never, camera);
    expect(uniforms).toHaveBeenCalledTimes(1);
    expect(tslSin).toHaveBeenCalledTimes(1);
  });

  it('underwater: false tira os nós do grafo', () => {
    tslSin.mockClear();
    const r = fakeRenderer();
    const uniforms = vi.spyOn(r.underwaterPass, 'uniforms');
    new PostFX(r as never, engineScene as never, camera, { underwater: false });
    expect(uniforms).not.toHaveBeenCalled();
    expect(tslSin).not.toHaveBeenCalled();
  });
});
