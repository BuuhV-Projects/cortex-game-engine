import { join } from 'path'
import { existsSync } from 'fs'
import { readFile, writeFile, mkdir } from 'fs/promises'

/**
 * **Regras de validação APRENDIDAS do projeto** (`.cortex/validation-rules.json`,
 * ADR-0115) — o destino DURÁVEL e determinístico das lições geométricas do ciclo
 * de aprendizado (ADR-0113). Antes, uma lição como "vão máximo neste jogo é 2.5u"
 * só existia como texto no scene-learnings.md e dependia do LLM lembrar de passar
 * `maxGap` na chamada; aqui ela vira DADO que o `validate_scene` carrega sozinho
 * em toda validação futura — regra aprendida não regride.
 *
 * O arquivo é do PROJETO (o pulo de cada jogo é diferente); promoção pra default
 * do engine é decisão humana (ADR + teste), nunca do agente.
 */

export type RuleSeverity = 'error' | 'warning' | 'off'

export interface RuleThresholds {
  /** Maior vão horizontal pulável (u). */
  maxGap?: number
  /** Maior subida entre plataformas vizinhas (u). */
  maxRise?: number
  /** Interpenetração acima disso é erro (u). */
  maxPenetration?: number
}

/** Registro de auditoria: de onde veio cada regra (lição aprovada pelo dev). */
export interface RuleLesson {
  date: string
  /** O que mudou (ex. `"maxGap 2.8 → 2.5"`). */
  patch: string
  /** Por que (a lição, como aprovada pelo dev). */
  motivo: string
  /** A checagem de regressão discriminou estado antigo × corrigido? */
  checked: boolean
}

export interface ValidationRules {
  version: 1
  thresholds?: RuleThresholds
  severity?: Record<string, RuleSeverity>
  lessons?: RuleLesson[]
}

export const VALIDATION_RULES_REL = '.cortex/validation-rules.json'

const THRESHOLD_KEYS = ['maxGap', 'maxRise', 'maxPenetration'] as const
const SEVERITIES = new Set<string>(['error', 'warning', 'off'])

/** Parse defensivo: ignora campos malformados em vez de derrubar a validação. */
export function parseValidationRules(raw: unknown): ValidationRules | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const rules: ValidationRules = { version: 1 }

  const t = o['thresholds']
  if (t && typeof t === 'object') {
    const thresholds: RuleThresholds = {}
    for (const key of THRESHOLD_KEYS) {
      const v = (t as Record<string, unknown>)[key]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) thresholds[key] = v
    }
    if (Object.keys(thresholds).length) rules.thresholds = thresholds
  }

  const s = o['severity']
  if (s && typeof s === 'object') {
    const severity: Record<string, RuleSeverity> = {}
    for (const [rule, v] of Object.entries(s as Record<string, unknown>)) {
      if (typeof v === 'string' && SEVERITIES.has(v)) severity[rule] = v as RuleSeverity
    }
    if (Object.keys(severity).length) rules.severity = severity
  }

  if (Array.isArray(o['lessons'])) {
    rules.lessons = (o['lessons'] as unknown[]).filter(
      (l): l is RuleLesson =>
        !!l && typeof l === 'object' && typeof (l as RuleLesson).patch === 'string',
    )
  }
  return rules
}

export async function loadValidationRules(projectRoot: string): Promise<ValidationRules | null> {
  const path = join(projectRoot, VALIDATION_RULES_REL)
  if (!existsSync(path)) return null
  try {
    return parseValidationRules(JSON.parse(await readFile(path, 'utf-8')))
  } catch {
    return null
  }
}

export async function saveValidationRules(projectRoot: string, rules: ValidationRules): Promise<void> {
  await mkdir(join(projectRoot, '.cortex'), { recursive: true })
  await writeFile(join(projectRoot, VALIDATION_RULES_REL), JSON.stringify(rules, null, 2))
}

/** Merge de um patch de regra sobre a base: thresholds/severity por chave; lições acumulam. */
export function mergeValidationRules(
  base: ValidationRules | null,
  patch: { thresholds?: RuleThresholds; severity?: Record<string, RuleSeverity> },
  lesson: RuleLesson,
): ValidationRules {
  const merged: ValidationRules = {
    version: 1,
    thresholds: { ...base?.thresholds, ...patch.thresholds },
    severity: { ...base?.severity, ...patch.severity },
    lessons: [...(base?.lessons ?? []), lesson],
  }
  if (!Object.keys(merged.thresholds!).length) delete merged.thresholds
  if (!Object.keys(merged.severity!).length) delete merged.severity
  return merged
}

/** Descreve o patch em uma linha ("maxGap 2.8 → 2.5; gap: warning → error"). */
export function describeRulePatch(
  base: ValidationRules | null,
  patch: { thresholds?: RuleThresholds; severity?: Record<string, RuleSeverity> },
): string {
  const parts: string[] = []
  for (const key of THRESHOLD_KEYS) {
    const v = patch.thresholds?.[key]
    if (v !== undefined) parts.push(`${key} ${base?.thresholds?.[key] ?? 'default'} → ${v}`)
  }
  for (const [rule, v] of Object.entries(patch.severity ?? {})) {
    parts.push(`${rule}: ${base?.severity?.[rule] ?? 'default'} → ${v}`)
  }
  return parts.join('; ') || '(sem mudança)'
}
