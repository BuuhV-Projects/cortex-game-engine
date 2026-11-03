// Triângulos por peça (nó com malha) de um .glb, da mais pesada para a mais leve: o passo de medir do orçamento
// de kit (SPEC-0669, regra 6 do AGENTS.md do template). Uso: node native/scripts/kit-tris.mjs <kit.glb> [N=20]
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { pathToFileURL } from 'node:url';

const DEFAULT_ROWS = 20;
/** Vértices que abrem uma faixa/leque antes do primeiro triângulo. */
const STRIP_START = 2;
const TRIANGLE_VERTICES = 3;

/** Triângulos de uma primitiva pelo modo dela; pontos e linhas não contam. */
export function trianglesOf(primitive) {
  const count = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
  switch (primitive.getMode()) {
    case Primitive.Mode.TRIANGLES: return Math.floor(count / TRIANGLE_VERTICES);
    case Primitive.Mode.TRIANGLE_STRIP:
    case Primitive.Mode.TRIANGLE_FAN: return Math.max(0, count - STRIP_START);
    default: return 0;
  }
}

async function main() {
  const [file, nArg] = process.argv.slice(2);
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
  const rows = doc.getRoot().listNodes().filter((n) => n.getMesh()).map((n) => {
    const prims = n.getMesh().listPrimitives();
    const tris = prims.reduce((t, p) => t + trianglesOf(p), 0);
    return { name: n.getName(), tris, mats: prims.map((p) => p.getMaterial()?.getName()).join(',') };
  }).sort((a, b) => b.tris - a.tris);
  for (const r of rows.slice(0, Number(nArg ?? DEFAULT_ROWS))) console.log(`${String(r.tris).padStart(7)}  ${r.name}  [${r.mats}]`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
