/**
 * Conta da barra de progresso do export (SPEC-0699) — pura, sem DOM, pra testar.
 */

/** Ordem das etapas exibidas (bate com as chaves `[export:step]` do script). */
export const STEPS = ['prepare', 'bundle', 'bytecode', 'runtime', 'assets'] as const
export type StepKey = (typeof STEPS)[number]

/**
 * Peso de cada etapa no percentual (soma 100). Estimativa do port-hollow: o cook
 * de texturas em `assets` é o grosso do tempo.
 */
export const STEP_WEIGHT: Record<StepKey, number> = {
  prepare: 1,
  bundle: 15,
  bytecode: 5,
  runtime: 1,
  assets: 78,
}

/** Detalhe dentro da etapa, como o script emite em `[export:progress] <json>`. */
export interface ExportDetail {
  phase: 'cook' | 'pack'
  done?: number
  total?: number
  file?: string
  tex?: [number, number]
}

/** Fração (0..1) da etapa `assets` já feita, segundo o detalhe. */
export function assetsFraction(d: ExportDetail): number {
  if (d.phase === 'pack') return 1
  const total = d.total ?? 0
  if (total <= 0) return 0
  const [i, n] = d.tex ?? [0, 0]
  // A textura i está EM CURSO: conta as i-1 anteriores como feitas.
  const inFile = n > 0 ? (i - 1) / n : 0
  return Math.min(1, ((d.done ?? 0) + inFile) / total)
}

/** Percentual (0..100) do export inteiro: etapas concluídas + fração da atual. */
export function overallPercent(step: StepKey, fraction = 0): number {
  let pct = 0
  for (const k of STEPS) {
    if (k === step) return pct + STEP_WEIGHT[k] * Math.max(0, Math.min(1, fraction))
    pct += STEP_WEIGHT[k]
  }
  return pct
}

/** Lê o payload `progress:<json>` do IPC. `null` se não for um detalhe válido. */
export function parseDetail(payload: string): ExportDetail | null {
  if (!payload.startsWith('progress:')) return null
  try {
    const d = JSON.parse(payload.slice('progress:'.length)) as ExportDetail
    return d.phase === 'cook' || d.phase === 'pack' ? d : null
  } catch {
    return null
  }
}
