// Triângulos por peça (nó com malha) de um .glb, da mais pesada para a mais leve: o passo de medir do orçamento
// de kit (SPEC-0669, regra 6 do AGENTS.md do template). Uso: node native/scripts/kit-tris.mjs <kit.glb> [N=20]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [file, nArg] = process.argv.slice(2);
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
const rows = doc.getRoot().listNodes().filter((n) => n.getMesh()).map((n) => {
  const prims = n.getMesh().listPrimitives();
  const tris = prims.reduce((t, p) => t + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
  return { name: n.getName(), tris, mats: prims.map((p) => p.getMaterial()?.getName()).join(',') };
}).sort((a, b) => b.tris - a.tris);
const DEFAULT_ROWS = 20;
for (const r of rows.slice(0, Number(nArg ?? DEFAULT_ROWS))) console.log(`${String(r.tris).padStart(7)}  ${r.name}  [${r.mats}]`);
