import { existsSync } from 'fs'
import { join } from 'path'

/**
 * Plugin local `cortex-studio` (ADR-0180).
 *
 * O `.claude/` do repositório da engine é, ao mesmo tempo, o diretório de projeto
 * do Claude Code e um **plugin local** do Agent SDK: ele contém
 * `.claude-plugin/plugin.json`, `skills/` e `agents/`. Isso dá fonte única — o
 * método refinado trabalhando no repositório é literalmente o que o Chat IA
 * executa —, sem copiar skill nenhuma.
 *
 * No app empacotado o diretório vai em `extraResources` como `agent-plugin/`
 * (dotfiles no destino são evitados de propósito).
 */

/** Nome declarado no `plugin.json`. Prefixa os agentes expostos pelo SDK. */
export const PLUGIN_NAME = 'cortex-studio'

/**
 * Nome do subagente montador de fase como o SDK o expõe. O SDK prefixa agentes
 * de plugin com o nome do plugin (skills, não — essas aparecem sem prefixo).
 */
export const LEVEL_BUILDER_AGENT = `${PLUGIN_NAME}:level-builder`

/** Marcador que identifica um diretório como raiz de plugin. */
const PLUGIN_MANIFEST = join('.claude-plugin', 'plugin.json')

/**
 * Candidatos, na ordem: empacotado primeiro (o caso do usuário final), depois o
 * layout do repositório em dev.
 */
const CANDIDATE_DIRS = ['agent-plugin', '.claude']

/**
 * Resolve a raiz do plugin a partir da base de recursos (`resourceBase()` do
 * main: `process.resourcesPath` em produção, raiz do repo em dev).
 *
 * @returns caminho absoluto da raiz do plugin, ou `null` se nenhum candidato
 * tiver o manifesto — nesse caso o turno roda sem skills, em vez de falhar.
 */
export function resolvePluginDir(resourceBase: string): string | null {
  for (const dir of CANDIDATE_DIRS) {
    const candidate = join(resourceBase, dir)
    if (existsSync(join(candidate, PLUGIN_MANIFEST))) return candidate
  }
  return null
}
