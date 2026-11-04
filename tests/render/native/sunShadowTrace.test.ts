/**
 * A recusa da sombra do sol nativa chega ao perf-trace com motivo, `counts` e ofensor (SPEC-0688), sem depender
 * do `debug('perf')`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectionalLight, Mesh, Object3D, Scene } from 'three';

const mirror = {
  installed: true,
  drainNewGeometries: () => [],
  drawShadowPass: vi.fn(),
};
vi.mock('../../../src/core/NativeSceneMirror.js', () => ({ activeSceneMirror: () => mirror }));

import { NativeSunShadowPass, type SunLight } from '../../../src/render/native/shadow/NativeSunShadowPass.js';
import { drainTraceCounters, resetTraceCounters, setTraceCountersActive } from '../../../src/core/perfTrace/traceCounters.js';

function setup() {
  const data = new WeakMap<object, Record<string, unknown>>();
  const host = {
    backend: {
      get: (o: object) => {
        let d = data.get(o);
        if (!d) data.set(o, (d = {}));
        return d;
      },
    },
  };
  const scene = new Scene();
  const sun = new DirectionalLight();
  sun.castShadow = true;
  sun.shadow.autoUpdate = false;
  scene.add(sun, sun.target);
  scene.updateMatrixWorld();
  const depthTexture = {};
  (sun.shadow as unknown as { map: unknown }).map = { depthTexture };
  host.backend.get(depthTexture)['texture'] = { createView: () => ({}) };
  return { pass: new NativeSunShadowPass(host, false, false), scene, sun, light: sun as unknown as SunLight };
}

beforeEach(() => {
  resetTraceCounters();
  setTraceCountersActive(true);
  mirror.drawShadowPass.mockReset();
});

afterEach(() => resetTraceCounters());

describe('NativeSunShadowPass no perf-trace (SPEC-0688)', () => {
  it('recusa do portão: motivo, counts e o ofensor com o nó de cena', () => {
    const { pass, scene, sun, light } = setup();
    const node = new Object3D();
    node.name = 'quadra-2';
    node.userData['cortexSceneNode'] = true;
    const arvore = new Mesh();
    arvore.name = 'arvore_9';
    node.add(arvore);
    scene.add(node);
    mirror.drawShadowPass.mockReturnValue({
      drawn: 0, refused: true, reason: 'instanced', totalCasters: 3, offender: arvore, counts: 'instanced=4',
    });
    sun.shadow.needsUpdate = true;
    pass.update(light, scene, null);
    expect(drainTraceCounters().sunShadow).toEqual({
      drawn: 0,
      handedBack: 1,
      reason: 'instanced',
      counts: 'instanced=4',
      offender: { name: 'arvore_9', id: arvore.id, node: 'quadra-2' },
    });
  });

  it('redesenho aceito conta em drawn, sem motivo', () => {
    const { pass, scene, sun, light } = setup();
    mirror.drawShadowPass.mockReturnValue({ drawn: 3, refused: false, reason: 'aceito', totalCasters: 3 });
    sun.shadow.needsUpdate = true;
    pass.update(light, scene, null);
    expect(drainTraceCounters().sunShadow).toEqual({ drawn: 1, handedBack: 0 });
  });

  it('recusa local (sem ponte) leva só o motivo', () => {
    const { pass, scene, sun, light } = setup();
    mirror.drawShadowPass.mockReturnValue(null);
    sun.shadow.needsUpdate = true;
    pass.update(light, scene, null);
    expect(drainTraceCounters().sunShadow).toEqual({ drawn: 0, handedBack: 1, reason: 'sem-ponte' });
    expect(sun.shadow.needsUpdate).toBe(true); // comportamento de sempre: o three redesenha
  });
});
