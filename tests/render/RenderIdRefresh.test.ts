import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Matrix4 } from 'three';
import { installRenderIdRefresh, renderIdRefreshRequested } from '../../src/render/RenderIdRefresh';
import { installTransformOnlyRefresh } from '../../src/render/TransformOnlyRefresh';

const FIRST_RENDER = 7;
const NEXT_RENDER = 8;
const MOVED_X = 3;
const UV_OFFSET = 0.5;

function makeNode(type: string, extra: Record<string, unknown> = {}) {
  return {
    getUpdateType: () => type,
    getUpdateBeforeType: () => type,
    getUpdateAfterType: () => type,
    ...extra,
  };
}

/** UBO falso com a semântica do `UniformsGroup.updateByType` (compara e marca faixa). */
function makeUbo(uniforms: { source: unknown; offset: number; count: number; value: number }[], shared = false) {
  const written = new Map<unknown, number>();
  return {
    isUniformsGroup: true,
    isBuffer: true,
    groupNode: { shared },
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

/**
 * Cena mínima: um render object de material EXCLUSIVO já inicializado, com nó
 * de câmera (render), sombra (updateBefore render), referência de material
 * vigiada, matriz de UV de textura (object) e matriz de mundo (object).
 */
function makeScene() {
  const modelOut = { name: 'modelWorldMatrix' };
  const colorOut = { name: 'materialColor' };
  const uvOut = { name: 'uvTransform' };
  const modelNode = makeNode('object', { uniformNode: modelOut });
  const colorNode = makeNode('object', { isMaterialReferenceNode: true, property: 'color', node: colorOut });
  const uvNode = makeNode('object', { uniformNode: uvOut });
  const cameraNode = makeNode('render');
  const shadowNode = makeNode('render');
  const objectUbo = makeUbo([
    { source: colorOut, offset: 0, count: 4, value: 1 },
    { source: modelOut, offset: 4, count: 16, value: 0 },
    { source: uvOut, offset: 20, count: 12, value: 0 },
  ]);
  for (const u of objectUbo.uniforms) objectUbo.updateByType(u);
  objectUbo.clearUpdateRanges();
  const renderUbo = makeUbo([{ source: { name: 'cameraViewMatrix' }, offset: 0, count: 16, value: 0 }], true);
  const sharedGroup = { bindings: [renderUbo] };
  const objectGroup = { bindings: [objectUbo, { isSampledTexture: true, groupNode: { shared: false } }] };

  const matrixWorld = new Matrix4();
  const data = { worldMatrix: matrixWorld.clone() };
  const monitor = {
    hasNode: false,
    hasAnimation: false,
    renderId: FIRST_RENDER,
    refreshUniforms: ['color', 'map'],
    renderObjects: { get: (_: object) => data, has: (_: object) => true },
    needsVelocity: () => false,
  };
  const state = {
    updateNodes: [modelNode, cameraNode, colorNode, uvNode],
    updateBeforeNodes: [shadowNode],
    updateAfterNodes: [] as ReturnType<typeof makeNode>[],
  };
  const renderObject = {
    object: { matrixWorld, static: false } as { matrixWorld: Matrix4; static: boolean; isInstancedMesh?: boolean },
    bundle: null as unknown,
    getMonitor: () => monitor,
    getNodeBuilderState: () => state,
    getBindings: () => [sharedGroup, objectGroup],
  };

  const log: string[] = [];
  const updated: unknown[] = [];
  const uv = { value: 0 };
  const frame = {
    renderId: FIRST_RENDER,
    renderer: {},
    camera: 'main',
    updateNode(node: unknown) {
      updated.push(node);
      if (node === modelNode) objectUbo.uniforms[1].value = matrixWorld.elements[12];
      if (node === uvNode) objectUbo.uniforms[2].value = uv.value;
      if (node === cameraNode) log.push(`camera:${frame.camera}`);
    },
  };
  // needsRefresh do three: renderId ANTES do equals (matriz + flag de material).
  const materialChanged = { value: false };
  const threeNeedsRefresh = vi.fn(function (this: unknown, ro: typeof renderObject) {
    if (monitor.renderId !== frame.renderId) {
      monitor.renderId = frame.renderId;
      return true;
    }
    if (!data.worldMatrix.equals(ro.object.matrixWorld)) {
      data.worldMatrix.copy(ro.object.matrixWorld);
      return true;
    }
    return materialChanged.value;
  });
  const nodes = {
    needsRefresh: threeNeedsRefresh,
    getNodeFrameForRender: () => {
      // O render aninhado da sombra deixou o frame com a câmera de sombra.
      frame.camera = 'main';
      return frame;
    },
    updateBefore: vi.fn(() => {
      log.push('shadow');
      frame.camera = 'shadow';
    }),
  };
  const bindings = { _update: vi.fn((group: unknown) => log.push(group === sharedGroup ? 'shared' : 'object')) };
  const ranges: { start: number; count: number }[][] = [];
  const updateBinding = vi.fn((binding: typeof objectUbo) => {
    ranges.push(binding.updateRanges.map((r) => ({ ...r })));
  });
  const renderer = { _nodes: nodes, _bindings: bindings, backend: { updateBinding } };
  const nextRender = () => {
    frame.renderId++;
  };
  return { renderer, nodes, bindings, threeNeedsRefresh, renderObject, monitor, state, frame, log, updated, modelNode, colorNode, uvNode, cameraNode, objectUbo, updateBinding, ranges, materialChanged, matrixWorld, uv, nextRender };
}

describe('RenderIdRefresh (SPEC-0322)', () => {
  let s: ReturnType<typeof makeScene>;
  beforeEach(() => {
    s = makeScene();
    s.nextRender();
    expect(s.frame.renderId).toBe(NEXT_RENDER);
  });

  it('sem o wrapper, o three refaz o objeto parado de material exclusivo a cada render', () => {
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(true);
  });

  it('objeto parado com material exclusivo não refaz nem escreve UBO', () => {
    const handle = installRenderIdRefresh(s.renderer)!;
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(false);
    expect(s.monitor.renderId).toBe(NEXT_RENDER);
    expect(s.updateBinding).not.toHaveBeenCalled();
    expect(handle.stats).toEqual({ skipped: 1, full: 0 });
    // A referência de material vigiada não é reavaliada (o equals vigia).
    expect(s.updated).not.toContain(s.colorNode);
  });

  it('sombra e câmera: updateBefore, nós de render com o frame re-buscado e grupo compartilhado', () => {
    installRenderIdRefresh(s.renderer);
    s.nodes.needsRefresh(s.renderObject);
    expect(s.log).toEqual(['shadow', 'camera:main', 'shared']);
    expect(s.bindings._update).toHaveBeenCalledTimes(1);
  });

  it('nó de objeto que mudou sem o equals ver (UV scroll) é escrito no UBO', () => {
    installRenderIdRefresh(s.renderer);
    s.uv.value = UV_OFFSET;
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(false);
    expect(s.ranges).toEqual([[{ start: 20, count: 12 }]]);
  });

  it('segundo objeto do mesmo render vai direto ao equals', () => {
    installRenderIdRefresh(s.renderer);
    s.nodes.needsRefresh(s.renderObject);
    s.log.length = 0;
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(false);
    expect(s.log).toEqual([]);
  });

  it('material mudou: refresh completo', () => {
    const handle = installRenderIdRefresh(s.renderer)!;
    s.materialChanged.value = true;
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(true);
    expect(handle.stats.full).toBe(1);
  });

  it('material com nós (câmera/tempo no grafo) continua refazendo todo render', () => {
    installRenderIdRefresh(s.renderer);
    s.monitor.hasNode = true;
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(true);
    expect(s.log).toEqual([]);
  });

  it('InstancedMesh e updateAfter delegam ao three', () => {
    installRenderIdRefresh(s.renderer);
    s.renderObject.object.isInstancedMesh = true;
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(true);
    const t = makeScene();
    t.nextRender();
    t.state.updateAfterNodes.push(makeNode('render'));
    installRenderIdRefresh(t.renderer);
    expect(t.nodes.needsRefresh(t.renderObject)).toBe(true);
  });

  it('objeto que anda passa pelo TransformOnly com o renderId em dia (plano aplicado uma vez)', () => {
    installTransformOnlyRefresh(s.renderer);
    const handle = installRenderIdRefresh(s.renderer)!;
    s.matrixWorld.makeTranslation(MOVED_X, 0, 0);
    expect(s.nodes.needsRefresh(s.renderObject)).toBe(false);
    expect(s.ranges).toEqual([[{ start: 4, count: 16 }]]);
    expect(s.updated.filter((n) => n === s.modelNode)).toHaveLength(1);
    expect(handle.stats.skipped).toBe(1);
  });

  it('uninstall devolve o needsRefresh anterior', () => {
    const handle = installRenderIdRefresh(s.renderer)!;
    handle.uninstall();
    expect(s.nodes.needsRefresh).toBe(s.threeNeedsRefresh);
  });

  it('não instala sem os internos esperados', () => {
    expect(installRenderIdRefresh({ _nodes: s.nodes, backend: s.renderer.backend })).toBeNull();
  });

  it('flag de query cai no padrão sem location', () => {
    expect(renderIdRefreshRequested(true)).toBe(true);
    expect(renderIdRefreshRequested(false)).toBe(false);
  });
});
