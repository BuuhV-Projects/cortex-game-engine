import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { saveBaseline, diffCorrections } from '../learning.js'

/**
 * MCP server `cortex-learn`: **aprendizado por correções do dev**.
 *
 * Contrato do ciclo (ver AGENT_SYSTEM_PROMPT, "Aprender com as correções"):
 * 1. Terminou de gerar/editar uma fase → `save_baseline { fase }`.
 * 2. O dev corrige no editor (overlay). Numa sessão futura (ou quando o dev
 *    pedir/aceitar), `diff_corrections { fase }` → diff semântico compacto.
 * 3. O agente propõe as LIÇÕES ao dev (mostra antes de gravar!); aprovadas,
 *    grava nos destinos certos e chama `save_baseline` de novo (correções
 *    viram o novo estado abençoado — o veto do dev TAMBÉM atualiza o baseline,
 *    senão o mesmo diff é re-oferecido pra sempre).
 */

export function createLearnToolServer(projectRoot: string) {
  return createSdkMcpServer({
    name: 'cortex-learn',
    version: '0.1.0',
    tools: [
      tool(
        'save_baseline',
        'Grava o BASELINE da fase = snapshot do estado efetivo da cena (nós + overlay ' +
          'resolvidos por id). Chame SEMPRE que terminar de gerar/editar uma cena ' +
          '(depois da validação), e de novo após um ciclo de aprendizado (aprovado OU ' +
          'vetado pelo dev). É o marco contra o qual diff_corrections mede o que o dev ' +
          'corrigiu — sem baseline atualizado, o aprendizado repete lição velha.',
        {
          fase: z.string().describe('Nome da fase (ex. "fase2", ou "cena" se o jogo tem uma só).'),
          overlay: z
            .string()
            .optional()
            .describe('Overlay da fase (default assets/scene-data.json; multi-fase: assets/scene-data-<fase>.json).'),
        },
        async ({ fase, overlay }) => {
          const overlayRel = overlay ?? 'assets/scene-data.json'
          const b = await saveBaseline(projectRoot, fase, overlayRel)
          return {
            content: [
              {
                type: 'text' as const,
                text: `Baseline "${fase}" salvo (${Object.keys(b.nodes).length} nós, overlay ${overlayRel}).`,
              },
            ],
          }
        },
      ),
      tool(
        'diff_corrections',
        'Compara o estado ATUAL da cena com o baseline da fase e devolve o diff ' +
          'SEMÂNTICO das correções do dev (agrupado por role × tipo: movido/rotacionado/' +
          'escalado/física/collider/adicionado/removido, com médias e tendência de eixo). ' +
          'Use quando o dev pedir pra aprender, aceitar a oferta de aprendizado, ou ' +
          'quando houver correções pendentes. Fluxo: (1) rode isto; (2) PROPONHA as ' +
          'lições ao dev (mostre o que vai gravar ANTES de gravar); (3) aprovadas → ' +
          'regra geométrica vira ajuste em validate_scene/threshold, lição de estilo vai ' +
          'pro .cortex/scene-learnings.md (deduplicada); (4) save_baseline de novo — ' +
          'TAMBÉM quando o dev vetar (veto é sobre a lição, não sobre o marco). O diff ' +
          'completo fica em .cortex/learning/.',
        {
          fase: z.string().describe('Nome da fase (mesmo usado no save_baseline).'),
          overlay: z.string().optional().describe('Overlay da fase (default assets/scene-data.json).'),
        },
        async ({ fase, overlay }) => {
          const overlayRel = overlay ?? 'assets/scene-data.json'
          const diff = await diffCorrections(projectRoot, fase, overlayRel)
          if (!diff) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Não há baseline "${fase}" — rode save_baseline ao terminar a próxima edição da cena.`,
                },
              ],
              isError: true,
            }
          }
          const outDir = join(projectRoot, '.cortex', 'learning')
          await mkdir(outDir, { recursive: true })
          const rel = `.cortex/learning/${fase.replace(/[^\w.-]/g, '_')}-diff.json`
          await writeFile(join(projectRoot, rel), JSON.stringify(diff, null, 2))
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  `${diff.summary}\n\nDiff completo: ${rel} (baseline de ${diff.baselineSavedAt}).\n` +
                  `Próximo passo: proponha as lições ao dev ANTES de gravar; depois save_baseline { fase: "${fase}" }.`,
              },
            ],
          }
        },
      ),
    ],
  })
}
