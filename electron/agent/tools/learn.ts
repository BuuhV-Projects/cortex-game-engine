import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { saveBaseline, diffCorrections, checkRuleAgainstBaseline } from '../learning.js'
import {
  loadValidationRules,
  saveValidationRules,
  mergeValidationRules,
  describeRulePatch,
  VALIDATION_RULES_REL,
  type RuleThresholds,
  type RuleSeverity,
} from '../validationRules.js'

/**
 * MCP server `cortex-learn`: **aprendizado por correções do dev**.
 *
 * Contrato do ciclo (ver AGENT_SYSTEM_PROMPT, "Aprender com as correções"):
 * 1. Terminou de gerar/editar uma fase → `save_baseline { fase }`.
 * 2. O dev corrige no editor (overlay). Numa sessão futura (ou quando o dev
 *    pedir/aceitar), `diff_corrections { fase }` → diff semântico compacto.
 * 3. O agente propõe as LIÇÕES ao dev (mostra antes de gravar!); aprovadas:
 *    lição GEOMÉTRICA → `save_rule` (vira regra do validate_scene em
 *    `.cortex/validation-rules.json`, com checagem de regressão contra o
 *    baseline — ADR-0115); lição de ESTILO → `.cortex/scene-learnings.md`.
 * 4. `save_baseline` de novo, POR ÚLTIMO (correções viram o novo estado
 *    abençoado — o veto do dev TAMBÉM atualiza o baseline, senão o mesmo diff
 *    é re-oferecido pra sempre). Ordem importa: `save_rule` usa o baseline
 *    antigo como contraprova; depois de avançá-lo a checagem perde o "antes".
 */

/** Regras do validador afetadas por cada threshold (pra medir discriminação). */
const THRESHOLD_RULE: Record<keyof RuleThresholds, string> = {
  maxGap: 'gap',
  maxRise: 'rise',
  maxPenetration: 'overlap',
}

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
      tool(
        'save_rule',
        'Grava uma lição GEOMÉTRICA aprovada pelo dev como REGRA DURÁVEL do projeto ' +
          `(${VALIDATION_RULES_REL}) — o validate_scene passa a aplicá-la automaticamente ` +
          'em toda validação futura (regra em código não regride, ao contrário de lição ' +
          'em texto). Antes de gravar, roda a CHECAGEM DE REGRESSÃO: valida a cena no ' +
          'estado do baseline (antes das correções) e no atual com a regra candidata — ' +
          'a regra só presta se REPROVA o antes e melhora o depois. Se não discriminar, ' +
          'NÃO grava (a lição é gosto pontual → registre no scene-learnings.md; ou ' +
          'repita com force:true se o dev insistir). Chame ANTES do save_baseline final ' +
          '(a checagem precisa do baseline antigo como contraprova). Use APENAS com ' +
          'lição já aprovada pelo dev.',
        {
          fase: z.string().describe('Fase cujo baseline serve de contraprova (mesma do diff_corrections).'),
          motivo: z.string().describe('A lição, como aprovada pelo dev (vira trilha de auditoria no arquivo).'),
          maxGap: z.number().optional().describe('Novo maior vão pulável (u) — afeta a regra "gap".'),
          maxRise: z.number().optional().describe('Nova maior subida (u) — afeta a regra "rise".'),
          maxPenetration: z.number().optional().describe('Nova tolerância de interpenetração (u) — afeta "overlap".'),
          severity: z
            .record(z.string(), z.enum(['error', 'warning', 'off']))
            .optional()
            .describe('Override de severidade por regra (ex. {"gap":"error"} endurece; "off" desliga).'),
          overlay: z.string().optional().describe('Overlay da fase (default assets/scene-data.json).'),
          force: z
            .boolean()
            .optional()
            .describe('Grava mesmo sem a checagem discriminar (só se o dev pediu explicitamente).'),
        },
        async ({ fase, motivo, maxGap, maxRise, maxPenetration, severity, overlay, force }) => {
          const thresholds: RuleThresholds = {
            ...(maxGap !== undefined ? { maxGap } : {}),
            ...(maxRise !== undefined ? { maxRise } : {}),
            ...(maxPenetration !== undefined ? { maxPenetration } : {}),
          }
          const patch = { thresholds, severity: severity as Record<string, RuleSeverity> | undefined }
          const affected = [
            ...Object.keys(thresholds).map((k) => THRESHOLD_RULE[k as keyof RuleThresholds]),
            ...Object.keys(severity ?? {}),
          ]
          if (affected.length === 0) {
            return {
              content: [{ type: 'text' as const, text: 'Nada a gravar: passe ao menos um threshold ou severity.' }],
              isError: true,
            }
          }

          const base = await loadValidationRules(projectRoot)
          const overlayRel = overlay ?? 'assets/scene-data.json'
          // Regra candidata = regras vigentes + patch (o que o validate_scene vai aplicar).
          const candidate = {
            ...{ ...base?.thresholds, ...thresholds },
            severity: { ...base?.severity, ...(severity as Record<string, RuleSeverity> | undefined) },
          }
          const check = await checkRuleAgainstBaseline(projectRoot, fase, overlayRel, candidate)

          const fmt = (c: Record<string, number>): string =>
            affected.map((r) => `${r}=${c[r] ?? 0}`).join(' ')
          let checkText: string
          let discriminates = false
          if (!check) {
            checkText = `Sem baseline "${fase}" — checagem de regressão impossível.`
          } else {
            discriminates = affected.some((r) => (check.before[r] ?? 0) > (check.after[r] ?? 0))
            checkText =
              `Checagem de regressão (violações nas regras afetadas): antes → ${fmt(check.before)}; ` +
              `depois → ${fmt(check.after)}.` +
              (check.unreconstructed.length
                ? ` (${check.unreconstructed.length} nó(s) fora do replay: ${check.unreconstructed.slice(0, 5).join(', ')})`
                : '')
          }

          if (!discriminates && !force) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    `NÃO gravada. ${checkText}\nA regra candidata não separa o estado antigo do corrigido — ` +
                    `não capturou a correção do dev. Registre como lição de estilo no .cortex/scene-learnings.md, ` +
                    `ajuste o valor, ou repita com force:true se o dev confirmar mesmo assim.`,
                },
              ],
              isError: true,
            }
          }

          const merged = mergeValidationRules(base, patch, {
            date: new Date().toISOString(),
            patch: describeRulePatch(base, patch),
            motivo,
            checked: discriminates,
          })
          await saveValidationRules(projectRoot, merged)
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  `Regra gravada em ${VALIDATION_RULES_REL}: ${describeRulePatch(base, patch)}.\n${checkText}\n` +
                  `O validate_scene aplica isso automaticamente daqui em diante. ` +
                  `Agora rode save_baseline { fase: "${fase}" } pra fechar o ciclo.`,
              },
            ],
          }
        },
      ),
    ],
  })
}
