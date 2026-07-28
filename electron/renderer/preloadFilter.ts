/**
 * **Filtro do preload de modelos do Monaco** (SPEC-0166) — puro, sem Monaco nem
 * DOM, pra ser testável.
 *
 * O Studio pré-cria um `monaco.editor.createModel()` por arquivo-fonte do
 * projeto só pra o Ctrl+click alcançar arquivo ainda não aberto. Cada model
 * assina um emitter global de linguagem, e o VS Code alerta ao passar de **200
 * listeners** — com o projeto + os `.d.ts` do engine o Studio vivia na borda.
 * Arquivo de teste é destino raro de "ir para a definição", então fica de fora
 * do preload (abrir o arquivo cria o model normalmente).
 */

/** Segmentos de caminho que indicam código de teste. */
const TEST_DIRECTORIES = ['tests', 'test', '__tests__', 'spec', '__mocks__'];

/** Sufixos de arquivo de teste (`Foo.test.ts`, `Foo.spec.tsx`). */
const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/i;

/**
 * Quantos modelos vivos já pedem atenção. Abaixo do limite do Monaco (200) de
 * propósito: o aviso do Studio precisa chegar ANTES do alerta de leak.
 */
export const MODEL_WARN_THRESHOLD = 180;

/**
 * O arquivo deve entrar no preload de modelos?
 *
 * @param path Caminho do arquivo (aceita separador `/` ou `\`).
 *
 * @example
 * shouldPreloadProjectFile('D:/jogo/utils/MainMenu.ts')      // true
 * shouldPreloadProjectFile('D:/jogo/tests/rush.test.ts')     // false
 */
export function shouldPreloadProjectFile(path: string): boolean {
  const segments = path.split(/[\\/]/);
  const file = segments[segments.length - 1] ?? '';
  if (TEST_FILE_PATTERN.test(file)) return false;
  // O nome do arquivo não conta como diretório (um `spec.ts` solto entra).
  return !segments
    .slice(0, -1)
    .some((segment) => TEST_DIRECTORIES.includes(segment.toLowerCase()));
}
