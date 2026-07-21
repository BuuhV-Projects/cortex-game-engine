// bake-city.mjs — PRÉ-FUNDE a cidade OFFLINE (M-perf-4). Em vez de o runtime
// montar+fundir 288 prédios (lento no Hermes), aqui (Node) particionamos a cidade
// em células e fundimos a geometria de cada célula POR MATERIAL, transformando os
// vértices pela world matrix da instância. Saída: UM `city.glb` com um nó
// `cell-<key>` por célula (geometria já fundida) + texturas COMPARTILHADAS (1×) +
// um `city-cells.json` (chaves + centros). O runtime só CARREGA e streama.
//
// Uso: node examples/bench-city/bake-city.mjs   (precisa dos .glb em assets/models
// — rode prepare-assets.mjs antes).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune } from '@gltf-transform/functions';
import { Matrix4, Matrix3, Vector3, Quaternion, Euler } from 'three';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(here, 'assets', 'models');
const OUT_GLB = path.join(here, 'assets', 'city.glb');
const OUT_MANIFEST = path.join(here, 'assets', 'city-cells.json');
const CELL_SIZE = 90; // DEVE bater com main.ts
// NOTA: sem LOD de geometria. Os modelos-fonte JÁ são low-poly (pré-decimados a
// 25% no prepare-assets), então decimar de novo (meshopt) abre BURACOS (paredes
// somem → vê o interior) e triângulos esticados (mesh atravessando). Perf de longe
// = frustum culling + streaming + render bundles (poucas draw calls). LOD de longe
// pra esses assets seria impostor/billboard, não geometria decimada — fica p/ depois.

// ── 1) Placement: roda o MESMO generateCityScene do runtime (bundlado) ────────
async function loadGenerator() {
  const tmp = path.join(os.tmpdir(), `bench-generate-${process.pid}.mjs`);
  await build({ entryPoints: [path.join(here, 'generate.ts')], outfile: tmp, format: 'esm', bundle: true, logLevel: 'silent' });
  const mod = await import(pathToFileURL(tmp).href);
  fs.rmSync(tmp, { force: true });
  return mod;
}

// ── merge de geometria por (célula, material) ────────────────────────────────
const _v = new Vector3();
function transformAttr(arr, itemSize, matrix, normalMatrix) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i += itemSize) {
    _v.set(arr[i], arr[i + 1], arr[i + 2]);
    if (normalMatrix) _v.applyNormalMatrix(normalMatrix);
    else _v.applyMatrix4(matrix);
    out[i] = _v.x; out[i + 1] = _v.y; out[i + 2] = _v.z;
    for (let k = 3; k < itemSize; k++) out[i + k] = arr[i + k]; // extras (ex.: COLOR a) inalterados
  }
  return out;
}

async function main() {
  const { generateCityScene, DEFAULT_BENCH_CITY } = await loadGenerator();
  const scene = generateCityScene(DEFAULT_BENCH_CITY);
  const buildings = scene.nodes.filter((n) => n.type === 'model');
  console.log(`[bake] ${buildings.length} prédios; célula ${CELL_SIZE}m`);

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  // Doc de saída; traz cada modelo pra dentro (materiais/texturas compartilhados).
  const out = new (await import('@gltf-transform/core')).Document();
  const outScene = out.createScene('city');
  const buffer = out.createBuffer();

  // url → { prims: [{semantics:{name:{array,itemSize}}, index, material}] }
  const modelPrims = new Map();
  const urls = [...new Set(buildings.map((b) => b.url))];
  for (const url of urls) {
    const file = path.join(MODELS_DIR, path.basename(url));
    const src = await io.read(file);
    const map = mergeDocuments(out, src); // copia materiais/texturas/etc pro out
    const prims = [];
    for (const mesh of src.getRoot().listMeshes()) {
      for (const p of mesh.listPrimitives()) {
        const attrs = {};
        for (const sem of p.listSemantics()) {
          // Só o essencial pra render texturizado: posição, normal, UV0. COLOR_0
          // (vertex color) e TEXCOORD_1 ficam de FORA — o vertex-color liga um
          // caminho do MeshStandardNodeMaterial que o naga (host) miscompila →
          // prédio BRANCO (o Dawn/browser tolera). Ver [[native-fps-cpu-bound-render]].
          if (sem !== 'POSITION' && sem !== 'NORMAL' && sem !== 'TEXCOORD_0') continue;
          const acc = p.getAttribute(sem);
          attrs[sem] = { array: acc.getArray(), itemSize: acc.getElementSize() };
        }
        const vcount = attrs['POSITION'].array.length / 3;
        const raw = p.getIndices()?.getArray();
        const fullIndex = raw ? new Uint32Array(raw) : Uint32Array.from({ length: vcount }, (_, i) => i);
        prims.push({ attrs, index: fullIndex, material: map.get(p.getMaterial()) });
      }
    }
    modelPrims.set(url, prims);
  }

  // Acumula por (célula, material). key da célula = "cx,cz".
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const nm = new Matrix3();
  // cellKey -> materialObj -> [ { attrs:{sem:number[]}, index:number[], vbase, semSizes } ]
  // LISTA de grupos por material: cada grupo é capado em ≤65535 vértices pra o
  // índice caber em Uint16. Índice Uint32 (>65535) rende ERRADO no host (triângulos
  // esticados/espeto no céu — mesmo com o dado 100% limpo); Uint16 é o que os
  // modelos individuais usam e funciona. Ver [[native-vertex-color-naga-branco]] (mesma caça).
  const V16_MAX = 65535;
  const cells = new Map();
  const centers = new Map(); // cellKey -> {sx,sz,n}

  for (const b of buildings) {
    const [x, y, z] = b.transform.position;
    const rotY = b.transform.rotation?.[1] ?? 0;
    m.compose(_v.set(x, y, z), q.setFromEuler(e.set(0, rotY, 0)), { x: 1, y: 1, z: 1 });
    nm.getNormalMatrix(m);
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    const key = `${cx},${cz}`;
    if (!cells.has(key)) cells.set(key, new Map());
    if (!centers.has(key)) centers.set(key, { sx: 0, sz: 0, n: 0 });
    const c = centers.get(key); c.sx += x; c.sz += z; c.n++;
    const byMat = cells.get(key);

    for (const prim of modelPrims.get(b.url)) {
      let groups = byMat.get(prim.material);
      if (!groups) { groups = []; byMat.set(prim.material, groups); }
      const vcount = prim.attrs['POSITION'].array.length / 3;
      // Grupo atual; começa um novo se este prédio estourar o limite de 16 bits.
      let g = groups[groups.length - 1];
      if (!g || g.vbase + vcount > V16_MAX) {
        g = { attrs: {}, index: [], vbase: 0, semSizes: {} };
        groups.push(g);
      }
      for (const [sem, { array, itemSize }] of Object.entries(prim.attrs)) {
        if (!g.attrs[sem]) { g.attrs[sem] = []; g.semSizes[sem] = itemSize; }
        const isPos = sem === 'POSITION';
        const isNrm = sem === 'NORMAL';
        const t = (isPos || isNrm) ? transformAttr(array, itemSize, m, isNrm ? nm : null) : array;
        const dst = g.attrs[sem];
        for (let i = 0; i < t.length; i++) dst.push(t[i]);
      }
      for (let i = 0; i < prim.index.length; i++) g.index.push(prim.index[i] + g.vbase);
      g.vbase += vcount;
    }
  }

  // Constrói um nó `cell-<key>` por célula com a geometria fundida (por material).
  const manifest = [];
  let triFull = 0;
  for (const [key, byMat] of cells) {
    const cellNode = out.createNode(`cell-${key}`);
    for (const [material, groups] of byMat) {
      for (const g of groups) {
        // g.vbase ≤ 65535 sempre (capado na acumulação) → índice Uint16.
        const prim = out.createPrimitive().setMaterial(material);
        for (const [sem, arr] of Object.entries(g.attrs)) {
          prim.setAttribute(sem, out.createAccessor().setType(gltfType(g.semSizes[sem])).setArray(new Float32Array(arr)).setBuffer(buffer));
        }
        prim.setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint16Array(g.index)).setBuffer(buffer));
        cellNode.addChild(out.createNode('').setMesh(out.createMesh().addPrimitive(prim)));
        triFull += g.index.length / 3;
      }
    }
    outScene.addChild(cellNode);
    const c = centers.get(key);
    manifest.push({ key, x: c.sx / c.n, z: c.sz / c.n });
  }
  console.log(`[bake] triângulos: ${triFull | 0}`);

  // Simplifica os materiais: mantém só o BASE COLOR (fosco), tira normal/ORM.
  // NÃO é obrigatório pra render (o branco era o COLOR_0 — ver acima); é ESCOLHA
  // de perf/tamanho: pra cidade vista de longe, base color fosco basta, corta
  // ~10 texturas e sobe o fps (metal sem envMap ainda reflete o céu claro).
  // Defina CITY_KEEP_PBR=1 pra manter os normal/ORM maps. Ver [[native-fps-cpu-bound-render]].
  if (process.env.CITY_KEEP_PBR !== '1') {
    let n = 0;
    for (const m of out.getRoot().listMaterials()) {
      m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
      m.setMetallicFactor(0).setRoughnessFactor(1);
      n++;
    }
    console.log(`[bake] materiais simplificados p/ base color fosco: ${n}`);
  }

  await out.transform(dedup(), prune());
  // GLB exige 1 buffer: junta todos os acessores no `buffer` e descarta os outros
  // (os dos modelos-fonte, já sem acessores após o prune).
  for (const acc of out.getRoot().listAccessors()) acc.setBuffer(buffer);
  for (const b of out.getRoot().listBuffers()) if (b !== buffer) b.dispose();
  await io.write(OUT_GLB, out);
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify({ cellSize: CELL_SIZE, cells: manifest }, null, 0));
  const mb = (fs.statSync(OUT_GLB).size / (1024 * 1024)).toFixed(1);
  console.log(`[bake] ${cells.size} células → ${path.relative(here, OUT_GLB)} (${mb} MB) + manifesto`);
}

function gltfType(itemSize) {
  return itemSize === 2 ? 'VEC2' : itemSize === 4 ? 'VEC4' : 'VEC3';
}

main().catch((e) => { console.error('[bake] FALHOU:', e); process.exit(1); });
