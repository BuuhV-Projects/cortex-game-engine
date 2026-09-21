import { describe, it, expect } from 'vitest';
import { Document } from '@gltf-transform/core';
// @ts-expect-error — script .mjs sem tipos; é ferramenta de asset, não API do engine.
import { refineDocument } from '../../native/scripts/refine-asset.mjs';

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
});
