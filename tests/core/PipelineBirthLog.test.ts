/**
 * Quais pipelines nascem (SPEC-0261). O backend é falso: o que se testa é o
 * que o registro extrai do renderObject e quando. A última checagem é contra o
 * three INSTALADO — o método envolvido é interno, e um upgrade que o renomeie
 * desligaria a lista em silêncio.
 */
import { describe, it, expect } from 'vitest';
import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera } from 'three';
import { PipelineBirthLog } from '../../src/core/PipelineBirthLog.js';
import { buildSample } from '../../src/core/PerfTrace.js';

function fakeBackend() {
  const created: unknown[] = [];
  return {
    created,
    createRenderPipeline(renderObject: unknown, _promises?: unknown) {
      created.push(renderObject);
      return 'pipeline';
    },
    getRenderCacheKey(_renderObject: unknown): string {
      return 'estado';
    },
  };
}

describe('PipelineBirthLog', () => {
  it('registra objeto, material, passada e custo de cada nascimento', () => {
    const main = new PerspectiveCamera();
    const backend = fakeBackend();
    const log = new PipelineBirthLog();
    let clock = 0;
    const now = () => (clock += 12.345); // cada chamada "custa" 12,345 ms
    expect(log.install(backend, () => main, now)).toBe(true);

    const kart = new Group();
    kart.name = 'kart-rival-3';
    const flame = new Mesh(undefined, new MeshBasicMaterial({ transparent: true }));
    kart.add(flame);
    const renderObject = { object: flame, material: flame.material, camera: main, pipeline: { cacheKey: '12,34,estado' } };
    const result = backend.createRenderPipeline(renderObject, null);

    expect(result).toBe('pipeline'); // o original continua sendo chamado
    expect(backend.created).toHaveLength(1);
    expect(log.drain()).toEqual([
      { object: 'kart-rival-3', material: 'MeshBasicMaterial', transparent: true, camera: 'main', ms: 12.35, key: '12,34,estado' },
    ]);
  });

  it('separa a passada de sombra pela câmera', () => {
    const main = new PerspectiveCamera();
    const backend = fakeBackend();
    const log = new PipelineBirthLog();
    log.install(backend, () => main);
    const material = new MeshStandardMaterial();
    material.name = 'pista';
    const mesh = new Mesh(undefined, material);
    backend.createRenderPipeline({ object: mesh, material, camera: new OrthographicCamera() }, null);
    const [birth] = log.drain();
    expect(birth).toMatchObject({ object: 'Mesh', material: 'pista', transparent: false, camera: 'OrthographicCamera' });
  });

  it('drenar esvazia; instalar de novo não envolve duas vezes', () => {
    const backend = fakeBackend();
    const log = new PipelineBirthLog();
    log.install(backend, () => null);
    log.install(backend, () => null);
    backend.createRenderPipeline({ object: new Mesh() }, null);
    expect(log.drain()).toHaveLength(1);
    expect(log.drain()).toHaveLength(0);
  });

  it('conta consultas ao cache, acertos incluídos, e nascimentos acumulados', () => {
    const backend = fakeBackend();
    const log = new PipelineBirthLog();
    log.install(backend, () => null);
    // O three consulta a chave sempre; só cria quando ela não está no cache.
    for (let i = 0; i < 5; i++) backend.getRenderCacheKey({});
    backend.createRenderPipeline({ object: new Mesh() }, null);
    log.drain();
    expect(log.lookups).toBe(5);
    expect(log.births).toBe(1); // drenar não zera o acumulado
  });

  it('backend sem o método: não instala e não quebra', () => {
    const log = new PipelineBirthLog();
    expect(log.install({}, () => null)).toBe(false);
    expect(log.install(undefined, () => null)).toBe(false);
  });

  it('o three instalado ainda tem backend.createRenderPipeline', async () => {
    const { default: WebGPUBackend } = await import('three/src/renderers/webgpu/WebGPUBackend.js');
    // A tipagem do three não lista o método (é interno) — daí o cast, e daí o teste.
    const prototype = WebGPUBackend.prototype as unknown as { createRenderPipeline?: unknown; getRenderCacheKey?: unknown };
    expect(typeof prototype.createRenderPipeline).toBe('function');
    expect(typeof prototype.getRenderCacheKey).toBe('function');
  });
});

describe('amostra do trace', () => {
  const base = { timeMs: 1000, frameMs: 16, cpu: {}, draws: 0, tris: 0, camera: new PerspectiveCamera(), visible: [] };

  it('leva a lista quando algo nasceu', () => {
    const born = [{ object: 'a', material: 'b', transparent: false, camera: 'main', ms: 3, key: 'k' }];
    expect(buildSample({ ...base, pipelinesBorn: born }).pipelinesBorn).toEqual(born);
  });

  it('leva as consultas acumuladas quando a lista está ligada', () => {
    expect(buildSample({ ...base, pipelineLookups: 42 }).pipelineLookups).toBe(42);
    expect('pipelineLookups' in buildSample(base)).toBe(false);
  });

  it('omite o campo quando nada nasceu', () => {
    expect('pipelinesBorn' in buildSample({ ...base, pipelinesBorn: [] })).toBe(false);
  });
});

