import * as monaco from 'monaco-editor'
import { MODEL_WARN_THRESHOLD, shouldPreloadProjectFile } from './preloadFilter'
import { monacoTs, pathToVirtualUri } from './monacoWorkspace'
import { debug } from '../../src/core/debug'

/** Escopo do logger de diagnóstico deste módulo. */
const SCOPE = 'studio:monaco'

/**
 * Alimentação de types no serviço de TypeScript do Monaco: fontes do projeto e
 * types do engine via `addExtraLib`, SEM pré-criar models (SPEC-0692) — cada
 * model assina o emitter global de linguagem e o Monaco alerta "listener LEAK"
 * em 200. O model nasce só quando o arquivo é aberto de fato (aba/Ctrl+click).
 * Extraído do `Editor.ts`.
 */

/** Já avisamos sobre a quantidade de models? (aviso é uma vez por sessão). */
let modelWarned = false

/**
 * Avisa UMA vez quando a quantidade de models vivos se aproxima do limite do
 * Monaco (SPEC-0166). Sem isto, o próximo projeto grande volta a disparar o
 * "potential listener LEAK detected" sem pista da causa — cada model assina o
 * emitter global de linguagem, e o alerta do editor sai em 200 listeners.
 */
function warnIfManyModels(origin: string): void {
  if (modelWarned) return
  const total = monaco.editor.getModels().length
  if (total < MODEL_WARN_THRESHOLD) return
  modelWarned = true
  // A quebra por origem é o que faltava da última vez: sem ela o alerta do
  // Monaco não diz se o excesso veio do projeto ou dos types do engine.
  const engineModels = monaco.editor
    .getModels()
    .filter((model) => model.uri.path.includes('node_modules/cortex-game-engine')).length
  debug(
    SCOPE,
    `${total} models do Monaco vivos após carregar ${origin} ` +
      `(${engineModels} de types do engine, ${total - engineModels} do projeto) — ` +
      'o editor alerta "listener LEAK" a partir de 200. Ver SPEC-0166.',
  )
}

/**
 * Para cada arquivo-fonte do projeto, alimenta o TypeScript service via
 * `addExtraLib` (SPEC-0692): imports relativos (`./foo`) passam a ser
 * resolvíveis e o go-to-definition encontra o destino — SEM criar model
 * (model = 1 listener no emitter global; projeto grande estourava os 200).
 * Na navegação, o `registerEditorOpener` do Editor lê o arquivo do disco e
 * cria o model naquele instante; dali em diante o worker do Monaco prefere o
 * model sobre a extra lib, então edição ao vivo não fica stale.
 *
 * Idempotente: pula arquivos já registrados. Arquivos que falhem ao ler são
 * silenciados — perder navegação pra 1 arquivo problemático é melhor que
 * abortar todo o pre-load. Leituras em paralelo.
 */
const preloadedPaths = new Set<string>()

export async function preloadProjectFiles(projectDir: string): Promise<void> {
  try {
    const files = await window.electronAPI.listProjectFiles(projectDir)
    await Promise.all(
      files.map(async (path) => {
        // Arquivo de teste fica fora do preload (SPEC-0166): é destino raro de
        // "ir para a definição" e abrir o arquivo cobre a navegação.
        if (!shouldPreloadProjectFile(path)) return
        const uriString = pathToVirtualUri(path).toString()
        if (preloadedPaths.has(uriString)) return
        try {
          const content = await window.electronAPI.readFile(path)
          monacoTs.typescriptDefaults.addExtraLib(content, uriString)
          preloadedPaths.add(uriString)
        } catch {
          // Arquivo pode ter sumido entre o list e o read — ignora.
        }
      }),
    )
    warnIfManyModels('arquivos do projeto')
  } catch (err) {
    console.error('Erro ao pre-carregar arquivos do projeto:', err)
  }
}

/**
 * Conteúdo dos `.d.ts` navegáveis do engine, por URI (`file:///node_modules/
 * cortex-game-engine/...`). Eles não existem no filesystem do projeto, então o
 * fallback de disco do opener não os cobre — o model é criado sob demanda a
 * partir deste mapa na primeira navegação (SPEC-0692).
 */
const engineTypeContents = new Map<string, string>()

/**
 * Cria (ou devolve) o model de um type navegável do engine, sob demanda.
 * Retorna `null` se a URI não é um type conhecido do engine.
 */
export function getOrCreateEngineTypeModel(resource: monaco.Uri): monaco.editor.ITextModel | null {
  const existing = monaco.editor.getModel(resource)
  if (existing) return existing
  const content = engineTypeContents.get(resource.toString())
  if (content === undefined) return null
  return monaco.editor.createModel(content, 'typescript', resource)
}

/** Alimenta os types do engine no servidor TS do Monaco. */
export async function loadEngineTypes(): Promise<void> {
  try {
    const files = await window.electronAPI.readEngineTypes()
    for (const { path, content, navigable } of files) {
      // addExtraLib é essencial para que o TS service resolva `import 'X'`
      // — sem isso o módulo nem é encontrado.
      monacoTs.typescriptDefaults.addExtraLib(content, path)
      // Navegável = Ctrl+click deve abrir o arquivo. O model NÃO é criado
      // aqui (eram ~114 listeners no emitter global, SPEC-0692) — só o
      // conteúdo fica guardado pra criar o model na primeira navegação.
      if (navigable) {
        engineTypeContents.set(monaco.Uri.parse(path).toString(), content)
      }
    }
    warnIfManyModels('os types do engine')
  } catch (err) {
    console.error('Erro ao carregar types do engine:', err)
  }
}
