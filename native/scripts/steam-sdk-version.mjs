// Versões do Steamworks SDK: o que a Valve ANUNCIOU, o que o repo privado TEM e
// o que o engine ESPERA (ADR-0176). É a lógica por trás do watcher que avisa
// quando sai SDK novo — separada do workflow pra poder ser testada.
//
// Por que um watcher em vez de baixar sozinho: o SDK fica atrás de login de
// parceiro (com 2FA) em partner.steamgames.com. Automatizar esse login seria
// frágil e indevido, então o download continua manual — o que dá pra automatizar
// é a DETECÇÃO, pelo feed público de anúncios do grupo Steamworks Development.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Feed PÚBLICO de anúncios da Valve pra devs — não exige login. */
export const STEAMWORKS_RSS = 'https://steamcommunity.com/groups/steamworks/rss/';

/** Onde o engine registra a versão de SDK que espera. */
export const SDK_VERSION_FILE = path.join(engineRoot, 'native', 'steam', 'sdk-version.txt');

/**
 * Maior versão de SDK anunciada no feed, como `"1.65"`, ou `null`.
 *
 * Os títulos vêm no formato "Steamworks SDK 1.65 has been released". Pegamos a
 * MAIOR e não a primeira porque a ordem do feed não é garantida e um anúncio
 * antigo republicado faria o watcher achar que a versão regrediu.
 * @param {string} xml corpo do RSS
 * @returns {string|null}
 */
export function parseAnnouncedVersion(xml) {
  const versions = [...String(xml ?? '').matchAll(/Steamworks SDK v?(\d+\.\d+)\b/gi)].map((m) => m[1]);
  return versions.length ? versions.sort(compareVersions).at(-1) : null;
}

/**
 * Versão que o `Readme.txt` do SDK declara (a primeira linha `vX.YZ <data>` é a
 * mais recente — o changelog da Valve é do topo pro passado).
 * @param {string} text
 * @returns {string|null}
 */
export function parseSdkReadmeVersion(text) {
  const match = String(text ?? '').match(/^v(\d+\.\d+)\s/m);
  return match ? match[1] : null;
}

/**
 * Ordena "1.9" antes de "1.65" corretamente — comparar como string colocaria
 * "1.9" na frente, e o watcher anunciaria um downgrade.
 * @param {string} a
 * @param {string} b
 */
export function compareVersions(a, b) {
  const [aMajor, aMinor] = a.split('.').map(Number);
  const [bMajor, bMinor] = b.split('.').map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

/** Versão registrada no engine (`native/steam/sdk-version.txt`), ou `null`. */
export function expectedVersion(file = SDK_VERSION_FILE) {
  try {
    const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim();
    return /^\d+\.\d+$/.test(text) ? text : null;
  } catch {
    return null;
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// `node native/scripts/steam-sdk-version.mjs` → JSON no stdout, consumido pelo
// workflow steam-sdk-watch.yml.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const expected = expectedVersion();
  let announced = null;
  let error = null;
  try {
    const res = await fetch(STEAMWORKS_RSS, { headers: { 'user-agent': 'cortex-game-engine sdk-watch' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    announced = parseAnnouncedVersion(await res.text());
  } catch (err) {
    // Feed fora do ar não é motivo pra CI vermelho: reporta e deixa o workflow
    // decidir (ele trata `outdated: false` como "nada a fazer").
    error = String(err?.message ?? err);
  }
  const outdated =
    announced !== null && expected !== null && compareVersions(announced, expected) > 0;
  console.log(JSON.stringify({ expected, announced, outdated, error }));
}
