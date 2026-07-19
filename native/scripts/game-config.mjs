// Identidade do jogo lida do cortex.json (ADR-0126). Fonte única do NOME de
// exibição, do ID estável (chave de saves) e do ícone — consumida pelo export
// (nomear/embutir no launcher, GDK) e, no runtime, pelo host nativo (título da
// janela, pasta de saves).
import fs from 'node:fs';
import path from 'node:path';

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Lê e RESOLVE a identidade do jogo em `gameDir/cortex.json`, com fallback pro
 * slug da pasta (compat com projetos antigos que só têm `{ engine }`):
 * - `id`   — slug ESTÁVEL (saves). `cortex.json.id` ?? nome da pasta.
 * - `name` — nome de EXIBIÇÃO. `cortex.json.name` ?? `id`.
 * - `icon` — caminho do PNG-fonte relativo ao projeto (ou `undefined`).
 * Campos desconhecidos do cortex.json são preservados no objeto retornado.
 * @param {string} gameDir
 * @returns {{id:string,name:string,icon?:string,[k:string]:unknown}}
 */
export function readGameConfig(gameDir) {
  let cfg = {};
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(gameDir, 'cortex.json'), 'utf8'));
    if (raw && typeof raw === 'object') cfg = raw;
  } catch {
    // sem cortex.json (ou inválido) — cai no slug
  }
  const slug = path.basename(gameDir.replace(/[\\/]+$/, ''));
  const id = str(cfg.id) ?? slug;
  const name = str(cfg.name) ?? id;
  return { ...cfg, id, name, icon: str(cfg.icon) };
}
