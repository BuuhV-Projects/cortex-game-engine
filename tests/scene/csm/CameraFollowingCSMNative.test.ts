/**
 * A CSM dirigida pelo lado nativo (SPEC-0690, ADR-0691): `updateNative` uma vez por quadro com guarda contra o
 * `updateBefore` do three, recusa por cascata, `cleared-empty`/`not-ready`/`skipped`, o escalonamento da cascata
 * distante com a matriz do último desenho e o `sunShadow.cascades` do perf-trace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectionalLight, Matrix4, PCFSoftShadowMap, PerspectiveCamera, Scene, WebGPUCoordinateSystem } from 'three';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';

const ponte = vi.hoisted(() => ({
  mirror: { installed: true, drainNewGeometries: () => [] as unknown[], drawShadowPass: vi.fn() },
  flags: { semNativo: false, congelar: false },
}));
vi.mock('../../../src/core/NativeSceneMirror.js', () => ({
  activeSceneMirror: () => (ponte.mirror.installed ? ponte.mirror : undefined),
}));
vi.mock('../../../src/scene/csm/measurementQueries.js', () => ({
  congelarPasseDeSombra: () => ponte.flags.congelar,
  passeDeSombraNativoDesligado: () => ponte.flags.semNativo,
}));

import { CameraFollowingCSM } from '../../../src/scene/CameraFollowingCSM.js';
import { drainTraceCounters, resetTraceCounters, setTraceCountersActive } from '../../../src/core/perfTrace/traceCounters.js';
import { ShadowBlock, SHADOW_ENABLED_AT } from '../../../src/render/native/frame/shadow.js';
import { CASCADE_MATRIX_AT, CSM_CASCADE_FLOATS, CSM_CASCADES_AT, CSM_COUNT_AT } from '../../../src/render/native/frame/shadowCsm.js';
import type { NativeRendererHost } from '../../../src/render/native/NativeRenderer.js';

const MAP_SIZE = 2048;
const MAX_FAR = 100;
const CAMERA_FAR = 300;
const CAMERA_NEAR = 0.5;
const SUN_BIAS = -0.0005;
/** Casters que o C++ "desenha" por cascata nos resultados falsos. */
const DRAWN = 3;

const ok = { drawn: DRAWN, refused: false, reason: 'aceito', totalCasters: DRAWN, skipped: 0, excluded: 1, status: 'ok' };
const clearedEmpty = { ...ok, drawn: 0, status: 'cleared-empty' };
const notReady = { ...ok, drawn: 0, refused: true, reason: 'nao-pronto', status: 'not-ready' };
const skipped = { ...ok, drawn: 0, refused: true, reason: 'descartado', status: 'skipped', skipped: 2 };
const gateRefusal = { ...ok, drawn: 0, refused: true, reason: 'instanced', status: 'refused', counts: 'instanced=4' };

type Interno = {
  camera: unknown;
  lights: { shadow: { autoUpdate: boolean; needsUpdate: boolean; matrix: Matrix4; map: { depthTexture: { name: string } } } }[];
  _nativePass: { assumed: boolean; receivers: { enabled: boolean; matrix: Float32Array; texture: unknown }[] };
};

function setup({ cascades = 2, interval = 2 } = {}) {
  const scene = new Scene();
  const sun = new DirectionalLight();
  sun.castShadow = true;
  sun.position.set(10, 20, 5);
  sun.shadow.mapSize.set(MAP_SIZE, MAP_SIZE);
  sun.shadow.bias = SUN_BIAS;
  scene.add(sun, sun.target);
  const csm = new CameraFollowingCSM(sun, { cascades, maxFar: MAX_FAR, mode: 'practical', lightMargin: 50 });
  (csm as unknown as { fade: boolean }).fade = true;
  csm.farCascadeInterval = interval;
  (sun.shadow as unknown as { shadowNode: unknown }).shadowNode = csm;
  const camera = new PerspectiveCamera(60, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(0, 2, 0);
  scene.updateMatrixWorld();
  const data = new WeakMap<object, Record<string, unknown>>();
  let gpu = 0;
  const backend = {
    get: (o: object) => {
      let d = data.get(o);
      if (!d) data.set(o, (d = {}));
      return d;
    },
  };
  const renderer = {
    coordinateSystem: WebGPUCoordinateSystem,
    backend,
    shadowMap: { enabled: true, type: PCFSoftShadowMap },
    initRenderTarget: vi.fn((rt: { depthTexture: object }) => {
      backend.get(rt.depthTexture)['texture'] = { gpu: gpu++ };
    }),
  };
  const interno = csm as unknown as Interno;
  /** A cascata de cada chamada ao C++, pelo alvo (uma textura por cascata). */
  const cascataDaChamada = (call: unknown[]) =>
    interno.lights.findIndex((l) => backend.get(l.shadow.map.depthTexture)['texture'] === call[4]);
  return { scene, sun, csm, interno, camera, renderer, backend, cascataDaChamada };
}

beforeEach(() => {
  ponte.mirror.installed = true;
  ponte.flags.semNativo = false;
  ponte.flags.congelar = false;
  ponte.mirror.drawShadowPass.mockReset();
  ponte.mirror.drawShadowPass.mockReturnValue(ok);
  resetTraceCounters();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetTraceCounters();
});

describe('CameraFollowingCSM.updateNative (SPEC-0690)', () => {
  it('sem receptor do three: inicia a CSM, cria o mapa de cada cascata e desenha todas no 1º quadro', () => {
    const { csm, interno, camera, scene, renderer, backend } = setup();
    expect(interno.camera).toBeNull();
    csm.updateNative(camera, scene, renderer, 1);
    expect(interno.camera).toBe(camera);
    expect(interno.lights).toHaveLength(2);
    expect(renderer.initRenderTarget).toHaveBeenCalledTimes(2);
    for (const luz of interno.lights) {
      expect(luz.shadow.map.depthTexture.name).toBe('ShadowDepthTexture');
      expect(backend.get(luz.shadow.map.depthTexture)['texture']).toBeDefined();
      // A ortho da cascata no z [0, 1] do WebGPU (o setup do ShadowNode faria isso).
      expect((luz.shadow as unknown as { camera: { coordinateSystem: number } }).camera.coordinateSystem).toBe(WebGPUCoordinateSystem);
      expect(luz.shadow.autoUpdate).toBe(false);
    }
    expect(ponte.mirror.drawShadowPass).toHaveBeenCalledTimes(2);
    expect(interno._nativePass.assumed).toBe(true);
    expect(ponte.mirror.drawShadowPass.mock.calls[0]![3]).toBeInstanceOf(Float64Array);
  });

  it('guarda por quadro: updateBefore no mesmo quadro não reposiciona nem redesenha, e vice-versa', () => {
    const { csm, camera, scene, renderer } = setup();
    const superUpdate = vi.spyOn(CSMShadowNode.prototype, 'updateBefore');
    csm.updateNative(camera, scene, renderer, 5);
    csm.updateBefore({ frameId: 5, camera, scene, renderer } as never);
    expect(superUpdate).toHaveBeenCalledTimes(1);
    expect(ponte.mirror.drawShadowPass).toHaveBeenCalledTimes(2);
    // Quadro 6: o three chega primeiro; o nativo do mesmo quadro só retorna.
    csm.updateBefore({ frameId: 6, camera, scene, renderer } as never);
    const depoisDoThree = ponte.mirror.drawShadowPass.mock.calls.length;
    csm.updateNative(camera, scene, renderer, 6);
    expect(superUpdate).toHaveBeenCalledTimes(2);
    expect(ponte.mirror.drawShadowPass).toHaveBeenCalledTimes(depoisDoThree);
    // Quadro novo: volta a trabalhar.
    csm.updateNative(camera, scene, renderer, 7);
    expect(superUpdate).toHaveBeenCalledTimes(3);
  });

  it('recusa por cascata: a 1 recusa, a 0 continua assumida e amostrada', () => {
    const { csm, interno, camera, scene, renderer, cascataDaChamada } = setup();
    ponte.mirror.drawShadowPass.mockImplementation((...call: unknown[]) => (cascataDaChamada(call) === 1 ? gateRefusal : ok));
    csm.updateNative(camera, scene, renderer, 1);
    const estado = csm.nativeReceiverState();
    expect(estado.cascades[0]!.enabled).toBe(true);
    expect(estado.cascades[1]!.enabled).toBe(false);
    expect(interno.lights[0]!.shadow.autoUpdate).toBe(false);
    expect(interno.lights[1]!.shadow.autoUpdate).toBe(true);
    // O culling em JS volta a rodar: nem todas assumiram.
    expect(interno._nativePass.assumed).toBe(false);
  });

  it('cleared-empty é aceito (alvo limpo) e not-ready é recusa', () => {
    const { csm, camera, scene, renderer, cascataDaChamada } = setup();
    ponte.mirror.drawShadowPass.mockImplementation((...call: unknown[]) => (cascataDaChamada(call) === 0 ? clearedEmpty : notReady));
    csm.updateNative(camera, scene, renderer, 1);
    const estado = csm.nativeReceiverState();
    expect(estado.cascades[0]!.enabled).toBe(true);
    expect(estado.cascades[1]!.enabled).toBe(false);
  });

  it('com skipped > 0 a cascata é recusada, e o trace diz por quê', () => {
    const { csm, camera, scene, renderer, cascataDaChamada } = setup();
    setTraceCountersActive(true);
    vi.spyOn(performance, 'now').mockReturnValue(0); // relógio parado: o ms da cascata é determinístico
    ponte.mirror.drawShadowPass.mockImplementation((...call: unknown[]) => (cascataDaChamada(call) === 1 ? skipped : ok));
    csm.updateNative(camera, scene, renderer, 1);
    expect(csm.nativeReceiverState().cascades[1]!.enabled).toBe(false);
    expect(drainTraceCounters().sunShadow?.cascades?.[1]).toEqual({ status: 'skipped', drawn: 0, skipped: 2, excluded: 1, ms: 0 });
  });

  it('escalonamento: a cascata distante redesenha a cada farCascadeInterval quadros, com a matriz do último desenho', () => {
    const { csm, interno, camera, scene, renderer, cascataDaChamada } = setup({ interval: 3 });
    const desenhosDa1: number[] = [];
    for (let quadro = 1; quadro <= 8; quadro++) {
      const antes = ponte.mirror.drawShadowPass.mock.calls.length;
      csm.updateNative(camera, scene, renderer, quadro);
      const chamadas = ponte.mirror.drawShadowPass.mock.calls.slice(antes);
      if (chamadas.some((c) => cascataDaChamada(c) === 1)) desenhosDa1.push(quadro);
      // A cascata 0 redesenha todo quadro.
      expect(chamadas.some((c) => cascataDaChamada(c) === 0)).toBe(true);
      if (quadro === 2) {
        // Alguém recalcula a matriz da cascata 1 sem redesenhar: o receptor não pode segui-la.
        const doDesenho = Array.from(interno._nativePass.receivers[1]!.matrix);
        interno.lights[1]!.shadow.matrix.makeTranslation(1, 2, 3);
        csm.updateNative(camera, scene, renderer, quadro + 0.5);
        expect(Array.from(interno._nativePass.receivers[1]!.matrix)).toEqual(doDesenho);
        expect(interno._nativePass.receivers[1]!.enabled).toBe(true);
        expect(interno.lights[1]!.shadow.autoUpdate).toBe(false);
      }
    }
    // q = quadro do escalonamento (o 2.5 extra também conta): a 1 desenha no q 1 (nunca desenhada) e quando
    // (q + 1) % 3 === 0, nos q 2, 5 e 8 — os quadros 2, 4 e 7.
    expect(desenhosDa1).toEqual([1, 2, 4, 7]);
  });

  it('troca de câmera redesenha todas as cascatas no mesmo quadro', () => {
    const { csm, camera, scene, renderer, cascataDaChamada } = setup({ interval: 4 });
    csm.updateNative(camera, scene, renderer, 1);
    csm.updateNative(camera, scene, renderer, 2);
    const antes = ponte.mirror.drawShadowPass.mock.calls.length;
    const outra = new PerspectiveCamera(60, 1, CAMERA_NEAR, CAMERA_FAR);
    csm.updateNative(outra, scene, renderer, 3);
    const chamadas = ponte.mirror.drawShadowPass.mock.calls.slice(antes).map(cascataDaChamada);
    expect(chamadas.sort()).toEqual([0, 1]);
  });

  it('?semPasseDeSombraNativo=1: nada é desenhado, as cascatas assumidas voltam ao three e o quadro fica com ele', () => {
    const { csm, interno, camera, scene, renderer } = setup();
    csm.updateNative(camera, scene, renderer, 1);
    ponte.flags.semNativo = true;
    ponte.mirror.drawShadowPass.mockClear();
    const superUpdate = vi.spyOn(CSMShadowNode.prototype, 'updateBefore');
    csm.updateNative(camera, scene, renderer, 2);
    expect(ponte.mirror.drawShadowPass).not.toHaveBeenCalled();
    expect(superUpdate).not.toHaveBeenCalled();
    expect(csm.nativeReceiverState().cascades.every((c) => !c.enabled)).toBe(true);
    expect(interno.lights.every((l) => l.shadow.autoUpdate)).toBe(true);
    // O updateBefore do mesmo quadro não foi barrado pela guarda.
    csm.updateBefore({ frameId: 2, camera, scene, renderer } as never);
    expect(superUpdate).toHaveBeenCalledTimes(1);
  });

  it('nativeReceiverState: faixas das _cascades, near da câmera, shadowFar = min(maxFar, far), fade e bias por cascata', () => {
    const { csm, interno, camera, scene, renderer } = setup();
    csm.updateNative(camera, scene, renderer, 1);
    const estado = csm.nativeReceiverState();
    const faixas = (csm as unknown as { _cascades: { x: number; y: number }[] })._cascades;
    expect(estado.count).toBe(2);
    expect(estado.cameraNear).toBe(CAMERA_NEAR);
    expect(estado.shadowFar).toBe(MAX_FAR);
    expect(estado.fade).toBe(true);
    expect(estado.mapWidth).toBe(MAP_SIZE);
    expect(estado.cascades[0]).toMatchObject({ near: faixas[0]!.x, far: faixas[0]!.y, bias: SUN_BIAS });
    expect(estado.cascades[1]).toMatchObject({ near: faixas[1]!.x, far: 1, bias: SUN_BIAS * 2 });
    expect(Array.from(estado.cascades[0]!.matrix)).toEqual(Array.from(new Float32Array(interno.lights[0]!.shadow.matrix.elements)));
  });

  it('perf-trace: sunShadow.cascades vai na amostra em que mudou, com refused:<motivo>', () => {
    const { csm, camera, scene, renderer, cascataDaChamada } = setup();
    setTraceCountersActive(true);
    vi.spyOn(performance, 'now').mockReturnValue(0); // relógio parado: o ms não muda a lista entre quadros
    ponte.mirror.drawShadowPass.mockImplementation((...call: unknown[]) => (cascataDaChamada(call) === 1 ? gateRefusal : ok));
    csm.updateNative(camera, scene, renderer, 1);
    const sun = drainTraceCounters().sunShadow;
    expect(sun).toMatchObject({ handedBack: 1, reason: 'instanced', counts: 'instanced=4' });
    expect(sun?.cascades).toEqual([
      { status: 'ok', drawn: DRAWN, skipped: 0, excluded: 1, ms: 0 },
      { status: 'refused:instanced', drawn: 0, skipped: 0, excluded: 1, ms: 0 },
    ]);
    // Nada mudou desde a amostra anterior: a lista não se repete.
    expect(drainTraceCounters().sunShadow).toBeUndefined();
    csm.updateNative(camera, scene, renderer, 2);
    expect(drainTraceCounters().sunShadow?.cascades).toBeUndefined();
  });

  it('dentro do ShadowBlock: o bloco dirige a CSM real e liga o mapa e a matriz de cada cascata', () => {
    const { interno, camera, scene, renderer, backend } = setup();
    const writes: Float32Array[] = [];
    const device = {
      createBuffer: () => ({}),
      createSampler: () => ({}),
      createTexture: () => ({ createView: () => ({ of: 'empty' }) }),
      queue: { writeBuffer: (_b: unknown, _o: number, a: Float32Array) => writes.push(a.slice()) },
    };
    const block = new ShadowBlock(device, renderer as unknown as NativeRendererHost, true, false, null);
    block.update(scene, camera);
    expect(ponte.mirror.drawShadowPass).toHaveBeenCalledTimes(2);
    const d = writes.at(-1)!;
    expect(d[SHADOW_ENABLED_AT]).toBe(1);
    expect(d[CSM_COUNT_AT]).toBe(2);
    interno.lights.forEach((luz, i) => {
      const at = CSM_CASCADES_AT + i * CSM_CASCADE_FLOATS + CASCADE_MATRIX_AT;
      expect(Array.from(d.slice(at, at + 16))).toEqual(Array.from(new Float32Array(luz.shadow.matrix.elements)));
      expect(interno._nativePass.receivers[i]!.texture).toBe(backend.get(luz.shadow.map.depthTexture)['texture']);
    });
  });

  it('o mapa criado aqui sai (dispose) quando o ShadowNode do three põe o dele, e o passe segue o novo alvo', () => {
    const { csm, interno, camera, scene, renderer, backend } = setup();
    csm.updateNative(camera, scene, renderer, 1);
    const nosso = interno.lights[0]!.shadow.map as unknown as { dispose(): void };
    const dispose = vi.spyOn(nosso, 'dispose');
    const doThree = { depthTexture: { name: 'ShadowDepthTexture' } };
    backend.get(doThree.depthTexture)['texture'] = { gpu: 'three' };
    (interno.lights[0]!.shadow as unknown as { map: unknown }).map = doThree;
    csm.updateNative(camera, scene, renderer, 2);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(interno._nativePass.receivers[0]!.texture).toEqual({ gpu: 'three' });
  });
});

