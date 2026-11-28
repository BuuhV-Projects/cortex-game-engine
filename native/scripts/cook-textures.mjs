// Imagens SOLTAS (PNG/JPG que o jogo carrega por URL) cozidas para KTX2 por uma
// lista opt-in do jogo (SPEC-0755, ADR-0756): `cortex.json.cookTextures`. Só o
// que a lista casa converte; o jogo diz cor ou dado (`srgb`), a orientação
// (`flipY`) e se o original sai do pak (`replace`). Nada é reduzido: a fonte que
// não converte nas dimensões originais fica com o original e avisa.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { encodeKtx2, ERR_BASIS_ENCODER_MISSING, planEncode } from './encode-ktx2.mjs';
import { ERR_NATIVE_ENCODER_FAILED, ERR_NATIVE_ENCODER_MISSING } from './encode-ktx2-native.mjs';

/** Só imagem entra no cook de soltas: um padrão largo (`assets/x/**`) nunca tira o `.glb` do cook dele. */
const LOOSE_IMAGE = /\.(?:png|jpe?g)$/i;
/** Problemas de instalação (o encoder falta ou não roda): um aviso por processo, não um por imagem. */
const INSTALL_REASONS = new Set([ERR_BASIS_ENCODER_MISSING, ERR_NATIVE_ENCODER_MISSING, ERR_NATIVE_ENCODER_FAILED]);

/** Manifesto do pak: `{ "<url do original>": "<url do .ktx2>" }` (lido pelo `loadTexture` no host). */
export const COOKED_TEXTURES_MANIFEST = 'cooked-textures.json';
/** Extensão anexada ao nome do original (`x.png` → `x.png.ktx2`: não colide com `x.jpg`). */
export const COOKED_TEXTURE_EXT = '.ktx2';
/** Prefixo das URLs: as entradas da lista e as chaves do manifesto são relativas à pasta do jogo. */
const ASSETS_PREFIX = 'assets/';
/** Força do RDO na cor; o dado (linear) vai sem RDO, como no GLB (`ktx2-glb.mjs`). */
const COLOR_RDO_SCALAR = 1.0;
/** Motivo agrupado de uma falha sem `code`. */
const REASON_OTHER = 'outro';
/** Versão da política do cook de imagens soltas: entra na chave do cache (sobe junto do encode). */
const LOOSE_COOK_TAG = 'loose-v1';

/**
 * Padrão glob → RegExp: `**` casa qualquer caminho (com subpastas), `*` qualquer
 * trecho sem barra, `?` um caractere sem barra; o resto é literal. `a/**\/b`
 * também casa `a/b`.
 */
export function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      const slash = pattern[i + 2] === '/';
      re += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  // sem diferenciar maiúsculas: `*.png` casa `Sunny_Day.PNG` (o Windows não diferencia os nomes)
  return new RegExp(`^${re}$`, 'i');
}

const toList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const normalizePattern = (p) => p.trim().replace(/\\/g, '/').replace(/^(?:\.\/|\/)+/, '');

/**
 * Valida e normaliza `cortex.json.cookTextures`. Sem o campo, `[]`. Entrada sem
 * `files`, padrão que não é texto ou campo com tipo errado lança com a entrada.
 *
 * @param {unknown} raw valor cru do cortex.json
 * @returns {{ files: string[], exclude: string[], srgb: boolean, flipY: boolean, replace: boolean, match: RegExp[], skip: RegExp[] }[]}
 */
export function cookTexturesOf(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('cortex.json: cookTextures tem que ser uma lista');
  return raw.map((entry, i) => {
    const fail = (why) => {
      throw new Error(`cortex.json: cookTextures[${i}] inválida (${why}): ${JSON.stringify(entry)}`);
    };
    if (!entry || typeof entry !== 'object') fail('não é objeto');
    const files = toList(entry.files);
    const exclude = toList(entry.exclude);
    if (files.length === 0) fail('sem "files"');
    for (const p of [...files, ...exclude]) if (typeof p !== 'string' || !p.trim()) fail('padrão vazio ou não-texto');
    for (const k of ['srgb', 'flipY', 'replace']) {
      if (entry[k] !== undefined && typeof entry[k] !== 'boolean') fail(`"${k}" tem que ser true/false`);
    }
    const f = files.map(normalizePattern);
    const x = exclude.map(normalizePattern);
    return {
      files: f,
      exclude: x,
      srgb: entry.srgb ?? true,
      // o padrão espelha o `loadTexture`, que entrega o PNG com `flipY = true`: quem não mexe no flip sai igual
      flipY: entry.flipY ?? true,
      replace: entry.replace ?? true,
      match: f.map(globToRegExp),
      skip: x.map(globToRegExp),
    };
  });
}

/**
 * Casa a lista contra os arquivos da pasta `assets/` (caminhos relativos a ela,
 * com `/`). Devolve o mapa arquivo → entrada (a primeira que casa vence) e as
 * entradas que não casaram nada (o cook avisa).
 *
 * @param {ReturnType<typeof cookTexturesOf>} entries
 * @param {string[]} assetRels
 */
export function planCookTextures(entries, assetRels) {
  const byFile = new Map();
  const used = new Set();
  for (const rel of assetRels) {
    if (!LOOSE_IMAGE.test(rel)) continue;
    const url = ASSETS_PREFIX + rel;
    const index = entries.findIndex((e) => e.match.some((r) => r.test(url)) && !e.skip.some((r) => r.test(url)));
    if (index < 0) continue;
    byFile.set(rel, entries[index]);
    used.add(index);
  }
  const unmatched = entries.filter((_, i) => !used.has(i));
  return { byFile, unmatched };
}

/** Estatísticas iniciais do cook de imagens soltas (somadas ao `stats` do `cookAssets`). */
export function looseStats() {
  return { looseConverted: 0, looseCached: 0, looseKept: 0, looseKeptReasons: {}, looseBefore: 0, looseAfter: 0 };
}

/** Os problemas de instalação já avisados neste processo (como o GLB, `ktx2-glb.mjs`). */
const installWarned = new Set();
/** Volta os avisos únicos ao estado inicial (só para teste). */
export function resetCookTexturesWarnings() {
  installWarned.clear();
}

/** O encoder que a fonte usa (WASM ou basisu nativo, pelo teto de texels); fora de 4×4 ou ilegível, nenhum. */
function encoderOf(bytes) {
  try {
    return planEncode(bytes).encoder;
  } catch {
    return 'none';
  }
}

/** Chave do cache: a versão do cook, os bytes da fonte, o encoder e as opções que mudam o KTX2. */
function cacheKey(cookVersion, bytes, entry) {
  return createHash('sha1')
    .update(cookVersion)
    .update(LOOSE_COOK_TAG)
    .update(bytes)
    .update(`encoder=${encoderOf(bytes)};srgb=${entry.srgb};flipY=${entry.flipY}`)
    .digest('hex');
}

/**
 * Cozinha UMA imagem solta: grava `<out>.ktx2` (do cache em `cacheDir` quando a
 * fonte e as opções não mudaram) e devolve `true`; na falha avisa, conta o motivo
 * e devolve `false` (quem chama mantém o original). Só o sucesso entra no cache.
 *
 * @param {string} full caminho da fonte
 * @param {string} out caminho do original no cozido (o `.ktx2` sai ao lado)
 * @param {ReturnType<typeof cookTexturesOf>[number]} entry
 * @param {{ cacheDir: string, cookVersion: string, stats: ReturnType<typeof looseStats>, label: string }} ctx
 */
export async function cookLooseTexture(full, out, entry, { cacheDir, cookVersion, stats, label }) {
  const bytes = new Uint8Array(fs.readFileSync(full));
  stats.looseBefore += bytes.length;
  const cached = path.join(cacheDir, cacheKey(cookVersion, bytes, entry) + COOKED_TEXTURE_EXT);
  const target = out + COOKED_TEXTURE_EXT;
  if (fs.existsSync(cached)) {
    fs.copyFileSync(cached, target);
    stats.looseCached++;
    stats.looseAfter += fs.statSync(target).size;
    return true;
  }
  try {
    const ktx2 = await encodeKtx2(bytes, {
      uastc: true,
      srgb: entry.srgb,
      rdoScalar: entry.srgb ? COLOR_RDO_SCALAR : 0,
      flipY: entry.flipY,
    });
    fs.writeFileSync(target, ktx2);
    fs.copyFileSync(target, cached);
    stats.looseConverted++;
    stats.looseAfter += ktx2.length;
    return true;
  } catch (err) {
    const reason = err?.code ?? REASON_OTHER;
    const quiet = INSTALL_REASONS.has(reason) && installWarned.has(reason);
    if (INSTALL_REASONS.has(reason)) installWarned.add(reason);
    if (!quiet) console.warn(`[cook] ${label}: ${err?.message ?? err} — mantém o original`);
    stats.looseKept++;
    stats.looseKeptReasons[reason] = (stats.looseKeptReasons[reason] ?? 0) + 1;
    return false;
  }
}

/** URL do original (chave do manifesto) a partir do caminho relativo à pasta `assets/` (com `/`). */
export const assetUrl = (posixRel) => ASSETS_PREFIX + posixRel;

/** Grava o manifesto em `cookedDir` quando alguma imagem converteu. */
export function writeCookedManifest(cookedDir, manifest) {
  if (Object.keys(manifest).length === 0) return;
  fs.writeFileSync(path.join(cookedDir, COOKED_TEXTURES_MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
}
