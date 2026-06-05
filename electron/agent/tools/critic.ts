import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { resolve, isAbsolute } from 'path'
import { existsSync } from 'fs'
import { critiqueScene } from '../critic/sceneCritique.js'

/**
 * MCP server in-process que expõe a tool `critique_scene` ao Chat IA: um passe de
 * crítica de BELEZA por "olhos frescos". O agente principal, mergulhado no
 * contexto de construção, tende a achar que ficou bom; esta tool despacha um
 * Claude isolado (single-shot, sem histórico) pra comparar o screenshot da cena
 * com a referência e devolver um checklist acionável. Ver sceneCritique.ts.
 *
 * Factory (recebe `projectRoot`) — resolve o caminho do screenshot relativo ao
 * projeto. A referência costuma ser um caminho absoluto (imagem colada pelo
 * usuário em <userData>/cortex-pastes/...).
 */
export function createCriticToolServer(projectRoot: string) {
  return createSdkMcpServer({
    name: 'cortex-critic',
    version: '0.1.0',
    tools: [
      tool(
        'critique_scene',
        'Compara o SCREENSHOT da cena que você montou com a IMAGEM DE REFERÊNCIA e ' +
          'devolve uma crítica de beleza acionável (distância visual N/10 + correções ' +
          'priorizadas: atmosfera/luz, densidade, composição, câmera). Use no passo de ' +
          'crítica, ANTES de declarar a cena pronta — é um "olhos frescos" isolado, ' +
          'melhor que auto-avaliar no mesmo fluxo. Passe o PNG do playtest_game e a ' +
          'imagem que o usuário colou (ou o preview do pacote).',
        {
          screenshot_path: z
            .string()
            .min(1)
            .describe(
              'Caminho do screenshot da cena (ex.: ".cortex/playtest/123.png", relativo ' +
                'ao projeto, ou absoluto). Tipicamente um PNG salvo pelo playtest_game.',
            ),
          reference_path: z
            .string()
            .min(1)
            .describe(
              'Caminho da imagem de referência (alvo de beleza) — geralmente o path ' +
                'absoluto que veio em [imagem: <path>], ou um preview do pacote de assets.',
            ),
          goal: z
            .string()
            .optional()
            .describe('O que o usuário pediu / o spec da cena, pra contextualizar a crítica.'),
        },
        async ({ screenshot_path, reference_path, goal }) => {
          const shot = isAbsolute(screenshot_path) ? screenshot_path : resolve(projectRoot, screenshot_path)
          const ref = isAbsolute(reference_path) ? reference_path : resolve(projectRoot, reference_path)

          if (!existsSync(shot)) {
            return errorResult(`Screenshot não encontrado: ${screenshot_path}. Rode playtest_game e use o PNG salvo.`)
          }
          if (!existsSync(ref)) {
            return errorResult(`Referência não encontrada: ${reference_path}.`)
          }

          try {
            const critique = await critiqueScene({ referencePath: ref, screenshotPath: shot, goal })
            return { content: [{ type: 'text' as const, text: critique || 'Crítica vazia.' }] }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return errorResult(`Falha ao gerar crítica: ${message}`)
          }
        },
      ),
    ],
  })
}

function errorResult(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true }
}
