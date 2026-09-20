import { describe, it, expect, afterEach } from 'vitest';
import { Object3D } from 'three';
import {
  RenderPhaseProbe,
  calibrateClock,
  renderPhasesRequested,
  PROBE_OFF,
  PROBE_PHASES,
  PROBE_PER_OBJECT,
} from '../../src/core/RenderPhaseProbe.js';

/**
 * Renderer de mentira com a mesma FORMA do `Renderer` do three: os métodos
 * privados moram na superclasse, que é o caso que o `methodOwner` precisa
 * resolver.
 */
class FakeRendererBase {
  projected = 0;
  rendered = 0;
  drawnObjects = 0;

  render(scene: Object3D): void {
    scene.updateMatrixWorld(true);
    this._projectObject(scene, 0);
    this._renderObjects(3);
  }

  _projectObject(object: Object3D, depth: number): void {
    this.projected++;
    // Recursivo, como no three: a sonda só pode cronometrar o topo.
    if (depth < 2) for (const child of object.children) this._projectObject(child, depth + 1);
  }

  _renderObjects(count: number): void {
    this.rendered++;
    for (let i = 0; i < count; i++) this.renderObject();
  }

  renderObject(): void {
    this.drawnObjects++;
  }
}

class FakeRenderer extends FakeRendererBase {}

function sceneWithChildren(count: number): Object3D {
  const scene = new Object3D();
  for (let i = 0; i < count; i++) scene.add(new Object3D());
  return scene;
}

describe('RenderPhaseProbe', () => {
  const probes: RenderPhaseProbe[] = [];
  const track = (probe: RenderPhaseProbe): RenderPhaseProbe => {
    probes.push(probe);
    return probe;
  };

  afterEach(() => {
    while (probes.length > 0) probes.pop()?.uninstall();
  });

  it('não embrulha nada quando desligada', () => {
    const renderer = new FakeRenderer();
    const original = FakeRendererBase.prototype.render;
    const probe = track(new RenderPhaseProbe(PROBE_OFF));

    expect(probe.install(renderer)).toBe(false);
    expect(probe.enabled).toBe(false);
    expect(FakeRendererBase.prototype.render).toBe(original);
  });

  it('conta uma chamada de topo por fase, não a recursão', () => {
    const renderer = new FakeRenderer();
    const probe = track(new RenderPhaseProbe(PROBE_PHASES));
    expect(probe.install(renderer)).toBe(true);

    renderer.render(sceneWithChildren(4));
    probe.commitFrame();

    const calls = probe.lastFrameCalls();
    // O `_projectObject` rodou 5 vezes (raiz + 4 filhos), mas só a de topo é
    // cronometrada — senão a mesma árvore contaria uma vez por nó.
    expect(renderer.projected).toBe(5);
    expect(calls['project']).toBe(1);
    expect(calls['matrix']).toBe(1);
    expect(calls['objects']).toBe(1);
    // Nível 1 não mede por objeto.
    expect(calls['each']).toBe(0);
  });

  it('ignora o que acontece fora do render', () => {
    const renderer = new FakeRenderer();
    const probe = track(new RenderPhaseProbe(PROBE_PHASES));
    probe.install(renderer);

    // É o caso do `?bench&hold&jitter`, que mexe na matriz da câmera fora do
    // render: não pode entrar no balde da fase.
    new Object3D().updateMatrixWorld(true);
    probe.commitFrame();

    expect(probe.lastFrameCalls()['matrix']).toBe(0);
  });

  it('não conta duas vezes uma fase aninhada em outra', () => {
    // O renderer chama `updateMatrixWorld` DENTRO dos passes. Medindo tempo
    // total, os baldes se sobrepõem e a soma passa do render — foi o que a
    // primeira medição mostrou (resto negativo). Cada balde guarda tempo
    // PRÓPRIO.
    const BUSY_MS = 5;
    const queima = (ms: number): void => {
      const ate = performance.now() + ms;
      while (performance.now() < ate) {
        /* ocupa a CPU para o balde ter tempo mensurável */
      }
    };
    class NestedRenderer extends FakeRendererBase {
      override _renderObjects(count: number): void {
        // A fase `matrix` roda no meio da fase `objects` — é o que o renderer
        // do three faz nos passes.
        const objeto = new Object3D();
        objeto.matrixWorldNeedsUpdate = true;
        queima(BUSY_MS);
        objeto.updateMatrixWorld(true);
        super._renderObjects(count);
      }
    }
    const renderer = new NestedRenderer();
    const probe = track(new RenderPhaseProbe(PROBE_PHASES));
    probe.install(renderer);

    const antesMs = performance.now();
    renderer.render(sceneWithChildren(2));
    const totalMs = performance.now() - antesMs;
    probe.commitFrame();

    const ms = probe.lastFrameMs();
    const soma = ms['matrix'] + ms['project'] + ms['objects'];
    // Duas chamadas de topo de matrix: a da cena e a de dentro do `_renderObjects`.
    expect(probe.lastFrameCalls()['matrix']).toBe(2);
    // O que prova a disjunção: a soma dos baldes cabe no render inteiro. Com
    // tempo TOTAL (e não próprio), os 5 ms queimados entrariam em dois baldes e
    // a soma passaria do total.
    expect(soma).toBeLessThanOrEqual(totalMs);
    expect(ms['objects']).toBeGreaterThanOrEqual(BUSY_MS);
  });

  it('mede por objeto só no nível 2', () => {
    const renderer = new FakeRenderer();
    const probe = track(new RenderPhaseProbe(PROBE_PER_OBJECT));
    probe.install(renderer);

    renderer.render(sceneWithChildren(1));
    probe.commitFrame();

    expect(renderer.drawnObjects).toBe(3);
    expect(probe.lastFrameCalls()['each']).toBe(3);
  });

  it('embrulha os colaboradores internos só no primeiro render', () => {
    // Os internos (`_objects`, `_nodes`, `backend`…) nascem no `init()`
    // ASSÍNCRONO do renderer: no construtor ainda são nulos. Tentar ali
    // desligava a sonda inteira e o trace saía todo zerado.
    class Colaborador {
      chamadas = 0;
      get(): void {
        this.chamadas++;
      }
      needsRefresh(): void {}
      updateBefore(): void {}
      updateForRender(): void {}
      updateAfter(): void {}
      isReady(): void {}
      draw(): void {}
    }
    class LateRenderer extends FakeRendererBase {
      _objects: Colaborador | null = null;
      _nodes: Colaborador | null = null;
      _geometries: Colaborador | null = null;
      _bindings: Colaborador | null = null;
      _pipelines: Colaborador | null = null;
      backend: Colaborador | null = null;

      init(): void {
        this._objects = new Colaborador();
        this._nodes = new Colaborador();
        this._geometries = new Colaborador();
        this._bindings = new Colaborador();
        this._pipelines = new Colaborador();
        this.backend = new Colaborador();
      }

      override renderObject(): void {
        super.renderObject();
        this._objects?.get();
      }
    }
    const renderer = new LateRenderer();
    const probe = track(new RenderPhaseProbe(3));

    expect(probe.install(renderer)).toBe(true);
    expect(probe.internalsOk).toBe(null); // ainda não tentou

    renderer.init(); // o que o `init()` do renderer faz, tarde
    renderer.render(sceneWithChildren(1));
    probe.commitFrame();

    expect(probe.internalsOk).toBe(true);
    expect(probe.lastFrameCalls()['objGet']).toBe(3);
  });

  it('desliga e restaura tudo quando um método esperado não existe', () => {
    // Um bump do three pode renomear os privados. Gravar zero seria
    // indistinguível de "fase barata" — então a sonda falha alto.
    class SemProjectObject {
      render(): void {}
      _renderObjects(): void {}
      renderObject(): void {}
    }
    const originalMatrix = Object3D.prototype.updateMatrixWorld;
    const probe = track(new RenderPhaseProbe(PROBE_PHASES));

    expect(probe.install(new SemProjectObject())).toBe(false);
    expect(probe.enabled).toBe(false);
    expect(Object3D.prototype.updateMatrixWorld).toBe(originalMatrix);
  });

  it('restaura os métodos originais no uninstall', () => {
    const renderer = new FakeRenderer();
    const originalRender = FakeRendererBase.prototype.render;
    const originalProject = FakeRendererBase.prototype._projectObject;
    const probe = new RenderPhaseProbe(PROBE_PHASES);
    probe.install(renderer);
    probe.uninstall();

    expect(FakeRendererBase.prototype.render).toBe(originalRender);
    expect(FakeRendererBase.prototype._projectObject).toBe(originalProject);
    expect(probe.enabled).toBe(false);
  });

  it('calibra custo e resolução do relógio', () => {
    const clock = calibrateClock();
    expect(clock.costNs).toBeGreaterThan(0);
    expect(clock.resolutionNs).toBeGreaterThanOrEqual(0);
  });

  it('lê o nível da query', () => {
    const original = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      value: { search: '?bench&renderPhases=2' },
      configurable: true,
    });
    expect(renderPhasesRequested()).toBe(PROBE_PER_OBJECT);

    Object.defineProperty(globalThis, 'location', { value: { search: '?bench' }, configurable: true });
    expect(renderPhasesRequested()).toBe(PROBE_OFF);

    Object.defineProperty(globalThis, 'location', { value: original, configurable: true });
  });
});
