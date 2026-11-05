import * as monaco from 'monaco-editor'
import { MODEL_WARN_THRESHOLD, shouldPreloadProjectFile } from './preloadFilter'
import { detectLanguage } from './fileKinds'
import { monacoTs, pathToVirtualUri } from './monacoWorkspace'
import { debug } from '../../src/core/debug'

/** Escopo do logger de diagnóstico deste módulo. */
const SCOPE = 'studio:monaco'

/**
 * Alimentação de models/types no serviço de TypeScript do Monaco: pre-load dos
 * fontes do projeto, types do engine e o aviso de excesso de models (SPEC-0166).
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
 * Para cada arquivo-fonte do projeto, cria silenciosamente um model no
 * Monaco (sem abrir aba). Isso alimenta o TypeScript service: imports
 * relativos (`./foo`) passam a ser resolvíveis e Ctrl+click consegue
 * navegar pra arquivos que o usuário ainda não abriu manualmente.
 *
 * Idempotente: pula arquivos que já têm model. Arquivos que falhem ao
 * ler são silenciados — perder navegação pra 1 arquivo problemático é
 * melhor que abortar todo o pre-load. Leituras em paralelo.
 *
 * Trade-off: gasta RAM proporcional ao tamanho do projeto. Pra projetos
 * típicos (< 100 arquivos × poucos KB cada) é desprezível.
 */
export async function preloadProjectFiles(projectDir: string): Promise<void> {
  try {
    const files = await window.electronAPI.listProjectFiles(projectDir)
    await Promise.all(
      files.map(async (path) => {
        // Arquivo de teste fica fora do preload (SPEC-0166): é destino raro de
        // "ir para a definição" e cada model custa um listener no emitter
        // global do Monaco. Abrir o arquivo cria o model normalmente.
        if (!shouldPreloadProjectFile(path)) return
        const uri = pathToVirtualUri(path)
        if (monaco.editor.getModel(uri)) return
        try {
          const content = await window.electronAPI.readFile(path)
          const name = path.split(/[\\/]/).pop() ?? ''
          const language = detectLanguage(name)
          monaco.editor.createModel(content, language, uri)
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

/** Alimenta os types do engine no servidor TS do Monaco. */
export async function loadEngineTypes(): Promise<void> {
  try {
    const files = await window.electronAPI.readEngineTypes()
    for (const { path, content, navigable } of files) {
      // addExtraLib é essencial para que o TS service resolva `import 'X'`
      // — sem isso o módulo nem é encontrado.
      monacoTs.typescriptDefaults.addExtraLib(content, path)
      // createModel adicional só para os arquivos do engine (poucos) —
      // viabiliza Ctrl+click. Para @types/three (~946 arquivos) cair aqui
      // estoura o limite de 200 listeners do Monaco.
      if (navigable) {
        const uri = monaco.Uri.parse(path)
        if (!monaco.editor.getModel(uri)) {
          monaco.editor.createModel(content, 'typescript', uri)
        }
      }
    }
    warnIfManyModels('os types do engine')
  } catch (err) {
    console.error('Erro ao carregar types do engine:', err)
  }
}
