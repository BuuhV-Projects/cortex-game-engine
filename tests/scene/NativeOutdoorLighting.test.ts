/**
 * `outdoorLighting` no host nativo com o renderer próprio (SPEC-0645): ACES no
 * composite do host, ambient somado ao hemisfério. Sem host, o preset de sempre.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmbientLight, Color, HemisphereLight, Scene as ThreeScene, ACESFilmicToneMapping, NoToneMapping } from 'three';
import { setupOutdoorLighting } from '../../src/scene/OutdoorLighting.js';
import { foldIntoHemisphere, uniformEnvironmentFill } from '../../src/scene/NativeOutdoorLighting.js';
import { configureNativePostFX, renderNativeToneMapped, resetNativePostFX } from '../../src/core/nativePostFX.js';
import { setNativeRendererDefault } from '../../src/render/native/NativeRenderer.js';
import type { Scene } from '../../src/core/Scene.js';
import type { Renderer } from '../../src/core/Renderer.js';

type HostGlobals = { __cortexBloom?: unknown; __cortexSceneHdr?: unknown };
const g = globalThis as HostGlobals;

function harness(): { three: ThreeScene; scene: Scene; renderer: Renderer } {
  const three = new ThreeScene();
  const scene = { add: (o: unknown) => three.add(o as never), getThreeScene: () => three } as unknown as Scene;
  const renderer = {
    threeRenderer: { toneMapping: NoToneMapping, toneMappingExposure: 1, shadowMap: { enabled: false, type: 0 } },
  } as unknown as Renderer;
  return { three, scene, renderer };
}

function fakeHost(): { bloom: ReturnType<typeof vi.fn>; sink: ReturnType<typeof vi.fn> } {
  const bloom = vi.fn();
  const sink = vi.fn();
  g.__cortexBloom = bloom;
  g.__cortexSceneHdr = sink;
  setNativeRendererDefault(true);
  return { bloom, sink };
}

const ambients = (three: ThreeScene): AmbientLight[] => three.children.filter((o): o is AmbientLight => o instanceof AmbientLight);

afterEach(() => {
  resetNativePostFX();
  delete g.__cortexBloom;
  delete g.__cortexSceneHdr;
  setNativeRendererDefault(false);
});

describe('setupOutdoorLighting no host nativo (SPEC-0645)', () => {
  it('sem host: ACES no three e AmbientLight na cena (como sempre)', () => {
    const { three, scene, renderer } = harness();
    setupOutdoorLighting(renderer, scene, { shadows: false });
    expect(renderer.threeRenderer.toneMapping).toBe(ACESFilmicToneMapping);
    expect(ambients(three)).toHaveLength(1);
  });

  it('host sem nativeRenderer: preset de sempre', () => {
    const { three, scene, renderer } = harness();
    fakeHost();
    setNativeRendererDefault(false);
    setupOutdoorLighting(renderer, scene, { shadows: false });
    expect(renderer.threeRenderer.toneMapping).toBe(ACESFilmicToneMapping);
    expect(ambients(three)).toHaveLength(1);
  });

  it('host + nativeRenderer: ACES no composite, ambient dentro do hemisfério', () => {
    const { three, scene, renderer } = harness();
    const { bloom } = fakeHost();
    const exposure = 1.3;
    const sky = 0x336699;
    const ground = 0x224411;
    const hemisphereIntensity = 0.5;
    const ambientIntensity = 0.2;
    const { hemisphere } = setupOutdoorLighting(renderer, scene, { shadows: false, exposure, sky, ground, hemisphereIntensity, ambientIntensity });

    expect(renderer.threeRenderer.toneMapping).toBe(NoToneMapping);
    expect(renderer.threeRenderer.toneMappingExposure).toBe(exposure);
    expect(bloom).toHaveBeenCalledWith(expect.objectContaining({ strength: 0, vignette: false, exposure }));
    expect(ambients(three)).toHaveLength(0);
    const fill = new Color(0xffffff).multiplyScalar(ambientIntensity);
    expect(hemisphere.intensity).toBe(1);
    expect(hemisphere.color.equals(new Color(sky).multiplyScalar(hemisphereIntensity).add(fill))).toBe(true);
    expect(hemisphere.groundColor.equals(new Color(ground).multiplyScalar(hemisphereIntensity).add(fill))).toBe(true);
  });

  it('PostFX já dono do composite: o preset não sobrescreve o bloom dele', () => {
    const { scene, renderer } = harness();
    const { bloom } = fakeHost();
    configureNativePostFX({ strength: 0.8, threshold: 0, radius: 0, exposure: 1, vignette: false, vignetteIntensity: 1, vignetteInner: 0, vignetteOuter: 1 });
    bloom.mockClear();
    setupOutdoorLighting(renderer, scene, { shadows: false });
    expect(bloom).not.toHaveBeenCalled();
    expect(renderer.threeRenderer.toneMapping).toBe(NoToneMapping);
  });
});

describe('renderNativeToneMapped', () => {
  const texture = { gpu: true };
  const r = { renderSceneHDR: vi.fn(() => texture) };

  it('com o tone mapping do preset ativo, entrega a RT HDR ao host', () => {
    const { scene, renderer } = harness();
    const { sink } = fakeHost();
    setupOutdoorLighting(renderer, scene, { shadows: false });
    expect(renderNativeToneMapped(r, 'cena', 'camera')).toBe(true);
    expect(sink).toHaveBeenCalledWith(texture);
  });

  it('PostFX assume ou reset desliga: volta ao render normal', () => {
    const { scene, renderer } = harness();
    fakeHost();
    setupOutdoorLighting(renderer, scene, { shadows: false });
    resetNativePostFX();
    expect(renderNativeToneMapped(r, 'cena', 'camera')).toBe(false);
  });
});

describe('foldIntoHemisphere / uniformEnvironmentFill', () => {
  it('constante somada às duas pontas = mesmo difuso em todo w', () => {
    const h = new HemisphereLight(new Color(1, 0, 0), new Color(0, 0, 1), 2);
    foldIntoHemisphere(h, new Color(0.1, 0.1, 0.1));
    expect(h.intensity).toBe(1);
    expect(h.color.toArray()).toEqual([2.1, 0.1, 0.1]);
    expect(h.groundColor.toArray()).toEqual([0.1, 0.1, 2.1]);
  });

  it('acumula o fill em userData.cortexAmbientFill para o jogo reaplicar', () => {
    const h = new HemisphereLight(new Color(1, 1, 1), new Color(0, 0, 0), 1);
    const fill = new Color(0.1, 0.2, 0.3);
    foldIntoHemisphere(h, fill);
    foldIntoHemisphere(h, new Color(0.1, 0.1, 0.1));
    const total = h.userData['cortexAmbientFill'] as Color;
    expect(total.r).toBeCloseTo(0.2);
    expect(total.b).toBeCloseTo(0.4);
    expect(fill.toArray()).toEqual([0.1, 0.2, 0.3]); // não muta o argumento
  });

  it('environment uniforme vale céu · k · π (convenção do three)', () => {
    const k = 0.5;
    const fill = uniformEnvironmentFill(new Color(0.2, 0.4, 0.6), k);
    expect(fill.r).toBeCloseTo(0.2 * k * Math.PI);
    expect(fill.b).toBeCloseTo(0.6 * k * Math.PI);
  });
});
