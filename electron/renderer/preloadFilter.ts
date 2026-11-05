/**
 * **Filtro do preload de modelos do Monaco** (SPEC-0166) — puro, sem Monaco nem
 * DOM, pra ser testável.
 *
 * O Studio alimenta o TS service com um `addExtraLib` por arquivo-fonte do
 * projeto só pra o Ctrl+click alcançar arquivo ainda não aberto (desde a
 * SPEC-0692 sem criar model — cada model assinava um listener no emitter
 * global de linguagem e o Monaco alerta em **200**). Arquivo de teste é
 * destino raro de "ir para a definição", então fica de fora do preload e só
 * economiza memória do worker (abrir o arquivo cobre a navegação).
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
