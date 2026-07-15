/**
 * Testes de integração do `attach` no buildScene (src/scene/SceneBuilder.ts):
 * encaixe por socket com kit (ADR-0053 §2), falha-alto (socket/alvo ausente,
 * ciclo, sem kit) e precedência do override do editor. `loadGLB` é mockado
 * (Group vazio) — a matemática do encaixe é coberta no Kit.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { Group } from 'three';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { parseKit } from '../../src/scene/Kit.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

vi.mock('../../src/scene/SceneAssets.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/scene/SceneAssets.js')>();
  return {
    ...actual,
    loadGLB: vi.fn(async () => ({ scene: new Group(), animations: [] })),
  };
});

const kit = parseKit({
  version: 1,
  name: 'ilhas',
  assets: {
    'assets/ilha.glb': {
      role: 'ground',
      anchors: {
        edge_right: { at: [6, 3, 0], kind: 'connect', dir: [1, 0, 0] },
        edge_left: { at: [-6, 3, 0], kind: 'connect', dir: [-1, 0, 0] },
      },
    },
    'assets/ponte.glb': {
      role: 'connector',
      anchors: {
        a: { at: [-2.5, 0, 0], kind: 'connect', dir: [-1, 0, 0] },
        b: { at: [2.5, 0, 0], kind: 'connect', dir: [1, 0, 0] },
      },
    },
  },
})!;

const ilha = { type: 'model', id: 'ilha_1', url: 'assets/ilha.glb', transform: { position: [0, 0, 0] } } as const;
const ponte = {
  type: 'model',
  id: 'ponte_1',
  url: 'assets/ponte.glb',
  attach: { socket: 'a', to: 'ilha_1', toSocket: 'edge_right' },
} as const;

const def = (...nodes: unknown[]): SceneDefinition =>
  ({ version: 1, nodes } as unknown as SceneDefinition);

describe('buildScene + attach (encaixe por socket)', () => {
  it('encaixa o socket próprio no socket do alvo', async () => {
    const handle = await buildScene(new Scene(), def(ilha, ponte), { kit });
    const p = handle.byId.get('ponte_1')!;
    expect(p.position.x).toBeCloseTo(8.5); // edge_right [6,3,0] - socket a [-2.5,0,0]
    expect(p.position.y).toBeCloseTo(3);
    expect(p.position.z).toBeCloseTo(0);
  });

  it('resolve cadeias em ordem de dependência (ponte→ilha_2→ilha_1)', async () => {
    const ilha2 = {
      type: 'model',
      id: 'ilha_2',
      url: 'assets/ilha.glb',
      attach: { socket: 'edge_left', to: 'ilha_1', toSocket: 'edge_right' },
    } as const;
    const ponteNa2 = { ...ponte, attach: { ...ponte.attach, to: 'ilha_2' } };
    // Ordem no array é inversa à dependência — o resolver ordena sozinho.
    const handle = await buildScene(new Scene(), def(ponteNa2, ilha2, ilha), { kit });
    // ilha_2: edge_left [-6,3,0] coincide com edge_right de ilha_1 [6,3,0] ⇒ pos [12,0,0].
    expect(handle.byId.get('ilha_2')!.position.x).toBeCloseTo(12);
    // ponte: edge_right de ilha_2 = [18,3,0] ⇒ pos [20.5,3,0].
    expect(handle.byId.get('ponte_1')!.position.x).toBeCloseTo(20.5);
  });

  it('falha alto: socket inexistente (lista os disponíveis)', async () => {
    const errado = { ...ponte, attach: { ...ponte.attach, toSocket: 'topo' } };
    await expect(buildScene(new Scene(), def(ilha, errado), { kit })).rejects.toThrow(
      /socket "topo" não existe.*edge_right/,
    );
  });

  it('falha alto: alvo inexistente', async () => {
    const orfa = { ...ponte, attach: { ...ponte.attach, to: 'fantasma' } };
    await expect(buildScene(new Scene(), def(ilha, orfa), { kit })).rejects.toThrow(/inexistente\/deletado "fantasma"/);
  });

  it('falha alto: ciclo de attach', async () => {
    const a = { ...ponte, id: 'p1', attach: { socket: 'a', to: 'p2', toSocket: 'b' } };
    const b = { ...ponte, id: 'p2', attach: { socket: 'a', to: 'p1', toSocket: 'b' } };
    await expect(buildScene(new Scene(), def(a, b), { kit })).rejects.toThrow(/ciclo de attach/);
  });

  it('falha alto: sem kit em options (mensagem orienta passar parseKit)', async () => {
    await expect(buildScene(new Scene(), def(ilha, ponte), {})).rejects.toThrow(/options\.kit/);
  });

  it('override do editor vence o attach (nó movido à mão não re-encaixa)', async () => {
    const overlay: SceneFileV1 = {
      version: 1,
      objects: { ponte_1: { position: [99, 1, 2], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      data: {},
    };
    const handle = await buildScene(new Scene(), def(ilha, ponte), { kit, overlay });
    expect(handle.byId.get('ponte_1')!.position.x).toBeCloseTo(99);
  });
});
