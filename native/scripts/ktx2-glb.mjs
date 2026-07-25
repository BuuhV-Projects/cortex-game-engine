// Converte as texturas EMBUTIDAS de um .glb pra KTX2/Basis (KHR_texture_basisu)
// — ferramenta de BUILD (M2 Fase 3, ADR-0108). É onde está o grosso do peso do
// pak (teste4: ~64 MB de GLB). Usa o gltf-transform (parse/write + extensão) +
// o encoder WASM (encode-ktx2.mjs). Roda no Node, sem instalar nada externo.
//
// Uso: node native/scripts/ktx2-glb.mjs <in.glb> <out.glb>
//   cor (baseColor/emissive) → UASTC sRGB + RDO + Zstd · normal/dados → UASTC
//   linear sem RDO (ADR-0119 — ETC1S bandava os atlas de gradiente dos kits).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { encodeKtx2 } from './encode-ktx2.mjs';

/** Marca quais texturas são LINEARES (normal/MR/occlusion) — o resto é cor (sRGB). */
function classifyLinear(doc) {
  const linear = new Set();
  for (const mat of doc.getRoot().listMaterials()) {
    for (const t of [mat.getNormalTexture(), mat.getMetallicRoughnessTexture(), mat.getOcclusionTexture()]) {
      if (t) linear.add(t);
    }
  }
  return linear;
}

/** Converte as texturas do doc pra KTX2 (in-place). Devolve nº convertidas. */
export async function convertGlbTextures(doc) {
  const linear = classifyLinear(doc);
  const pending = doc
    .getRoot()
    .listTextures()
    .filter((t) => t.getMimeType() !== 'image/ktx2' && t.getImage());
  let n = 0;
  let created = false;
  // Abaixo disto (PNG fonte) a conversão não compensa o overhead do KTX2.
  const MIN_CONVERT_SOURCE_BYTES = 16 * 1024;
  for (const texture of pending) {
    const src = texture.getImage();
    const isLinear = linear.has(texture);
    let ktx2;
    try {
      // Tudo UASTC+Zstd; RDO só na COR (em normal map o RDO distorce vetores).
      ktx2 = await encodeKtx2(src, { uastc: true, srgb: !isLinear, rdoScalar: isLinear ? 0 : 1.0 });
    } catch {
      continue; // encode falhou (ex.: JPG/formato incomum) → mantém o original
    }
    // SEMPRE converte acima do piso — o que importa é VRAM, não disco
    // (SPEC-0155): PNG decodifica pra RGBA cheio na GPU (4 MB + mips num
    // 1024²) enquanto KTX2→BC7 fica comprimido (1 MB), mesmo quando o .ktx2
    // sai MAIOR em disco. A regra antiga (manter o menor em disco) deixava as
    // texturas do kit fora do BC7. O piso poupa só as minúsculas, onde o
    // overhead de header/mips não paga o ganho.
    if (!ktx2 || src.length < MIN_CONVERT_SOURCE_BYTES) continue;
    if (!created) {
      doc.createExtension(KHRTextureBasisu).setRequired(true);
      created = true;
    }
    texture.setImage(ktx2).setMimeType('image/ktx2');
    n++;
  }
  return n;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('uso: node ktx2-glb.mjs <in.glb> <out.glb>');
    process.exit(1);
  }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(input);
  const n = await convertGlbTextures(doc);
  await io.write(output, doc);
  const before = readFileSync(input).length;
  const after = readFileSync(output).length;
  const pct = ((1 - after / before) * 100).toFixed(0);
  console.log(`[ktx2-glb] ${input}: ${n} textura(s) · ${before} → ${after} bytes  −${pct}%`);
}
