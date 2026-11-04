// Versão do mundo no renderer nativo (SPEC-0682): mesma versão pula o laço da matriz.
import { describe, it, expect } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three';
import { NativeRenderer } from '../../../src/render/native/NativeRenderer.js';
import { NATIVE_MODELS } from '../../../src/render/native/models/index.js';
import type { DrawBatchBridge } from '../../../src/render/DrawBatch.js';

/** Device falso que só conta as escritas no bloco de objeto (`native.objects`). */
function montar() {
  const escritas = { objeto: 0 };
  const device = {
    createBuffer: (d: { label?: string }) => ({ ...d }),
    createSampler: (d: unknown) => ({ d }),
    createTexture: (d: unknown) => ({ d, createView: () => ({}) }),
    createBindGroupLayout: (d: unknown) => ({ d }),
    createBindGroup: (d: unknown) => ({ d }),
    createPipelineLayout: (d: unknown) => ({ d }),
    createShaderModule: () => ({}),
    createRenderPipeline: () => ({}),
    queue: {
      writeBuffer: (buffer: { label?: string }) => {
        if (buffer.label === 'native.objects') escritas.objeto++;
      },
    },
  };
  const dados = new WeakMap<object, Record<string, unknown>>();
  const host = {
    backend: {
      device,
      get: (o: object) => {
        let d = dados.get(o);
        if (!d) dados.set(o, (d = {}));
        return d;
      },
      utils: { getCurrentColorFormat: () => 'rgba16float', getCurrentDepthStencilFormat: () => 'depth24plus', getSampleCountRenderContext: () => 1 },
    },
    _textures: { updateTexture: () => undefined, updateSampler: () => undefined },
    toneMapping: 0,
  };
  const bridge: DrawBatchBridge = { record: () => 0, release: () => undefined, flush: () => 0 };
  const nr = new NativeRenderer(host as never, bridge, NATIVE_MODELS, null);
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  mesh.updateMatrixWorld();
  const quadro = (): void => {
    const camera = new PerspectiveCamera();
    camera.updateMatrixWorld();
    nr.beginFrame(camera, new Scene());
  };
  quadro();
  expect(nr.take(mesh, mesh.material, mesh.geometry)).not.toBeNull();
  const nascimento = escritas.objeto;
  return { nr, mesh, escritas, quadro, nascimento };
}

function mover(mesh: Mesh, x: number): void {
  mesh.position.x = x;
  mesh.updateMatrixWorld();
}

describe('NativeRenderer com versão do mundo (SPEC-0682)', () => {
  it('versão nova com a matriz igual: compara, não escreve, e adota a versão', () => {
    const t = montar();
    t.quadro();
    t.nr.take(t.mesh, t.mesh.material, t.mesh.geometry, 5);
    expect(t.escritas.objeto).toBe(t.nascimento);
  });

  it('mesma versão adotada: o laço da matriz não roda (o host garante a mesma matriz)', () => {
    const t = montar();
    t.quadro();
    t.nr.take(t.mesh, t.mesh.material, t.mesh.geometry, 5);
    mover(t.mesh, 2);
    t.quadro();
    t.nr.take(t.mesh, t.mesh.material, t.mesh.geometry, 5);
    expect(t.escritas.objeto).toBe(t.nascimento);
    expect(t.nr.stats.moved).toBe(1);
  });

  it('versão nova com a matriz movida: escreve o bloco uma vez e adota', () => {
    const t = montar();
    t.quadro();
    t.nr.take(t.mesh, t.mesh.material, t.mesh.geometry, 5);
    mover(t.mesh, 2);
    t.quadro();
    t.nr.take(t.mesh, t.mesh.material, t.mesh.geometry, 6);
    expect(t.escritas.objeto).toBe(t.nascimento + 1);
    t.quadro();
    t.nr.take(t.mesh, t.mesh.material, t.mesh.geometry, 6);
    expect(t.escritas.objeto).toBe(t.nascimento + 1);
  });

  it('sem versão (aquecimento, host antigo): compara sempre e esquece a adotada', () => {
    const t = montar();
    t.quadro();
    t.nr.take(t.mesh, t.mesh.material, t.mesh.geometry, 5);
    mover(t.mesh, 3);
    t.quadro();
    t.nr.take(t.mesh, t.mesh.material, t.mesh.geometry);
    expect(t.escritas.objeto).toBe(t.nascimento + 1);
    // A versão 5 foi esquecida: voltar com ela compara de novo (e acha a matriz igual à escrita).
    t.quadro();
    t.nr.take(t.mesh, t.mesh.material, t.mesh.geometry, 5);
    expect(t.escritas.objeto).toBe(t.nascimento + 1);
    mover(t.mesh, 4);
    t.quadro();
    t.nr.take(t.mesh, t.mesh.material, t.mesh.geometry, 5);
    expect(t.escritas.objeto).toBe(t.nascimento + 1);
  });
});
