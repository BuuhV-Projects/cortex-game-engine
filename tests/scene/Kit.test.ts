/**
 * Testes do Kit (src/scene/Kit.ts): parseKit (schema do kit.json, ADR-0053),
 * kitAssetFor (match de url flexível) e resolveAttachTransform (encaixe por
 * socket — matemática pura, sem three).
 */
import { describe, it, expect } from 'vitest';
import { parseKit, kitAssetFor, resolveAttachTransform, type KitManifest } from '../../src/scene/Kit.js';

const kit = (): KitManifest =>
  parseKit({
    version: 1,
    name: 'ilhas',
    module: 2,
    assets: {
      'assets/ilha.glb': {
        role: 'ground',
        tags: ['forest', 'L'],
        size: [12, 3, 8],
        collider: { shape: 'heightfield', solid: true },
        anchors: {
          top: { at: [0, 3, 0], kind: 'surface', dir: [0, 1, 0] },
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
      'assets/coin.glb': { role: 'collectible' },
    },
  })!;

describe('parseKit', () => {
  it('parseia um kit.json válido', () => {
    const k = kit();
    expect(k.name).toBe('ilhas');
    expect(k.assets['assets/ilha.glb']!.anchors!['edge_right']!.kind).toBe('connect');
  });

  it('retorna null pra manifesto inválido (falha detectável, não silenciosa)', () => {
    expect(parseKit({ version: 2, name: 'x', assets: {} })).toBeNull();
    expect(parseKit({ version: 1, assets: {} })).toBeNull();
    expect(parseKit('não é objeto')).toBeNull();
  });
});

describe('kitAssetFor', () => {
  it('acha por chave exata, por sufixo de caminho e por basename', () => {
    const k = kit();
    expect(kitAssetFor(k, 'assets/ilha.glb')?.role).toBe('ground');
    // url de projeto com prefixo do kit (pós import_kit)
    expect(kitAssetFor(k, 'assets/ilhas/assets/ilha.glb')?.role).toBe('ground');
    expect(kitAssetFor(k, 'assets/ilhas/ilha.glb')?.role).toBe('ground');
  });

  it('aceita lista de kits e devolve undefined quando não há match', () => {
    const k = kit();
    expect(kitAssetFor([k], 'assets/ponte.glb')?.role).toBe('connector');
    expect(kitAssetFor(k, 'assets/inexistente.glb')).toBeUndefined();
    expect(kitAssetFor(undefined, 'assets/ilha.glb')).toBeUndefined();
  });
});

describe('resolveAttachTransform', () => {
  const k = kit();
  const ilha = k.assets['assets/ilha.glb']!;
  const ponte = k.assets['assets/ponte.glb']!;

  it('encaixa connect↔connect: sockets coincidem e as dir se encaram', () => {
    // Ilha na origem sem rotação; ponte encaixa socket `a` no `edge_right`.
    const pose = resolveAttachTransform(
      { position: [0, 0, 0], rotationY: 0, scale: [1, 1, 1] },
      ilha.anchors!['edge_right']!,
      ponte.anchors!['a']!,
      { rotationY: 0, scale: [1, 1, 1] },
    );
    // dir do alvo = +X ⇒ dir própria desejada = -X, que já é a dir de `a` ⇒ yaw 0.
    expect(pose.rotationY).toBeCloseTo(0, 6);
    // socket alvo em mundo = [6,3,0]; socket próprio local [-2.5,0,0] ⇒ pos = [8.5,3,0].
    expect(pose.position[0]).toBeCloseTo(8.5, 6);
    expect(pose.position[1]).toBeCloseTo(3, 6);
    expect(pose.position[2]).toBeCloseTo(0, 6);
  });

  it('gira o dependente pra encarar o alvo (alvo rotacionado 90°)', () => {
    const rot = Math.PI / 2; // ilha girada: edge_right (+X local) aponta pra… rotY(+90°)
    const pose = resolveAttachTransform(
      { position: [10, 0, -4], rotationY: rot, scale: [1, 1, 1] },
      ilha.anchors!['edge_right']!,
      ponte.anchors!['a']!,
      { rotationY: 0, scale: [1, 1, 1] },
    );
    // dir alvo em mundo = rotY([1,0,0], 90°) = [0,0,-1] ⇒ desejada = [0,0,1].
    // dir própria base = [-1,0,0] ⇒ yaw que leva [-1,0,0] a [0,0,1]:
    // heading([0,0,1]) = 0; heading([-1,0,0]) = -π/2 ⇒ yaw = π/2.
    expect(pose.rotationY).toBeCloseTo(Math.PI / 2, 6);
    // socket alvo mundo: [10,0,-4] + rotY([6,3,0], 90°) = [10,3,-4] + [0,0,-6] = [10,3,-10].
    // offset próprio: rotY([-2.5,0,0], π/2) = [0,0,2.5] ⇒ pos = [10,3,-12.5].
    expect(pose.position[0]).toBeCloseTo(10, 6);
    expect(pose.position[1]).toBeCloseTo(3, 6);
    expect(pose.position[2]).toBeCloseTo(-12.5, 6);
  });

  it('surface (pousar em cima): mantém o yaw autorado e leva o socket próprio ao topo', () => {
    const coinBase = { at: [0, 0, 0] as [number, number, number], kind: 'surface' as const };
    const pose = resolveAttachTransform(
      { position: [2, 1, 3], rotationY: 0, scale: [1, 1, 1] },
      ilha.anchors!['top']!,
      coinBase,
      { rotationY: 0.7, scale: [1, 1, 1] },
    );
    expect(pose.rotationY).toBeCloseTo(0.7, 6); // surface não realinha yaw
    expect(pose.position).toEqual([2, 4, 3]); // topo da ilha (y = 1 + 3)
  });

  it('respeita escala do alvo e do dependente', () => {
    const pose = resolveAttachTransform(
      { position: [0, 0, 0], rotationY: 0, scale: [2, 2, 2] }, // ilha 2×: edge_right em [12,6,0]
      ilha.anchors!['edge_right']!,
      ponte.anchors!['a']!,
      { rotationY: 0, scale: [2, 2, 2] }, // ponte 2×: socket próprio em [-5,0,0]
    );
    expect(pose.position[0]).toBeCloseTo(17, 6); // 12 - (-5)
    expect(pose.position[1]).toBeCloseTo(6, 6);
  });
});
