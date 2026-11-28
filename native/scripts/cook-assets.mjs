// "Cook" dos assets pro export (ADR-0108): copia a pasta `assets/` FONTE pra uma
// cópia e converte as texturas embutidas em GLB pra KTX2 (KHR_texture_basisu). A
// FONTE fica intocada (PNG) — só o pak leva KTX2. Cache por hash do arquivo:
// re-export só reconverte o GLB que mudou.
//
// PNG/JPG soltos (o jogo os pede por URL) são copiados como estão, menos os que
// o jogo põe na lista `cortex.json.cookTextures` (SPEC-0755, ADR-0756): esses
// ganham o `<arquivo>.ktx2` ao lado e entram no manifesto `cooked-textures.json`.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { convertGlbTextures } from './ktx2-glb.mjs';
import { ERR_NATIVE_ENCODER_FAILED, ERR_NATIVE_ENCODER_MISSING } from './encode-ktx2-native.mjs';
import { assetUrl, COOKED_TEXTURE_EXT, cookLooseTexture, looseStats, planCookTextures, writeCookedManifest } from './cook-textures.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/**
 * Versão da política de cook — entra no hash do cache. BUMP ao mudar formato/
 * qualidade do encode OU a versão do encoder WASM (v2 = UASTC+RDO+Zstd pra
 * cor, ADR-0119; v3 = encoder pinado na tag v2_1_0r do basis_universal).
 */
// v4: converte por VRAM (BC7, SPEC-0155) — a regra "só se encolher em disco"
// deixava as texturas do kit fora do KTX2/BC7.
// v5: JPG e fonte acima do limite do encoder WASM convertem (a grande pelo
// basisu nativo, sem reduzir), piso por texels (SPEC-0750) — o cache v4 tem GLB
// cozido com os JPG e os 4096² de fora.
const COOK_VERSION = 'cook-v5';

/**
 * Texturas mantidas até agora porque o basisu nativo faltou ou não rodou
 * (SPEC-0750): problema da instalação, não da textura, então o GLB não vai pro cache.
 */
const nativeMissing = (stats) =>
  (stats.texKeptReasons[ERR_NATIVE_ENCODER_MISSING] ?? 0) + (stats.texKeptReasons[ERR_NATIVE_ENCODER_FAILED] ?? 0);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Cozinha `assetsDir` → `cookedDir` (GLB com texturas KTX2; resto copiado).
 * `cacheDir` guarda GLB cozidos por hash da fonte (persiste entre exports).
 * `onProgress({ done, total, file, tex })` (pro modal do export, SPEC-0699) é
 * chamado ANTES de cada GLB, antes de cada textura (`tex = [i, n]`) e ao fim
 * (`done === total`). Cópia simples não avisa: é rápida e floodaria o stdout.
 * Depois de cada aviso o cook cede o loop, pra linha sair no pipe na hora.
 * `include(rel)` (opcional) deixa arquivos de fora — ex.: material de pacote de
 * textura que o jogo não usa (SPEC-0641 §6). Os ignorados contam em `skipped`.
 * `options.cookTextures` (a saída do `cookTexturesOf`, SPEC-0755): as imagens
 * soltas que a lista casa viram `<arquivo>.ktx2` e entram no manifesto; o
 * original sai do pak quando a entrada tem `replace` (padrão). Uma entrada que
 * não casa nada avisa. Os contadores `loose*` vão no `stats`.
 */
export async function cookAssets(assetsDir, cookedDir, cacheDir, onProgress, include, { cookTextures = [] } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  // texKept/texKeptReasons: texturas dos GLB convertidos NESTE export que
  // ficaram com o original, por motivo (SPEC-0750; o cook nunca reduz textura).
  // GLB vindo do cache não reconta.
  const stats = {
    glbConverted: 0,
    glbCached: 0,
    glbNoTex: 0,
    copied: 0,
    skipped: 0,
    before: 0,
    after: 0,
    texKept: 0,
    texKeptReasons: {},
    ...looseStats(),
  };

  const every = walk(assetsDir);
  const all = include ? every.filter((f) => include(path.relative(assetsDir, f))) : every;
  stats.skipped = every.length - all.length;
  const posixRel = (f) => path.relative(assetsDir, f).split(path.sep).join('/');
  const { byFile: looseByFile, unmatched } = planCookTextures(cookTextures, all.map(posixRel));
  for (const entry of unmatched) console.warn(`[cook] cookTextures: ${JSON.stringify(entry.files)} não casou nenhum arquivo`);
  const manifest = {};
  const total = all.length;
  let done = 0;
  const report = async (file, tex) => {
    if (!onProgress) return;
    onProgress({ done, total, file, tex });
    await new Promise((r) => setImmediate(r));
  };
  for (const full of all) {
    const rel = path.relative(assetsDir, full);
    const out = path.join(cookedDir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    stats.before += fs.statSync(full).size;

    const loose = looseByFile.get(posixRel(full));
    if (loose) {
      await report(rel);
      const ok = await cookLooseTexture(full, out, loose, { cacheDir, cookVersion: COOK_VERSION, stats, label: rel });
      if (ok) {
        const url = assetUrl(posixRel(full));
        manifest[url] = url + COOKED_TEXTURE_EXT;
        stats.after += fs.statSync(out + COOKED_TEXTURE_EXT).size;
      }
      // Fica o original quando a conversão falhou ou a entrada pede (`replace: false`).
      if (!ok || !loose.replace) {
        fs.copyFileSync(full, out);
        stats.after += fs.statSync(out).size;
      }
      done++;
      continue;
    }
    if (!full.toLowerCase().endsWith('.glb')) {
      fs.copyFileSync(full, out);
      stats.copied++;
      stats.after += fs.statSync(out).size;
      done++;
      continue;
    }
    await report(rel);

    const bytes = fs.readFileSync(full);
    // COOK_VERSION entra no hash: mudar a política de encode (ex.: ETC1S→UASTC,
    // ADR-0119) invalida o cache — senão o export re-usa GLB cozido no formato velho.
    const cached = path.join(
      cacheDir,
      createHash('sha1').update(COOK_VERSION).update(bytes).digest('hex') + '.glb',
    );
    if (fs.existsSync(cached)) {
      fs.copyFileSync(cached, out);
      stats.glbCached++;
    } else {
      try {
        const doc = await io.read(full); // por caminho (readBinary rejeita alguns GLB)
        const missingBefore = nativeMissing(stats);
        const n = await convertGlbTextures(doc, (i, count) => report(rel, [i, count]), { label: rel, stats });
        if (n > 0) {
          await io.write(out, doc);
          stats.glbConverted++;
        } else {
          fs.copyFileSync(full, out); // GLB só-geometria
          stats.glbNoTex++;
        }
        // Cacheia o resultado (convertido ou não) — menos quando faltou o basisu
        // nativo: é problema de instalação, e o próximo export com o exe tem que
        // converter a textura grande em vez de reusar o GLB com o original.
        if (nativeMissing(stats) === missingBefore) fs.copyFileSync(out, cached);
      } catch (e) {
        console.warn(`[cook] ${rel}: falhou (${e.message}) — copiando original`);
        fs.copyFileSync(full, out);
      }
    }
    stats.after += fs.statSync(out).size;
    done++;
  }
  writeCookedManifest(cookedDir, manifest);
  await report();
  return stats;
}
