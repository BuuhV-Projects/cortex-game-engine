/**
 * O veredito do `drawShadowPass` lido do vetor de saída do host (SPEC-0245, SPEC-0690). Saiu do
 * `NativeSceneMirror.ts` pela regra de 500 linhas (SPEC-0668).
 *
 * O contrato com o C++ (`scene_mirror_shadow_shim.cpp`, SPEC-0690):
 *
 * - retorno `< 0` = `-(código do gate)`: o gate recusou, e o motivo é `SHADOW_GATE_REASONS[código]`;
 * - retorno `>= 0` = casters desenhados, e o status do desenho vem em `GATE_OUT_STATUS` (`refused` aqui = sem alvo);
 * - o slot de status leva o código + 1 (`shadowStatusSlot` no C++), e o JS escreve 0 nele antes da chamada. Se
 *   continuar 0 (host anterior à SPEC-0690, ou um vetor zerado), `skipped`,
 *   `excluded` e `status` ficam ausentes e vale a regra antiga (`drawn === 0` é recusa).
 */
import type { Object3D } from 'three';
import {
  GATE_OUT_EXCLUDED,
  GATE_OUT_FIRST_OFFENDER,
  GATE_OUT_POSITION_FORMAT,
  GATE_OUT_SKIPPED,
  GATE_OUT_STATUS,
  GATE_OUT_TOTAL_CASTERS,
  SHADOW_GATE_REASONS,
  gateOutCountSlot,
  type ShadowPassOutcome,
  type ShadowPassReason,
  type ShadowPassStatus,
} from './mirrorBridge.js';

/** O status que o JS escreve antes da chamada: se voltar assim, o host não conhece a SPEC-0690. */
export const GATE_STATUS_UNWRITTEN = 0;
/** O host escreve o código + 1 (`kStatusSlotOffset`): o 0 fica para "nada escrito". */
export const GATE_STATUS_SLOT_OFFSET = 1;

/** `kGateOutStatus` do host, na ordem do C++ (o índice É o código); código desconhecido = host antigo. */
const HOST_STATUSES: readonly ShadowPassStatus[] = ['ok', 'cleared-empty', 'not-ready', 'refused', 'skipped'];

/** Motivo de cada status de desenho recusado (o gate tem os dele). */
const DRAW_REFUSAL_REASONS: Partial<Record<ShadowPassStatus, ShadowPassReason>> = {
  'not-ready': 'nao-pronto',
  skipped: 'descartado',
  refused: 'sem-alvo',
};

/** Arma o vetor para a próxima chamada: zera as contagens novas e marca o status como não escrito. */
export function prepareGateOut(out: Float64Array): void {
  out[GATE_OUT_SKIPPED] = 0;
  out[GATE_OUT_EXCLUDED] = 0;
  out[GATE_OUT_STATUS] = GATE_STATUS_UNWRITTEN;
  // Host anterior ao ADR-0692 não escreve este slot: sem zerar, valeria a contagem da chamada anterior.
  out[GATE_OUT_POSITION_FORMAT] = 0;
}

/**
 * Monta o resultado a partir do retorno e do vetor de saída.
 *
 * @param nodes - Os nós do espelho por slot, para achar o ofensor da recusa do gate.
 */
export function readShadowPassOutcome(
  response: number,
  out: Float64Array,
  nodes: readonly (Object3D | undefined)[],
): ShadowPassOutcome {
  const totalCasters = out[GATE_OUT_TOTAL_CASTERS] ?? 0;
  const code = out[GATE_OUT_STATUS] ?? GATE_STATUS_UNWRITTEN;
  // Host antigo deixa o 0: os campos da SPEC-0690 ficam ausentes (`undefined`), e o resultado tem a forma de antes.
  const status = code === GATE_STATUS_UNWRITTEN ? undefined : HOST_STATUSES[code - GATE_STATUS_SLOT_OFFSET];
  const drawFields = status === undefined
    ? {}
    : { skipped: out[GATE_OUT_SKIPPED] ?? 0, excluded: out[GATE_OUT_EXCLUDED] ?? 0, status };
  if (response < 0) {
    const reason = SHADOW_GATE_REASONS[-response] ?? 'geometria-ausente';
    // Host antigo não escreve o slot (fica 0, que é a cena): só confia em >0.
    const ofensor = out[GATE_OUT_FIRST_OFFENDER] ?? -1;
    const offender = ofensor > 0 ? nodes[ofensor] : undefined;
    const partes: string[] = [];
    for (let i = 1; i < SHADOW_GATE_REASONS.length; i++) {
      const n = out[gateOutCountSlot(i)] ?? 0;
      if (n > 0) partes.push(`${SHADOW_GATE_REASONS[i]}=${n}`);
    }
    return { drawn: 0, refused: true, reason, totalCasters, offender, counts: partes.join(' '), ...drawFields };
  }
  const refusal = status === undefined ? undefined : DRAW_REFUSAL_REASONS[status];
  return refusal !== undefined
    ? { drawn: response, refused: true, reason: refusal, totalCasters, ...drawFields }
    : { drawn: response, refused: false, reason: 'aceito', totalCasters, ...drawFields };
}

/**
 * O desenho vale? `ok` e `cleared-empty` (cascata vazia, alvo limpo) sim; em host antigo (sem status), só com
 * casters desenhados e sem recusa — a regra de antes da SPEC-0690.
 */
export function shadowPassAccepted(outcome: Pick<ShadowPassOutcome, 'drawn' | 'refused'> & { status?: ShadowPassStatus }): boolean {
  const status = outcome.status;
  if (status === 'ok' || status === 'cleared-empty') return true;
  if (status === undefined) return !outcome.refused && outcome.drawn > 0;
  return false;
}
