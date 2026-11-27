// Converte as texturas EMBUTIDAS de um .glb pra KTX2/Basis (KHR_texture_basisu)
// — ferramenta de BUILD (M2 Fase 3, ADR-0108). É onde está o grosso do peso do
// pak (teste4: ~64 MB de GLB). Usa o gltf-transform (parse/write + extensão) +
// o encoder basis (encode-ktx2.mjs: WASM, e o basisu nativo acima do teto dele).
//
// Uso: node native/scripts/ktx2-glb.mjs <in.glb> <out.glb>
//   cor (baseColor/emissive) → UASTC sRGB + RDO + Zstd · normal/dados → UASTC
//   linear sem RDO (ADR-0119 — ETC1S bandava os atlas de gradiente dos kits).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { encodeKtx2, ERR_BASIS_ENCODER_MISSING, ERR_NATIVE_ENCODER_MISSING } from './encode-ktx2.mjs';

/** Piso da conversão: abaixo de 64×64 texels o KTX2 não compensa (SPEC-0750). */
const MIN_CONVERT_TEXELS = 64 * 64;
/** Piso por bytes da fonte, só quando a textura não tem dimensões legíveis. */
const MIN_CONVERT_SOURCE_BYTES = 16 * 1024;
/** Motivo agrupado de uma textura mantida sem o `code` do erro (SPEC-0750). */
const REASON_OTHER = 'outro';
/** Conta uma textura mantida em `stats.texKept` e no mapa de motivos. */
function countKept(stats, reason) {
  if (!stats) return;
  stats.texKept = (stats.texKept ?? 0) + 1;
  stats.texKeptReasons ??= {};
  stats.texKeptReasons[reason] = (stats.texKeptReasons[reason] ?? 0) + 1;
}

/** Avisa UMA vez por processo que o encoder não está instalado (SPEC-0177). */
let encoderMissingWarned = false;
/**
 * O basisu nativo ausente também é problema de instalação: avisa UMA vez por
 * processo (um GLB pode ter várias texturas de 4096²) e o resumo do cook conta
 * cada textura mantida em `texKeptReasons`.
 */
let nativeMissingWarned = false;

/** Volta os avisos únicos ao estado inicial (só para teste). */
export function resetKtx2GlbWarnings() {
  encoderMissingWarned = false;
  nativeMissingWarned = false;
}

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

/**
 * Converte as texturas do doc pra KTX2 (in-place). Devolve nº convertidas.
 * `onTexture(i, n)` (opcional) é chamado ANTES do encode da i-ésima (1-based) —
 * pro modal do export mostrar a textura em curso (SPEC-0699).
 * `opts.label` (o GLB) entra no aviso de cada textura que não converteu, e
 * `opts.stats` (opcional) acumula `texKept` e `texKeptReasons` (SPEC-0750: a
 * falha não é mais silenciosa; o cook nunca reduz textura — a que não converte
 * nas dimensões originais fica com o original).
 */
export async function convertGlbTextures(doc, onTexture, { label = 'glb', stats } = {}) {
  const linear = classifyLinear(doc);
  const pending = doc
    .getRoot()
    .listTextures()
    .filter((t) => t.getMimeType() !== 'image/ktx2' && t.getImage());
  let n = 0;
  let created = false;
  for (const [i, texture] of pending.entries()) {
    await onTexture?.(i + 1, pending.length);
    const src = texture.getImage();
    const [w, h] = texture.getSize() ?? [0, 0];
    // SEMPRE converte acima do piso — o que importa é VRAM, não disco
    // (SPEC-0155): PNG/JPG decodifica pra RGBA cheio na GPU (4 MB + mips num
    // 1024²) enquanto KTX2→BC7 fica comprimido (1 MB), mesmo quando o .ktx2
    // sai MAIOR em disco. O piso poupa só as minúsculas, onde o overhead de
    // header/mips não paga o ganho. Ele é por TEXELS (SPEC-0750): o tamanho do
    // arquivo não mede a VRAM (um JPG de 256² tem ~11 KB). Sem dimensões
    // legíveis, cai no piso antigo por bytes. Checado antes do encode.
    const texels = w * h;
    if (texels > 0 ? texels < MIN_CONVERT_TEXELS : src.length < MIN_CONVERT_SOURCE_BYTES) continue;
    const isLinear = linear.has(texture);
    let ktx2;
    try {
      // Tudo UASTC+Zstd; RDO só na COR (em normal map o RDO distorce vetores).
      ktx2 = await encodeKtx2(src, { uastc: true, srgb: !isLinear, rdoScalar: isLinear ? 0 : 1.0 });
    } catch (err) {
      // Encoder ausente é problema de INSTALAÇÃO, não desta textura: avisa uma
      // vez e desiste do GLB inteiro — sem isso o export terminava "ok" e sem
      // nenhum KTX2, e ainda pagava a falha por textura (SPEC-0177).
      if (err?.code === ERR_BASIS_ENCODER_MISSING) {
        if (!encoderMissingWarned) {
          encoderMissingWarned = true;
          console.warn('[ktx2-glb] encoder basis ausente — texturas seguem PNG (rode native/scripts/fetch-basis-encoder.mjs)');
        }
        return n;
      }
      // Esta textura falhou (formato incomum, JPG CMYK, fora dos blocos 4×4, basisu
      // nativo ausente pra fonte acima do teto do WASM…): avisa e mantém o original.
      const reason = err?.code ?? REASON_OTHER;
      const repeated = reason === ERR_NATIVE_ENCODER_MISSING && nativeMissingWarned;
      if (reason === ERR_NATIVE_ENCODER_MISSING) nativeMissingWarned = true;
      if (!repeated) {
        console.warn(
          `[ktx2-glb] ${label} textura #${i} (${w}×${h}, ${texture.getMimeType()}): ${err?.message ?? err} — mantém o original`,
        );
      }
      countKept(stats, reason);
      continue;
    }
    if (!ktx2) continue;
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
  const stats = {};
  const n = await convertGlbTextures(doc, undefined, { label: input, stats });
  await io.write(output, doc);
  const before = readFileSync(input).length;
  const after = readFileSync(output).length;
  const pct = ((1 - after / before) * 100).toFixed(0);
  const kept = stats.texKept ? ` · ${stats.texKept} mantida(s) ${JSON.stringify(stats.texKeptReasons)}` : '';
  console.log(`[ktx2-glb] ${input}: ${n} textura(s)${kept} · ${before} → ${after} bytes  −${pct}%`);
}
