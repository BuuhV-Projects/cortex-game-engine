/**
 * Testes do clipboard de nós (CTRL+C/CTRL+V, SPEC-0095) — `buildPastedNode`:
 * id novo, transform explícito (offset X/Z + rotação/escala do original),
 * sem `place`, sem singletons de gameplay (`player`/`character`), extras
 * (scripts/collider) preservados, e sem mutação do def de origem.
 */
import { describe, it, expect } from 'vitest';
import { buildPastedNode, PASTE_OFFSET, type NodeClipboard } from '../../src/editor/clipboardNode.js';
import type { SceneNode } from '../../src/scene/SceneDefinition.js';

const clipOf = (def: Record<string, unknown>): NodeClipboard => ({
  def: def as unknown as SceneNode,
  position: [10, 2, -3],
  rotation: [0, 1.5, 0],
  scale: [2, 1, 2],
});

describe('buildPastedNode', () => {
  it('id novo + transform do clipboard com offset em X/Z', () => {
    const node = buildPastedNode(
      clipOf({ type: 'model', id: 'm5', url: 'assets/kit/tree_001.glb', place: { x: 1, y: 0, z: 2 } }),
      'add-abc',
    ) as unknown as Record<string, unknown>;
    expect(node['id']).toBe('add-abc');
    expect(node['place']).toBeUndefined(); // transform explícito substitui o place
    expect(node['transform']).toEqual({
      position: [10 + PASTE_OFFSET, 2, -3 + PASTE_OFFSET],
      rotation: [0, 1.5, 0],
      scale: [2, 1, 2],
    });
  });

  it('remove singletons de gameplay (player/character), preserva o resto', () => {
    const node = buildPastedNode(
      clipOf({
        type: 'model', id: 'player', url: 'p.glb',
        player: true,
        character: { radius: 0.4, height: 1.8 },
        scripts: [{ type: 'Moeda' }],
        collider: { type: 'box' },
        castShadow: true,
      }),
      'add-x',
    ) as unknown as Record<string, unknown>;
    expect(node['player']).toBeUndefined();
    expect(node['character']).toBeUndefined();
    expect(node['scripts']).toEqual([{ type: 'Moeda' }]);
    expect(node['collider']).toEqual({ type: 'box' });
    expect(node['castShadow']).toBe(true);
  });

  it('não muta o def de origem (clona fundo)', () => {
    const src = { type: 'model', id: 'm1', url: 'a.glb', scripts: [{ type: 'Perigo' }] };
    const clip = clipOf(src);
    const node = buildPastedNode(clip, 'add-1') as unknown as { scripts: Array<{ type: string }> };
    node.scripts[0]!.type = 'MUDOU';
    expect(src.scripts[0]!.type).toBe('Perigo');
    expect(src.id).toBe('m1');
  });
});
