import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { parseSceneDefinition, type SceneDefinition } from '../../../src/scene/SceneDefinition.js'
import { parseKit, type KitManifest } from '../../../src/scene/Kit.js'
import { validateScene, type SceneValidationReport } from '../../../src/scene/validateScene.js'
import type { SceneFileV1 } from '../../../src/scene/SceneFile.js'
import { loadValidationRules, VALIDATION_RULES_REL, type ValidationRules } from '../validationRules.js'

/**
 * MCP server `cortex-validate`: validação GEOMÉTRICA estática da cena
 * (`validate_scene`) — interpenetração, peça flutuando, gameplay tombado/
 * desalinhado, vão impulável, attach quebrado — direto dos dados (scenes/*.json
 * + kit.json + overlay), sem subir o jogo nem gastar screenshot.
 *
 * Contrato do pipeline: `validate_scene` com 0 erros é PRÉ-REQUISITO antes de
 * qualquer validação visual (playtest/critique) — geometria se valida com
 * código; screenshot é pra composição/beleza. O relatório COMPLETO vai pra
 * `.cortex/validation/` (leia com Read se precisar); a resposta traz só o
 * resumo (orçamento de contexto).
 *
 * Regras APRENDIDAS do projeto (`.cortex/validation-rules.json`, gravadas pelo
 * ciclo de aprendizado via `save_rule` — ADR-0115) são carregadas AUTOMATICAMENTE
 * como default de thresholds/severidade; parâmetro explícito da chamada vence.
 */

const MAX_SHOWN = 10

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch {
    return null
  }
}

async function loadKits(projectRoot: string): Promise<KitManifest[]> {
  const kits: KitManifest[] = []
  const assetsDir = join(projectRoot, 'assets')
  if (!existsSync(assetsDir)) return kits
  for (const e of await readdir(assetsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const p = join(assetsDir, e.name, 'kit.json')
    if (!existsSync(p)) continue
    const kit = parseKit(await readJson(p))
    if (kit) kits.push(kit)
  }
  return kits
}

function formatReport(name: string, r: SceneValidationReport, reportPath: string): string {
  const lines: string[] = []
  const byRule = (list: { rule: string }[]) => {
    const acc: Record<string, number> = {}
    for (const v of list) acc[v.rule] = (acc[v.rule] ?? 0) + 1
    return Object.entries(acc)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ')
  }
  lines.push(
    `${name}: ${r.errors.length} erro(s), ${r.warnings.length} warning(s) ` +
      `(${r.stats.boxed}/${r.stats.nodes} nós avaliados)`,
  )
  if (r.errors.length) lines.push(`Erros por regra: ${byRule(r.errors)}`)
  if (r.warnings.length) lines.push(`Warnings por regra: ${byRule(r.warnings)}`)
  for (const v of r.errors.slice(0, MAX_SHOWN)) lines.push(`  ✗ [${v.rule}] ${v.message}`)
  if (r.errors.length > MAX_SHOWN) lines.push(`  … +${r.errors.length - MAX_SHOWN} erro(s) no relatório completo`)
  for (const v of r.warnings.slice(0, Math.max(0, MAX_SHOWN - r.errors.length))) lines.push(`  ⚠ [${v.rule}] ${v.message}`)
  const extraW = r.warnings.length - Math.max(0, MAX_SHOWN - r.errors.length)
  if (extraW > 0) lines.push(`  … +${extraW} warning(s) no relatório completo`)
  if (r.stats.skipped.length) {
    lines.push(
      `  (sem cobertura — nós sem size no kit: ${r.stats.skipped.slice(0, 8).join(', ')}` +
        (r.stats.skipped.length > 8 ? ` +${r.stats.skipped.length - 8}` : '') +
        ')',
    )
  }
  lines.push(`Relatório completo: ${reportPath}`)
  return lines.join('\n')
}

/** Uma linha com o que o arquivo de regras muda ("maxGap=2.5, gap:error"). */
function describeRules(rules: ValidationRules): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(rules.thresholds ?? {})) parts.push(`${k}=${v}`)
  for (const [k, v] of Object.entries(rules.severity ?? {})) parts.push(`${k}:${v}`)
  return parts.join(', ') || 'nenhuma mudança efetiva'
}

export function createValidateToolServer(projectRoot: string) {
  return createSdkMcpServer({
    name: 'cortex-validate',
    version: '0.1.0',
    tools: [
      tool(
        'validate_scene',
        'Valida a GEOMETRIA da cena estaticamente (sem rodar o jogo): interpenetração ' +
          'entre sólidos, peça flutuando sem apoio, gameplay tombado/desalinhado, vão/' +
          'subida impulável e attach quebrado. Use SEMPRE depois de escrever/editar ' +
          'scenes/*.json e ANTES de playtest_game/critique_scene — erro geométrico se ' +
          'corrige aqui (barato, determinístico), não em screenshot. 0 erros é pré-' +
          'requisito da Definição de Pronto. O relatório completo fica em ' +
          '.cortex/validation/ (a resposta traz o resumo).',
        {
          scenes: z
            .array(z.string())
            .optional()
            .describe('Opcional: caminhos dos JSON de cena (relativos ao projeto). Omitir = todos em scenes/*.json.'),
          overlay: z
            .string()
            .optional()
            .describe('Opcional: overlay da fase (ex. assets/scene-data-fase2.json). Default: assets/scene-data.json se existir.'),
          maxGap: z.number().optional().describe('Opcional: maior vão pulável em unidades (default 2.8).'),
          maxRise: z.number().optional().describe('Opcional: maior subida entre plataformas (default 3).'),
        },
        async ({ scenes, overlay, maxGap, maxRise }) => {
          // 1) Cenas: as passadas, ou todo scenes/*.json.
          let scenePaths = scenes ?? []
          if (scenePaths.length === 0) {
            const dir = join(projectRoot, 'scenes')
            if (existsSync(dir)) {
              scenePaths = (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => `scenes/${f}`)
            }
          }
          if (scenePaths.length === 0) {
            return {
              content: [{ type: 'text' as const, text: 'Nenhum JSON de cena encontrado (scenes/*.json).' }],
              isError: true,
            }
          }
          const defs: SceneDefinition[] = []
          const invalid: string[] = []
          for (const rel of scenePaths) {
            const raw = await readJson(join(projectRoot, rel))
            const def = raw ? parseSceneDefinition(raw) : null
            if (def) defs.push(def)
            else invalid.push(rel)
          }
          if (defs.length === 0) {
            return {
              content: [
                { type: 'text' as const, text: `Nenhuma cena válida. Falha no parse: ${invalid.join(', ')}` },
              ],
              isError: true,
            }
          }

          // 2) Kits do projeto (assets/*/kit.json) + overlay da fase.
          const kits = await loadKits(projectRoot)
          const overlayRel = overlay ?? 'assets/scene-data.json'
          const overlayPath = join(projectRoot, overlayRel)
          const ov = existsSync(overlayPath) ? await readJson<SceneFileV1>(overlayPath) : null

          // 3) Regras aprendidas do projeto como default; parâmetro explícito vence.
          const rules = await loadValidationRules(projectRoot)

          // 4) Valida e grava o relatório completo em disco (contexto enxuto).
          const report = validateScene(defs, {
            kit: kits,
            overlay: ov,
            maxGap: maxGap ?? rules?.thresholds?.maxGap,
            maxRise: maxRise ?? rules?.thresholds?.maxRise,
            maxPenetration: rules?.thresholds?.maxPenetration,
            severity: rules?.severity,
          })
          const outDir = join(projectRoot, '.cortex', 'validation')
          await mkdir(outDir, { recursive: true })
          const name = scenePaths.length === 1 ? basename(scenePaths[0]!, '.json') : 'cena'
          const reportRel = `.cortex/validation/${name}.json`
          await writeFile(
            join(projectRoot, reportRel),
            JSON.stringify({ scenes: scenePaths, overlay: ov ? overlayRel : null, kits: kits.map((k) => k.name), ...report }, null, 2),
          )

          let text = formatReport(name, report, reportRel)
          if (rules) text += `\nRegras aprendidas do projeto aplicadas (${VALIDATION_RULES_REL}): ${describeRules(rules)}.`
          if (invalid.length) text += `\nAviso: parse falhou em ${invalid.join(', ')} (não validadas).`
          if (kits.length === 0) {
            text += '\nAviso: nenhum kit.json em assets/*/ — cobertura reduzida (só primitivas/terreno têm bbox).'
          }
          return { content: [{ type: 'text' as const, text }] }
        },
      ),
    ],
  })
}
