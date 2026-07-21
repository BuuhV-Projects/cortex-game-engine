// prepare-assets.mjs — gera os .glb dos prédios do bench a partir do pack-fonte
// "City Bench Test" (export glTF/Godot). Os .glb são pesados (~40 MB cada, PBR
// com normal maps) e NÃO vão pro git (ver .gitignore) — rode isto uma vez antes
// do primeiro `bench.mjs`.
//
// Uso: node examples/bench-city/prepare-assets.mjs [<dir do export glTF>]
//   default: D:/jogos/assets/3d-models/City Bench Test/Exports/glTF (Godot)

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] || 'D:/jogos/assets/3d-models/City Bench Test/Exports/glTF (Godot)';
const outDir = path.join(here, 'assets', 'models');

// Batem com BENCH_BUILDINGS em generate.ts.
const BUILDINGS = ['Building_Large_2', 'Building_Medium_2_001', 'Building_Small_1'];

if (!fs.existsSync(src)) {
  console.error(`[prepare] pack-fonte não encontrado: ${src}\n` + `passe o caminho do export glTF como argumento.`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// Decimação: os modelos-fonte têm ~18-45k tris (alto pra streaming — fundir
// centenas deles na VM JS é o gargalo de load). `simplify` (meshopt) reduz pra
// ~`SIMPLIFY_RATIO` dos tris, mantendo a silhueta. Ajuste/desligue via env.
const SIMPLIFY_RATIO = Number(process.env.SIMPLIFY_RATIO ?? 0.25);
await MeshoptSimplifier.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const b of BUILDINGS) {
  const gltf = path.join(src, b + '.gltf');
  if (!fs.existsSync(gltf)) {
    console.error(`[prepare] faltando: ${gltf}`);
    process.exit(1);
  }
  const doc = await io.read(gltf);
  if (SIMPLIFY_RATIO < 1) {
    await doc.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: 0.01 }),
    );
  }
  await io.write(path.join(outDir, b + '.glb'), doc);
  console.log(`[prepare] ${b}.glb ok (ratio ${SIMPLIFY_RATIO})`);
}
console.log(`[prepare] pronto → ${path.relative(here, outDir)}`);
