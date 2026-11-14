// Pastas soltas do export (SPEC-0733 + ADR-0732): vão pro dist FORA do
// assets.pak, de propósito, pra quem joga trocar o conteúdo sem rebuild.
// `languages/` vai sempre (SPEC-0124 + ADR-0187); o jogo declara as demais em
// `cortex.json.looseDirs` (ex.: `["radios"]`). O `__cortexReadFile` do host
// (native/src/shims/files.cpp) acha o arquivo solto quando ele não está no pak,
// para qualquer caminho relativo.
import fs from 'node:fs';
import path from 'node:path';

/** Nome da pasta de idiomas — o mesmo na raiz do jogo e na raiz do dist. */
const LANGUAGES_DIR = 'languages';

/**
 * Copia a árvore de `src` pra `target`, criando os diretórios que faltarem.
 *
 * @param {string} src pasta de origem
 * @param {string} target pasta de destino
 * @returns {number} arquivos copiados
 */
function copyTree(src, target) {
  fs.mkdirSync(target, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copied += copyTree(from, to);
    } else {
      fs.copyFileSync(from, to);
      copied += 1;
    }
  }
  return copied;
}

/**
 * Valida e normaliza um item de `looseDirs`: caminho relativo DENTRO do jogo.
 * Barras viram `/`; absoluto (`/x`, `C:\x`, `C:x`), `..` e vazio lançam.
 *
 * @param {unknown} item valor cru do cortex.json
 * @returns {string} caminho relativo normalizado
 */
function normalizeLooseDir(item) {
  const fail = () => {
    throw new Error(
      `cortex.json: looseDirs inválido (${JSON.stringify(item)}) — use pasta relativa à raiz do jogo, sem ".." e sem caminho absoluto`,
    );
  };
  if (typeof item !== 'string') fail();
  const raw = item.trim().replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) fail();
  const parts = raw.split('/').filter((part) => part !== '' && part !== '.');
  if (parts.length === 0 || parts.includes('..')) fail();
  return parts.join('/');
}

/**
 * Lista de pastas soltas do export: `languages` primeiro, depois as declaradas
 * em `config.looseDirs`, validadas e sem repetição.
 *
 * @param {{looseDirs?: unknown}} config saída de `readGameConfig`
 * @returns {string[]}
 */
export function looseDirsOf(config) {
  const declared = config?.looseDirs ?? [];
  if (!Array.isArray(declared)) {
    throw new Error('cortex.json: looseDirs tem que ser uma lista de pastas (ex.: ["radios"])');
  }
  return [...new Set([LANGUAGES_DIR, ...declared.map(normalizeLooseDir)])];
}

/**
 * Copia cada pasta de `dirs` de `gameDir` pro mesmo caminho em `dist`,
 * recursiva e **sem filtro de extensão** (o critério é a pasta, ADR-0187).
 * Pasta ausente é pulada sem erro.
 *
 * @param {string} gameDir raiz do projeto do jogo
 * @param {string} dist raiz do export (dist-native/)
 * @param {string[]} dirs saída de {@link looseDirsOf}
 * @returns {{dir: string, files: number}[]} pastas copiadas
 */
export function copyLooseDirs(gameDir, dist, dirs) {
  const copied = [];
  for (const dir of dirs) {
    const src = path.join(gameDir, dir);
    if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) continue;
    copied.push({ dir, files: copyTree(src, path.join(dist, dir)) });
  }
  return copied;
}

/**
 * Copia `<gameDir>/languages/` recursivamente pra `<dist>/languages/`.
 *
 * @param {string} gameDir raiz do projeto do jogo
 * @param {string} dist raiz do export (dist-native/)
 * @returns {number} arquivos copiados (0 = jogo sem pasta de idiomas)
 */
export function copyLanguages(gameDir, dist) {
  return copyLooseDirs(gameDir, dist, [LANGUAGES_DIR]).reduce((sum, { files }) => sum + files, 0);
}
