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
    // Tira o BOM antes do parse: um cortex.json salvo por editor do Windows (ou
    // por `Out-File -Encoding utf8` do PowerShell 5.1) começa com U+FEFF, e
    // `JSON.parse` lança nele. Sem isso o catch abaixo engoliria o erro e o
    // export cairia no fallback do slug — perdendo `name`/`icon`/`steamAppId` em
    // SILÊNCIO, enquanto o host C++ (que faz busca textual) leria tudo certo.
    const text = fs.readFileSync(path.join(gameDir, 'cortex.json'), 'utf8').replace(/^\uFEFF/, '');
    const raw = JSON.parse(text);
    if (raw && typeof raw === 'object') cfg = raw;
  } catch {
    // sem cortex.json (ou inválido) — cai no slug
  }
  const slug = path.basename(gameDir.replace(/[\\/]+$/, ''));
  const id = str(cfg.id) ?? slug;
  const name = str(cfg.name) ?? id;
  return { ...cfg, id, name, icon: str(cfg.icon) };
}

/**
 * App id da Steam declarado no projeto (ADR-0174), NORMALIZADO para número, ou
 * `null` se ausente/inválido. Aceita as duas grafias (`480` e `"480"`) porque o
 * campo é digitado por humano no Studio e o id entre aspas é o erro provável —
 * o host tolera o mesmo par no `cortex.json`.
 * @param {{steamAppId?:unknown}} config saída de {@link readGameConfig}
 * @returns {number|null}
 */
export function steamAppIdOf(config) {
  const raw = config?.steamAppId;
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  // App id 0 é o "não declarado" do host — não pode passar como id válido.
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
