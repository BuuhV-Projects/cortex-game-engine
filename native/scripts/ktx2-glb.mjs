// Converte as texturas EMBUTIDAS de um .glb pra KTX2/Basis (KHR_texture_basisu)
// — ferramenta de BUILD (M2 Fase 3, ADR-0108). É onde está o grosso do peso do
// pak (teste4: ~64 MB de GLB). Usa o gltf-transform (parse/write + extensão) +
// o encoder WASM (encode-ktx2.mjs). Roda no Node, sem instalar nada externo.
//
// Uso: node native/scripts/ktx2-glb.mjs <in.glb> <out.glb>
//   cor (baseColor/emissive) → ETC1S sRGB · normal/dados → UASTC linear.
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
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  let n = 0;
  for (const texture of doc.getRoot().listTextures()) {
    if (texture.getMimeType() === 'image/ktx2') continue; // já convertida
    const image = texture.getImage();
    if (!image) continue;
    const isLinear = linear.has(texture);
    const ktx2 = await encodeKtx2(image, { uastc: isLinear, srgb: !isLinear });
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
