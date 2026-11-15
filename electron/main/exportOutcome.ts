/**
 * Resultado do export a partir do código de saída e da saída do filho (SPEC-0741).
 *
 * O filho às vezes aborta no encerramento do Node DEPOIS de concluir o export
 * (Windows: "PostQueuedCompletionStatus: (6)"). Os dois marcadores abaixo só saem
 * depois da última etapa, então com eles o export está completo mesmo com código ≠ 0.
 */
const DONE_STEP_MARKER = /^\[export:step\]\s+done\s*$/m
const OK_MARKER = /^\[export\] OK → /m

export interface ExportOutcome {
  ok: boolean
  /** Código ≠ 0, mas depois dos marcadores de conclusão. */
  crashedAfterDone: boolean
}

export function exportOutcome(code: number | null, output: string): ExportOutcome {
  if (code === 0) return { ok: true, crashedAfterDone: false }
  const finished = DONE_STEP_MARKER.test(output) && OK_MARKER.test(output)
  return { ok: finished, crashedAfterDone: finished }
}

/** Linha que o Studio acrescenta à saída quando o filho caiu depois de concluir. */
export function crashAfterDoneNotice(code: number | null): string {
  return `[export] aviso: o processo de export fechou com código ${code} depois de concluir — o export está completo.\n`
}
