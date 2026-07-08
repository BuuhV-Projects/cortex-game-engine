// "Cook" dos assets pro export (ADR-0108): copia a pasta `assets/` FONTE pra uma
// cópia e converte as texturas embutidas em GLB pra KTX2 (KHR_texture_basisu). A
// FONTE fica intocada (PNG) — só o pak leva KTX2. Cache por hash do arquivo:
// re-export só reconverte o GLB que mudou.
//
// Standalone PNG/JPG são copiados como estão por ora (a referência é por URL; o
// grosso do peso está nos GLB). Converter soltas viria com detecção por conteúdo.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { convertGlbTextures } from './ktx2-glb.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

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
 * `onProgress(done, total)` é chamado por arquivo processado (pro modal do export).
 */
export async function cookAssets(assetsDir, cookedDir, cacheDir, onProgress) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const stats = { glbConverted: 0, glbCached: 0, glbNoTex: 0, copied: 0, before: 0, after: 0 };

  const all = walk(assetsDir);
  const total = all.length;
  let done = 0;
  for (const full of all) {
    const rel = path.relative(assetsDir, full);
    const out = path.join(cookedDir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    stats.before += fs.statSync(full).size;

    if (!full.toLowerCase().endsWith('.glb')) {
      fs.copyFileSync(full, out);
      stats.copied++;
      stats.after += fs.statSync(out).size;
      onProgress?.(++done, total);
      continue;
    }

    const bytes = fs.readFileSync(full);
    const cached = path.join(cacheDir, createHash('sha1').update(bytes).digest('hex') + '.glb');
    if (fs.existsSync(cached)) {
      fs.copyFileSync(cached, out);
      stats.glbCached++;
    } else {
      try {
        const doc = await io.read(full); // por caminho (readBinary rejeita alguns GLB)
        const n = await convertGlbTextures(doc);
        if (n > 0) {
          await io.write(out, doc);
          stats.glbConverted++;
        } else {
          fs.copyFileSync(full, out); // GLB só-geometria
          stats.glbNoTex++;
        }
        fs.copyFileSync(out, cached); // cacheia o resultado (convertido ou não)
      } catch (e) {
        console.warn(`[cook] ${rel}: falhou (${e.message}) — copiando original`);
        fs.copyFileSync(full, out);
      }
    }
    stats.after += fs.statSync(out).size;
    onProgress?.(++done, total);
  }
  return stats;
}
