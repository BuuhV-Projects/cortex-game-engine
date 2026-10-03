import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Matrix4 } from 'three';
import {
  buildTransformOnlyPlan,
  installTransformOnlyRefresh,
  transformOnlyRefreshRequested,
} from '../../src/render/TransformOnlyRefresh';

const RENDER_ID = 7;
const MOVED_X = 3;

/** Node de update falso: registra quem foi atualizado. */
function makeNode(type: string, extra: Record<string, unknown> = {}) {
  return {
    getUpdateType: () => type,
    getUpdateBeforeType: () => type,
    getUpdateAfterType: () => type,
    ...extra,
  };
}

/** UBO falso com a semântica do `UniformsGroup.updateByType` (compara e marca faixa). */
function makeUbo(uniforms: { source: unknown; offset: number; count: number; value: number }[]) {
  const written = new Map<unknown, number>();
  return {
    isUniformsGroup: true,
    groupNode: { shared: false },
    uniforms: uniforms.map((u) => ({ nodeUniform: { node: u.source }, ...u })),
    updateRanges: [] as { start: number; count: number }[],
    updateByType(uniform: { source: unknown; offset: number; count: number; value: number }) {
      if (written.get(uniform.source) === uniform.value) return false;
      written.set(uniform.source, uniform.value);
      this.updateRanges.push({ start: uniform.offset, count: uniform.count });
      return true;
    },
    addUpdateRange(start: number, count: number) {
      this.updateRanges.push({ start, count });
    },
    clearUpdateRanges() {
      this.updateRanges.length = 0;
    },
  };
}

/** Cena mínima: um render object com matriz, material vigiado e UBO de objeto. */
function makeScene() {
  const modelOut = { name: 'modelWorldMatrix' };
  const colorOut = { name: 'materialColor' };
  const modelNode = makeNode('object', { uniformNode: modelOut });
  const colorNode = makeNode('object', { isMaterialReferenceNode: true, property: 'color', node: colorOut });
  const renderNode = makeNode('render');
  const uniforms = [
    { source: colorOut, offset: 0, count: 4, value: 1 },
    { source: modelOut, offset: 4, count: 16, value: 0 },
    { source: { name: 'normalMatrix' }, offset: 20, count: 12, value: 0 },
  ];
  const ubo = makeUbo(uniforms);
  // Primeira escrita (o refresh completo do three já tinha acontecido).
  for (const u of ubo.uniforms) ubo.updateByType(u);
  ubo.clearUpdateRanges();

  const matrixWorld = new Matrix4();
  const monitor = {
    hasNode: false,
    hasAnimation: false,
    renderId: RENDER_ID,
    refreshUniforms: ['color', 'map'],
    data: { worldMatrix: matrixWorld.clone() },
    renderObjects: { get: (_: object) => monitor.data as { worldMatrix: Matrix4 } | undefined },
    needsVelocity: () => false,
  };
  const renderObject = {
    object: { matrixWorld, static: false },
    bundle: null as unknown,
    getMonitor: () => monitor,
    getNodeBuilderState: () => ({
      updateNodes: [modelNode, renderNode, colorNode],
      updateBeforeNodes: [makeNode('render')],
      updateAfterNodes: [] as ReturnType<typeof makeNode>[],
    }),
    getBindings: () => [{ bindings: [ubo, { isSampledTexture: true }] }],
  };
  const updated: unknown[] = [];
  const frame = {
    renderId: RENDER_ID,
    renderer: {},
    updateNode(node: { uniformNode?: unknown }) {
      updated.push(node);
      // O ModelNode "lê" a matriz: muda o valor da sua saída.
      if (node === modelNode) ubo.uniforms[1].value = matrixWorld.elements[12];
    },
  };
  // needsRefresh "original": o observer só compara a matriz e uma flag de material.
  const materialChanged = { value: false };
  const original = vi.fn(function (this: unknown, ro: typeof renderObject) {
    if (!monitor.data) return true;
    if (!monitor.data.worldMatrix.equals(ro.object.matrixWorld)) {
      monitor.data.worldMatrix.copy(ro.object.matrixWorld);
      return true;
    }
    return materialChanged.value;
  });
  const nodes = {
    needsRefresh: original,
    getNodeFrameForRender: () => frame,
  };
  const ranges: { start: number; count: number }[][] = [];
  const updateBinding = vi.fn((binding: typeof ubo) => {
    ranges.push(binding.updateRanges.map((r) => ({ ...r })));
  });
  const renderer = { _nodes: nodes, backend: { updateBinding } };
  return { renderer, nodes, original, renderObject, monitor, frame, updated, modelNode, colorNode, renderNode, ubo, updateBinding, ranges, materialChanged, matrixWorld };
}

describe('TransformOnlyRefresh (ADR-0290)', () => {
  let s: ReturnType<typeof makeScene>;
  beforeEach(() => {
    s = makeScene();
  });

  it('só a matriz mudou: devolve false, atualiza só a transformação e escreve uma faixa', () => {
    const handle = installTransformOnlyRefresh(s.renderer)!;
    s.matrixWorld.makeTranslation(MOVED_X, 0, 0);
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(false);
    expect(s.updated).toEqual([s.modelNode]); // nem o render node, nem o de material vigiado
    expect(s.updateBinding).toHaveBeenCalledTimes(1);
    expect(s.ranges[0]).toEqual([{ start: 4, count: 16 }]);
    expect(s.ubo.updateRanges).toEqual([]);
    expect(handle.stats).toEqual({ fast: 1, full: 0 });
    // A matriz ficou sincronizada no observer: o próximo frame parado não refaz.
    expect(s.monitor.data.worldMatrix.equals(s.matrixWorld)).toBe(true);
  });

  it('faixas separadas viram uma só (um writeBuffer por UBO)', () => {
    installTransformOnlyRefresh(s.renderer);
    const normal = s.ubo.uniforms[2];
    s.frame.updateNode = function (node: unknown) {
      s.updated.push(node);
      s.ubo.uniforms[1].value = 1;
      normal.value = 1;
    };
    s.matrixWorld.makeTranslation(MOVED_X, 0, 0);
    s.nodes.needsRefresh(s.renderObject);
    expect(s.ranges[0]).toEqual([{ start: 4, count: 28 }]);
  });

  it('matriz + material mudaram: refresh completo', () => {
    const handle = installTransformOnlyRefresh(s.renderer)!;
    s.materialChanged.value = true;
    s.matrixWorld.makeTranslation(MOVED_X, 0, 0);
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(true);
    expect(s.updated).toEqual([]);
    expect(s.updateBinding).not.toHaveBeenCalled();
    expect(handle.stats).toEqual({ fast: 0, full: 1 });
  });

  it('parado: delega ao three sem tocar em nada', () => {
    installTransformOnlyRefresh(s.renderer);
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(false);
    expect(s.original).toHaveBeenCalledTimes(1);
    expect(s.updated).toEqual([]);
  });

  it('nada mudou no UBO: nenhuma escrita', () => {
    installTransformOnlyRefresh(s.renderer);
    s.frame.updateNode = (node: unknown) => void s.updated.push(node); // não muda valor
    s.matrixWorld.makeTranslation(MOVED_X, 0, 0);
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(false);
    expect(s.updateBinding).not.toHaveBeenCalled();
  });

  it.each([
    ['bundle', () => (s.renderObject.bundle = {})],
    ['static', () => (s.renderObject.object.static = true)],
    ['hasNode', () => (s.monitor.hasNode = true)],
    ['skinned', () => (s.monitor.hasAnimation = true)],
    ['primeira vez no monitor', () => ((s.monitor as { data: unknown }).data = undefined)],
    ['primeiro do render', () => (s.monitor.renderId = RENDER_ID - 1)],
    ['MRT de velocidade', () => (s.monitor.needsVelocity = () => true)],
  ])('delega ao three: %s', (_, setup) => {
    installTransformOnlyRefresh(s.renderer);
    setup();
    s.matrixWorld.makeTranslation(MOVED_X, 0, 0);
    s.nodes.needsRefresh(s.renderObject);
    expect(s.original).toHaveBeenCalledTimes(1);
    expect(s.updated).toEqual([]);
    expect(s.updateBinding).not.toHaveBeenCalled();
  });

  it('plano inválido com updateBefore por objeto: refresh completo', () => {
    const state = s.renderObject.getNodeBuilderState();
    state.updateBeforeNodes.push(makeNode('object'));
    s.renderObject.getNodeBuilderState = () => state;
    expect(buildTransformOnlyPlan(s.renderObject)).toBeNull();
    const handle = installTransformOnlyRefresh(s.renderer)!;
    s.matrixWorld.makeTranslation(MOVED_X, 0, 0);
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(true);
    expect(handle.stats.full).toBe(1);
  });

  it('propriedade de material fora da lista do observer entra no plano', () => {
    const state = s.renderObject.getNodeBuilderState();
    const untracked = makeNode('object', { isMaterialReferenceNode: true, property: 'customGlow', node: {} });
    state.updateNodes.push(untracked);
    s.renderObject.getNodeBuilderState = () => state;
    const plan = buildTransformOnlyPlan(s.renderObject)!;
    expect(plan.nodes).toContain(untracked);
    expect(plan.nodes).not.toContain(s.colorNode);
    // O uniform da cor (fonte não atualizada) sai da comparação; os outros ficam.
    expect(plan.ubos[0].uniforms).toHaveLength(2);
  });

  it('sem os internos do three: não instala', () => {
    expect(installTransformOnlyRefresh({})).toBeNull();
    expect(installTransformOnlyRefresh({ _nodes: { needsRefresh: () => true }, backend: { updateBinding: () => {} } })).toBeNull();
  });

  it('uninstall restaura o needsRefresh original', () => {
    const handle = installTransformOnlyRefresh(s.renderer)!;
    handle.uninstall();
    expect(s.nodes.needsRefresh).toBe(s.original);
  });

  it('query liga/desliga sobre o padrão', () => {
    const saved = globalThis.location;
    const set = (search: string) => Object.defineProperty(globalThis, 'location', { value: { search }, configurable: true });
    try {
      set('');
      expect(transformOnlyRefreshRequested(true)).toBe(true);
      expect(transformOnlyRefreshRequested(false)).toBe(false);
      set('?a=1&transformOnlyRefresh=0');
      expect(transformOnlyRefreshRequested(true)).toBe(false);
      set('?transformOnlyRefresh=1');
      expect(transformOnlyRefreshRequested(false)).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'location', { value: saved, configurable: true });
    }
  });
});
