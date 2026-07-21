// bake-city.mjs — PRÉ-FUNDE a cidade OFFLINE (M-perf-4). Em vez de o runtime
// montar+fundir 288 prédios (lento no Hermes), aqui (Node) particionamos a cidade
// em células e fundimos a geometria de cada célula POR MATERIAL, transformando os
// vértices pela world matrix da instância. Saída: UM `city.glb` com um nó
// `cell-<key>` por célula (geometria já fundida) + texturas COMPARTILHADAS (1×) +
// um `city-cells.json` (chaves + centros). O runtime só CARREGA e streama.
//
// Uso: node examples/bench-city/bake-city.mjs   (precisa dos .glb em assets/models
// — rode prepare-assets.mjs antes).
import { NodeIO, VertexLayout, Document, PropertyType } from '@gltf-transform/core';
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
const OUT_MATS = path.join(here, 'assets', 'city-mats.glb'); // materiais+texturas, 1×
const CELLS_DIR = path.join(here, 'assets', 'cells'); // 1 .glb (geometria) por célula
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

  // SEPARATE: grava atributos NÃO-interleaved (default do gltf-transform é
  // INTERLEAVED). O host nativo renderiza errado buffer interleaved (espeto de
  // mesh — SPEC-0140); gravar separado evita o de-interleave em runtime (~5s).
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setVertexLayout(VertexLayout.SEPARATE);

  // Doc dos MATERIAIS (city-mats.glb); traz cada modelo pra dentro (materiais/
  // texturas compartilhados). A geometria das células vai em docs separados.
  const out = new Document();
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

  // ── Materiais foscos (só base color) — perf/tamanho; CITY_KEEP_PBR=1 mantém PBR ──
  if (process.env.CITY_KEEP_PBR !== '1') {
    let n = 0;
    for (const m of out.getRoot().listMaterials()) {
      m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
      m.setMetallicFactor(0).setRoughnessFactor(1);
      n++;
    }
    console.log(`[bake] materiais foscos: ${n}`);
  }

  // ── city-mats.glb: SÓ os materiais + texturas (1 triângulo-stub por material pra
  //    o prune manter). Carregado 1× no runtime; as células referenciam por NOME. ──
  const matsScene = out.createScene('mats');
  for (const mat of out.getRoot().listMaterials()) {
    const pos = out.createAccessor().setType('VEC3').setArray(new Float32Array(9)).setBuffer(buffer);
    const uv = out.createAccessor().setType('VEC2').setArray(new Float32Array(6)).setBuffer(buffer);
    const prim = out.createPrimitive().setMaterial(mat).setAttribute('POSITION', pos).setAttribute('TEXCOORD_0', uv);
    matsScene.addChild(out.createNode('').setMesh(out.createMesh().addPrimitive(prim)));
  }
  out.getRoot().setDefaultScene(matsScene);
  // dedup SEM MATERIAL: dedupa texturas (9, não 27) + acessores/meshes stub, mas
  // NÃO mescla materiais — senão dois materiais que viram idênticos após o matte
  // (ex.: MI_Trim/MI_Trim_Dark) colapsam num só NOME, e as células (que referenciam
  // o material por nome) perdem o match → parede cinza. Ver SPEC-0140.
  await out.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), prune());
  for (const acc of out.getRoot().listAccessors()) acc.setBuffer(buffer);
  for (const b of out.getRoot().listBuffers()) if (b !== buffer) b.dispose();
  await io.write(OUT_MATS, out);
  const matNames = out.getRoot().listMaterials().map((mm) => mm.getName());
  console.log(`[bake] city-mats.glb: ${matNames.length} materiais (${(fs.statSync(OUT_MATS).size / 1e6).toFixed(1)} MB)`);

  // ── cells/cell-<key>.glb: geometria PURA por célula, material STUB por nome
  //    (sem textura → o cook só copia; runtime reatribui do city-mats por nome). ──
  fs.rmSync(CELLS_DIR, { recursive: true, force: true });
  fs.mkdirSync(CELLS_DIR, { recursive: true });
  const manifest = [];
  let triFull = 0;
  for (const [key, byMat] of cells) {
    const cd = new Document();
    const cbuf = cd.createBuffer();
    const cnode = cd.createNode(`cell-${key}`);
    for (const [material, groups] of byMat) {
      const stub = cd.createMaterial().setName(material.getName()); // runtime mapeia por nome
      for (const g of groups) {
        const prim = cd.createPrimitive().setMaterial(stub);
        for (const [sem, arr] of Object.entries(g.attrs)) {
          prim.setAttribute(sem, cd.createAccessor().setType(gltfType(g.semSizes[sem])).setArray(new Float32Array(arr)).setBuffer(cbuf));
        }
        prim.setIndices(cd.createAccessor().setType('SCALAR').setArray(new Uint16Array(g.index)).setBuffer(cbuf));
        cnode.addChild(cd.createNode('').setMesh(cd.createMesh().addPrimitive(prim)));
        triFull += g.index.length / 3;
      }
    }
    cd.createScene(key).addChild(cnode);
    await io.write(path.join(CELLS_DIR, `cell-${key}.glb`), cd);
    const c = centers.get(key);
    manifest.push({ key, x: c.sx / c.n, z: c.sz / c.n });
  }
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify({ cellSize: CELL_SIZE, cells: manifest }, null, 0));
  const cellsMb = fs.readdirSync(CELLS_DIR).reduce((s, f) => s + fs.statSync(path.join(CELLS_DIR, f)).size, 0) / 1e6;
  console.log(`[bake] ${cells.size} células → cells/*.glb (${cellsMb.toFixed(1)} MB, ${triFull | 0} tris) + manifesto`);
}

function gltfType(itemSize) {
  return itemSize === 2 ? 'VEC2' : itemSize === 4 ? 'VEC4' : 'VEC3';
}

main().catch((e) => { console.error('[bake] FALHOU:', e); process.exit(1); });
