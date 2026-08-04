// Idiomas do jogo no export (SPEC-0124 + ADR-0187): a pasta `languages/` inteira
// vai SOLTA pro dist — os `.txt` da raiz E os assets localizados das subpastas
// (placas dos portais, dublagem por idioma). Fora do assets.pak de propósito:
// quem traduz troca o arquivo sem rebuild, e o `__cortexReadFile` do host
// (native/src/shims/files.cpp) acha o arquivo solto quando ele não está no pak.
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
 * Copia `<gameDir>/languages/` recursivamente pra `<dist>/languages/`.
 *
 * **Sem filtro de extensão** (ADR-0187): o critério é a PASTA. A versão antiga
 * levava só `*.txt` da raiz, então subpasta sumia em silêncio — funcionava no
 * Studio (o Vite serve da raiz do projeto) e faltava no export.
 *
 * @param {string} gameDir raiz do projeto do jogo
 * @param {string} dist raiz do export (dist-native/)
 * @returns {number} arquivos copiados (0 = jogo sem pasta de idiomas)
 */
export function copyLanguages(gameDir, dist) {
  const src = path.join(gameDir, LANGUAGES_DIR);
  if (!fs.existsSync(src)) return 0;
  return copyTree(src, path.join(dist, LANGUAGES_DIR));
}
