/**
 * O CsmNativePass com o NativeRenderer anexado (ADR-0692): os casters "tomados" pelo nativo (o three nunca subiu os
 * buffers deles) entram no registro de geometria pelo store nativo, e a cascata deixa de ser recusada por
 * `geometria-ausente`. Antes, o registro só lia o backend do three e a geometria ficava pendente para sempre.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, DirectionalLight, Mesh, MeshBasicMaterial, Object3D, Vector3, WebGPUCoordinateSystem } from 'three';
import { CsmNativePass, type CascataDoCsm, type CsmNativeFrame } from '../../../src/scene/csm/CsmNativePass.js';
import { SHADOW_DEPTH_TEXTURE_LABEL } from '../../../src/scene/csm/cascadeMaps.js';
import { geometryId, resetGeometryIds } from '../../../src/render/GeometryDesc.js';
import { NativeGeometryStore } from '../../../src/render/native/NativeGeometryStore.js';
import { NativeShadowSource } from '../../../src/render/native/NativeShadowSource.js';
import { setActiveShadowSource } from '../../../src/render/ShadowGeometrySource.js';
import type { GeometryLike, NativeRendererHost } from '../../../src/render/native/nativeRendererShared.js';
import type { NativeSceneMirror } from '../../../src/core/NativeSceneMirror.js';
import { drainTraceCounters, resetTraceCounters, setTraceCountersActive } from '../../../src/core/perfTrace/traceCounters.js';

/** Casters da cena e cascatas do teste. */
const CASTERS = 3;
const CASCADES = 2;

const ok = { drawn: CASTERS, refused: false, reason: 'aceito', totalCasters: CASTERS, skipped: 0, excluded: 0, status: 'ok' };
const ausente = { ...ok, drawn: 0, refused: true, reason: 'geometria-ausente', status: 'refused', counts: 'geometria-ausente=1' };

function instalarRegistro(): Map<number, unknown> {
  const registradas = new Map<number, unknown>();
  (globalThis as Record<string, unknown>)['__cortexGeometryRegistry'] = {
    register: (id: number, vb: unknown) => (vb ? (registradas.set(id, vb), true) : false),
    unregister: (id: number) => registradas.delete(id),
    size: () => registradas.size,
  };
  return registradas;
}

function montar() {
  const registradas = instalarRegistro();
  const cena = new Object3D();
  const malhas = Array.from({ length: CASTERS }, () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
  cena.add(...malhas);
  // O backend do three só tem as texturas de profundidade das cascatas: nenhum buffer de geometria.
  const dados = new WeakMap<object, Record<string, unknown>>();
  const backend = {
    get: (o: object) => {
      let d = dados.get(o);
      if (!d) dados.set(o, (d = {}));
      return d;
    },
  };
  const cascatas = Array.from({ length: CASCADES }, () => {
    const luz = new DirectionalLight();
    const depthTexture = { name: SHADOW_DEPTH_TEXTURE_LABEL };
    backend.get(depthTexture)['texture'] = { alvo: true };
    (luz.shadow as unknown as { map: unknown }).map = { depthTexture };
    return luz as unknown as CascataDoCsm;
  });
  // O gate falso: recusa por `geometria-ausente` enquanto algum caster não está registrado.
  const drawShadowPass = vi.fn(() => (malhas.every((m) => registradas.has(geometryId(m.geometry))) ? ok : ausente));
  const mirror = { drainNewGeometries: () => [], drawShadowPass } as unknown as NativeSceneMirror;
  const frame: CsmNativeFrame = {
    scene: cena,
    renderer: { coordinateSystem: WebGPUCoordinateSystem, backend } as unknown as CsmNativeFrame['renderer'],
    mirror,
    filterCamera: new Vector3(),
    minRatio: 0,
    farCascadeInterval: 1,
    redrawAll: false,
  };
  const device = { createBuffer: vi.fn((d: { size: number }) => ({ size: d.size })), queue: { writeBuffer: vi.fn() } };
  const host = { backend, _textures: { updateTexture: vi.fn(), updateSampler: vi.fn() } } as unknown as NativeRendererHost;
  const store = new NativeGeometryStore(device, host);
  return { registradas, malhas, cascatas, frame, device, store, host, drawShadowPass };
}

describe('CsmNativePass com casters tomados pelo nativo (ADR-0692)', () => {
  afterEach(() => {
    setActiveShadowSource(null);
    resetTraceCounters();
    delete (globalThis as Record<string, unknown>)['__cortexGeometryRegistry'];
    resetGeometryIds();
  });

  it('sem o provedor nativo, o caster que o three não subiu recusa a cascata (o defeito medido)', () => {
    const { cascatas, frame } = montar();
    setTraceCountersActive(true);
    const passe = new CsmNativePass();
    passe.draw(frame, cascatas);
    expect(passe.assumed).toBe(false);
    expect(passe.receivers.every((r) => !r.enabled)).toBe(true);
    // O perf-trace mostra quantas geometrias seguem pendentes no registro.
    expect(drainTraceCounters().sunShadow?.pendingGeometry).toBe(CASTERS);
  });

  it('com o provedor nativo, os casters entram pelo store e as cascatas são aceitas', () => {
    const { registradas, malhas, cascatas, frame, device, store, host } = montar();
    // O NativeRenderer já desenhou dois casters no passe principal (buffers do store); o terceiro nunca foi visto.
    store.geometry(malhas[0]!.geometry as unknown as GeometryLike, ['position', 'normal', 'uv']);
    store.geometry(malhas[1]!.geometry as unknown as GeometryLike, ['position']);
    const subidosAntes = device.createBuffer.mock.calls.length;
    setActiveShadowSource(new NativeShadowSource(store, host));
    const passe = new CsmNativePass();
    passe.draw(frame, cascatas);
    expect(registradas.size).toBe(CASTERS);
    expect(passe.assumed).toBe(true);
    expect(passe.receivers.every((r) => r.enabled)).toBe(true);
    // Só o caster nunca visto subiu (position + índice); os outros reaproveitaram o buffer do desenho principal.
    expect(device.createBuffer.mock.calls.length - subidosAntes).toBe(2);
  });
});
