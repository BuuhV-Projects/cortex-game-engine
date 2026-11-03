import { describe, it, expect } from 'vitest';
import { Document } from '@gltf-transform/core';
// @ts-expect-error — script .mjs sem tipos; é ferramenta de asset, não API do engine.
import { parseSimplifyError, refineDocument } from '../../native/scripts/refine-asset.mjs';

/** Cor sólida distinta por material, que é o caso em que a paleta se aplica. */
function criarPecaColorida(
  doc: Document,
  nome: string,
  cor: [number, number, number, number],
  comUv: boolean,
) {
  const material = doc.createMaterial(nome).setBaseColorFactor(cor).setRoughnessFactor(0.5);
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setMaterial(material);
  if (comUv) {
    // A proteção de material depende de UV: é o que permite pendurar a textura
    // branca que mantém o material fora da paleta.
    const uv = doc
      .createAccessor()
      .setType('VEC2')
      .setArray(new Float32Array([0, 0, 1, 0, 0, 1]));
    prim.setAttribute('TEXCOORD_0', uv);
  }
  return prim;
}

/** Um modelo no padrão "um material por peça", que é o que a IA costuma gerar. */
function modeloComUmMaterialPorPeca(pecas: number, { comUv = false } = {}): Document {
  const doc = new Document();
  const mesh = doc.createMesh('peca-unica');
  for (let i = 0; i < pecas; i++) {
    mesh.addPrimitive(criarPecaColorida(doc, `mat-${i}`, [i / pecas, 0.2, 0.8, 1], comUv));
  }
  const node = doc.createNode('raiz').setMesh(mesh);
  doc.createScene().addChild(node);
  return doc;
}

describe('refineDocument', () => {
  it('funde materiais de cor sólida numa paleta só', async () => {
    const doc = modeloComUmMaterialPorPeca(6);

    const { antes, depois } = await refineDocument(doc);

    expect(antes.materials).toBe(6);
    expect(depois.materials).toBe(1);
    expect(depois.primitives).toBeLessThan(antes.primitives);
  });

  it('preserva material protegido, que o jogo procura pelo nome', async () => {
    // O `rig.json` do kart-racer aponta `paintMaterial` e o `createCar` compara
    // o NOME. Sem isso, a pintura do carro quebraria só em runtime.
    const doc = modeloComUmMaterialPorPeca(5, { comUv: true });
    doc.getRoot().listMaterials()[0]?.setName('Gol_Paint');

    const { depois, protegidos } = await refineDocument(doc, { keep: ['Gol_Paint'] });

    expect(protegidos).toContain('Gol_Paint');
    const nomes = doc.getRoot().listMaterials().map((m) => m.getName());
    expect(nomes).toContain('Gol_Paint');
    // O protegido não fica com a textura branca da proteção.
    const paint = doc.getRoot().listMaterials().find((m) => m.getName() === 'Gol_Paint');
    expect(paint?.getBaseColorTexture()).toBeNull();
    expect(depois.materials).toBeGreaterThan(1);
  });

  it('falha alto quando não consegue proteger o material', async () => {
    // Sem UV não há como segurar o material fora da paleta. Entregar assim
    // quebraria a pintura só em runtime, na garagem — então não entrega.
    const doc = modeloComUmMaterialPorPeca(5, { comUv: false });
    doc.getRoot().listMaterials()[0]?.setName('Gol_Paint');

    await expect(refineDocument(doc, { keep: ['Gol_Paint'] })).rejects.toThrow(/não sobreviveu/);
  });

  it('com keepHierarchy, não mexe na contagem de nós', async () => {
    // Nós são pivôs procurados por nome em runtime (FL/FR/RL/RR). Perdê-los
    // derruba o jogo na largada com "Pivô de roda ausente".
    const doc = modeloComUmMaterialPorPeca(4);
    const extra = doc.createNode('FL');
    doc.getRoot().listScenes()[0]?.addChild(extra);

    const { antes, depois } = await refineDocument(doc, { keepHierarchy: true });

    expect(depois.nodes).toBe(antes.nodes);
    expect(doc.getRoot().listNodes().map((n) => n.getName())).toContain('FL');
  });

  it('é idempotente — rodar de novo não muda mais nada', async () => {
    // É o que permite ligá-lo no fluxo do Chat IA sem medo de rodar duas vezes.
    const doc = modeloComUmMaterialPorPeca(6);
    const primeira = await refineDocument(doc);
    const segunda = await refineDocument(doc);

    expect(segunda.antes).toEqual(primeira.depois);
    expect(segunda.depois).toEqual(primeira.depois);
  });

  it('avisa sobre o que não conserta sozinho', async () => {
    const doc = modeloComUmMaterialPorPeca(6);
    for (const material of doc.getRoot().listMaterials()) material.setDoubleSided(true);

    const { avisos } = await refineDocument(doc);

    expect(avisos.some((a: string) => a.includes('doubleSided'))).toBe(true);
    expect(avisos.some((a: string) => a.includes('materiais'))).toBe(true);
  });

  it('--simplify reduz triângulos de malha densa e mantém nós e materiais (SPEC-0670)', async () => {
    // Coplanar com UV linear na posição: o colapso não muda a interpolação, então simplifica quase tudo.
    const doc = planoSubdividido((x, z) => [x * 4, z * 4]);

    const r = await refineDocument(doc, { simplifyError: 0.005 });

    expect(r.antes.triangles).toBe(GRID * GRID * 2);
    expect(r.depois.triangles).toBeLessThan(r.antes.triangles / 10);
    expect(doc.getRoot().listNodes().map((n) => n.getName())).toEqual(['peca-trim']);
    expect(doc.getRoot().listMaterials().map((m) => m.getName())).toEqual(['MI_Trim']);
  });

  it('--simplify mantém a crista da UV espelhada do asfalto — sem ela a textura estica (SPEC-0670)', async () => {
    // Como o asfalto do Street_2Lane do city_kit: plano, com v indo 0 -> 1 -> 0 ao longo da pista. Só com a
    // posição no erro, a fileira do meio (v = 1) sumia e a metade da pista ficava com v constante.
    const doc = planoSubdividido((x, z) => [x, 1 - Math.abs(2 * z - 1)]);

    await refineDocument(doc, { simplifyError: 0.005 });

    expect(uvNoPonto(doc, 0.5, 0.5)[1]).toBeCloseTo(1, 3);
  });

  it('--simplify sem valor válido é recusado, não cai na paleta (SPEC-0670)', () => {
    expect(parseSimplifyError(['kit.glb'])).toBe(0);
    expect(parseSimplifyError(['kit.glb', '--simplify', '0.005'])).toBe(0.005);
    expect(parseSimplifyError(['kit.glb', '--simplify', '--in-place'])).toBeNaN();
    expect(parseSimplifyError(['kit.glb', '--simplify'])).toBeNaN();
    expect(parseSimplifyError(['kit.glb', '--simplify', '0'])).toBeNaN();
    expect(parseSimplifyError(['kit.glb', '--simplify', '-1'])).toBeNaN();
  });
});

const GRID = 40;

/** Plano GRIDxGRID subdividido em y=0, com a UV de cada vértice dada por `uv(x, z)` (x e z em 0..1). */
function planoSubdividido(uv: (x: number, z: number) => [number, number]) {
  const doc = new Document();
  const pos: number[] = [];
  const tex: number[] = [];
  for (let z = 0; z <= GRID; z++) {
    for (let x = 0; x <= GRID; x++) {
      pos.push(x / GRID, 0, z / GRID);
      tex.push(...uv(x / GRID, z / GRID));
    }
  }
  const idx: number[] = [];
  for (let z = 0; z < GRID; z++) {
    for (let x = 0; x < GRID; x++) {
      const a = z * (GRID + 1) + x;
      idx.push(a, a + GRID + 1, a + 1, a + 1, a + GRID + 1, a + GRID + 2);
    }
  }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(tex)))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)))
    .setMaterial(doc.createMaterial('MI_Trim'));
  doc.createScene().addChild(doc.createNode('peca-trim').setMesh(doc.createMesh('trim').addPrimitive(prim)));
  return doc;
}

/** UV interpolada no ponto (x, z) do plano y=0 — o que a textura mostra ali depois da simplificação. */
function uvNoPonto(doc: Document, x: number, z: number): number[] {
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const pos = prim.getAttribute('POSITION')!;
  const uv = prim.getAttribute('TEXCOORD_0')!;
  const idx = prim.getIndices()!.getArray()!;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => pos.getElement(i, [0, 0, 0]));
    const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    const l0 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
    const l1 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det;
    const l = [l0, l1, 1 - l0 - l1];
    if (Math.min(...l) < -1e-6) continue;
    const uvs = [idx[t], idx[t + 1], idx[t + 2]].map((i) => uv.getElement(i, [0, 0]));
    return [0, 1].map((k) => l[0] * uvs[0][k] + l[1] * uvs[1][k] + l[2] * uvs[2][k]);
  }
  throw new Error(`ponto (${x}, ${z}) fora da malha`);
}
