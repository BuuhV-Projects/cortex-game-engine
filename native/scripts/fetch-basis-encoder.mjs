// Baixa o basis_universal ENCODER (WASM) pra native/tools/basis-encoder/ —
// ferramenta de BUILD usada pelo encode-ktx2.mjs (PNG→KTX2, ADR-0108/0119).
// NÃO vai pro runtime; roda no Node. Multiplataforma de propósito: é chamado
// tanto pelo fetch-deps.ps1 (dev Windows) quanto pelo job de testes do CI
// (ubuntu), que precisa do encoder pros testes de política de encode
// (tests/native/encode-ktx2.test.ts, TDR-0004).
//
// Versão pinada pela MESMA tag do transcoder (fetch-deps.ps1); URLs usam o SHA
// da tag (tag pode ser movida pelo mantenedor; SHA não).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASISU_TAG = 'v2_1_0r'; // documentação
const BASISU_COMMIT = 'e4f439fc9545b6a9e1fd26fc7ffd0c682c4b96d4'; // SHA da tag
const ENCODER_FILES = ['basis_encoder.js', 'basis_encoder.wasm'];
const RAW_BASE = `https://raw.githubusercontent.com/BinomialLLC/basis_universal/${BASISU_COMMIT}/webgl/encoder/build`;

const encDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'basis-encoder');

if (ENCODER_FILES.every((f) => existsSync(path.join(encDir, f)))) {
  console.log(`[basis-encoder] já baixado (${BASISU_TAG}) em ${encDir}`);
} else {
  console.log(`[basis-encoder] baixando ${BASISU_TAG} ...`);
  mkdirSync(encDir, { recursive: true });
  for (const f of ENCODER_FILES) {
    const res = await fetch(`${RAW_BASE}/${f}`);
    if (!res.ok) throw new Error(`download falhou (${res.status}): ${RAW_BASE}/${f}`);
    writeFileSync(path.join(encDir, f), new Uint8Array(await res.arrayBuffer()));
  }
  console.log(`[basis-encoder] pronto em ${encDir}`);
}
