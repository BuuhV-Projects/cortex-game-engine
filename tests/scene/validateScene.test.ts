/**
 * Testes do validateScene (src/scene/validateScene.ts): interpenetração,
 * flutuação, gameplay tombado/desalinhado, gap/subida impulável e attach
 * quebrado — tudo estático (JSON + kit.json), sem three.
 */
import { describe, it, expect } from 'vitest';
import { validateScene } from '../../src/scene/validateScene.js';
import { parseKit } from '../../src/scene/Kit.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';

const kit = parseKit({
  version: 1,
  name: 'k',
  assets: {
    'assets/bloco.glb': {
      role: 'ground',
      size: [4, 2, 4],
      collider: { shape: 'box', solid: true },
      anchors: { top: { at: [0, 2, 0], kind: 'surface', dir: [0, 1, 0] } },
    },
    'assets/plataforma.glb': {
      role: 'platform',
      size: [3, 0.5, 3],
      collider: { shape: 'box', solid: true, oneWay: true },
    },
    'assets/moeda.glb': { role: 'collectible', size: [0.5, 0.5, 0.1] },
    'assets/arvore.glb': { role: 'decoration', size: [2, 5, 2] },
  },
})!;

const def = (...nodes: unknown[]): SceneDefinition =>
  ({ version: 1, nodes } as unknown as SceneDefinition);

const bloco = (id: string, x: number, extra: object = {}) =>
  ({ type: 'model', id, url: 'assets/bloco.glb', place: { x, y: 0 }, ...extra } as const);

describe('validateScene', () => {
  it('cena limpa: blocos encostados lado a lado, zero violações', () => {
    const r = validateScene(def(bloco('a', 0), bloco('b', 4)), { kit });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.stats.boxed).toBe(2);
  });

  it('overlap: bloco DENTRO do outro é erro (com profundidade na mensagem)', () => {
    const r = validateScene(def(bloco('a', 0), bloco('b', 1)), { kit });
    const v = r.errors.find((e) => e.rule === 'overlap');
    expect(v).toBeDefined();
    expect(v!.message).toMatch(/interpenetra/);
  });

  it('floating: bloco de chão no ar sem apoio é erro; plataforma no ar é warning', () => {
    const chaoVoador = { type: 'model', id: 'chao', url: 'assets/bloco.glb', place: { x: 0, y: 5 } };
    const plataforma = { type: 'model', id: 'plat', url: 'assets/plataforma.glb', place: { x: 20, y: 3 } };
    const r = validateScene(def(chaoVoador, plataforma), { kit });
    expect(r.errors.some((e) => e.rule === 'floating' && e.nodeId === 'chao')).toBe(true);
    expect(r.warnings.some((w) => w.rule === 'floating' && w.nodeId === 'plat')).toBe(true);
  });

  it('floating: bloco APOIADO em outro não é violação', () => {
    const emCima = { type: 'model', id: 'cima', url: 'assets/bloco.glb', place: { x: 0, y: 2 } };
    const r = validateScene(def(bloco('base', 0), emCima), { kit });
    expect(r.errors.filter((e) => e.rule === 'floating')).toEqual([]);
  });

  it('tilted: chão com rotX é erro; decoração tombada não é', () => {
    const torto = { type: 'model', id: 'torto', url: 'assets/bloco.glb', transform: { position: [0, 0, 0], rotation: [0.4, 0, 0] } };
    const arvore = { type: 'model', id: 'arv', url: 'assets/arvore.glb', transform: { position: [30, 0, 0], rotation: [0.3, 1.1, 0] } };
    const r = validateScene(def(torto, arvore), { kit });
    expect(r.errors.some((e) => e.rule === 'tilted' && e.nodeId === 'torto')).toBe(true);
    expect(r.errors.concat(r.warnings).some((v) => v.nodeId === 'arv')).toBe(false);
  });

  it('misaligned: chão com rotY fora de 90° é warning', () => {
    const girado = { type: 'model', id: 'g', url: 'assets/bloco.glb', place: { x: 0, y: 0, rotY: 0.6 } };
    const r = validateScene(def(girado), { kit });
    expect(r.warnings.some((w) => w.rule === 'misaligned')).toBe(true);
  });

  it('gap: vão maior que o pulo entre plataformas vira warning (só com player)', () => {
    const player = { type: 'model', id: 'p', url: 'assets/moeda.glb', place: { x: 0, y: 2 }, player: true };
    const semPlayer = validateScene(def(bloco('a', 0), bloco('b', 12)), { kit });
    expect(semPlayer.warnings.filter((w) => w.rule === 'gap')).toEqual([]);
    const comPlayer = validateScene(def(bloco('a', 0), bloco('b', 12), player), { kit });
    const gap = comPlayer.warnings.find((w) => w.rule === 'gap');
    expect(gap).toBeDefined();
    expect(gap!.message).toMatch(/8\.00u/); // 12 - 4 (borda a borda)
  });

  it('attach quebrado vira violação (não lança): socket inexistente', () => {
    const dep = {
      type: 'model',
      id: 'dep',
      url: 'assets/bloco.glb',
      attach: { socket: 'topo_errado', to: 'a', toSocket: 'top' },
    };
    const r = validateScene(def(bloco('a', 0), dep), { kit });
    expect(r.errors.some((e) => e.rule === 'attach')).toBe(true);
  });

  it('overlay: deleted sai da validação; override de posição vale', () => {
    const r = validateScene(def(bloco('a', 0), bloco('b', 1)), {
      kit,
      overlay: { version: 1, objects: {}, data: { deleted: ['b'] } },
    });
    expect(r.errors).toEqual([]);
    const movido = validateScene(def(bloco('a', 0), bloco('b', 1)), {
      kit,
      // dev moveu "b" pra longe no editor — resolve o overlap
      overlay: { version: 1, objects: { b: { position: [10, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }, data: {} },
    });
    expect(movido.errors.filter((e) => e.rule === 'overlap')).toEqual([]);
  });

  it('nó model sem entrada no kit é reportado em stats.skipped (cobertura honesta)', () => {
    const alien = { type: 'model', id: 'x', url: 'assets/fora-do-kit.glb', place: { x: 0, y: 0 } };
    const r = validateScene(def(alien), { kit });
    expect(r.stats.skipped).toContain('x');
  });
});
