/**
 * O veredito do `drawShadowPass` no contrato da SPEC-0690: status do desenho, contagens do shim e o host antigo
 * (status não escrito = 0, regra de antes: `drawn === 0` é recusa).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Object3D, OrthographicCamera, Vector3 } from 'three';
import { NativeSceneMirror } from '../../../src/core/NativeSceneMirror.js';
import {
  GATE_OUT_EXCLUDED,
  GATE_OUT_FIRST_OFFENDER,
  GATE_OUT_FLOATS,
  GATE_OUT_SKIPPED,
  GATE_OUT_STATUS,
  GATE_OUT_TOTAL_CASTERS,
  SHADOW_GATE_REASONS,
} from '../../../src/core/sceneMirror/mirrorBridge.js';
import {
  GATE_STATUS_UNWRITTEN,
  prepareGateOut,
  readShadowPassOutcome,
  shadowPassAccepted,
} from '../../../src/core/sceneMirror/shadowPassOutcome.js';

/** `kShadowGateRefusalCount` do C++. */
const N = SHADOW_GATE_REASONS.length;
/** `kGateOutStatus` do host (SPEC-0690). */
/** O que o host escreve no slot: o código de `ShadowPassStatus` + 1 (o 0 é "nada escrito"). */
const STATUS = { ok: 1, clearedEmpty: 2, notReady: 3, refused: 4, skipped: 5 } as const;
const INSTANCED = SHADOW_GATE_REASONS.indexOf('instanced');
const SKINNED = SHADOW_GATE_REASONS.indexOf('skinned');

/** O vetor como o host o devolve: armado pelo JS e depois escrito. */
function saida(escrever: (out: Float64Array) => void = () => undefined): Float64Array {
  const out = new Float64Array(GATE_OUT_FLOATS);
  prepareGateOut(out);
  escrever(out);
  return out;
}

describe('vetor de saída do gate (SPEC-0690)', () => {
  it('as posições novas vêm DEPOIS das antigas e o enum do gate não muda', () => {
    expect(GATE_OUT_TOTAL_CASTERS).toBe(N + 1);
    expect(GATE_OUT_FIRST_OFFENDER).toBe(N + 2);
    expect(GATE_OUT_SKIPPED).toBe(N + 3);
    expect(GATE_OUT_EXCLUDED).toBe(N + 4);
    expect(GATE_OUT_STATUS).toBe(N + 5);
    expect(GATE_OUT_FLOATS).toBe(N + 6);
    // O JS indexa os motivos pelo código do C++: 'skinned' continua no lugar, só não é mais produzido.
    expect(SKINNED).toBe(3);
  });

  it('prepareGateOut zera as contagens novas e marca o status como não escrito', () => {
    const out = new Float64Array(GATE_OUT_FLOATS).fill(7);
    prepareGateOut(out);
    expect(out[GATE_OUT_SKIPPED]).toBe(0);
    expect(out[GATE_OUT_EXCLUDED]).toBe(0);
    expect(out[GATE_OUT_STATUS]).toBe(GATE_STATUS_UNWRITTEN);
    expect(out[GATE_OUT_TOTAL_CASTERS]).toBe(7);
  });
});

describe('readShadowPassOutcome (SPEC-0690)', () => {
  it('ok: aceito, com os casters desenhados e os excluídos (skinned) contados', () => {
    const r = readShadowPassOutcome(12, saida((o) => {
      o[GATE_OUT_STATUS] = STATUS.ok;
      o[GATE_OUT_EXCLUDED] = 2;
      o[GATE_OUT_TOTAL_CASTERS] = 14;
    }), []);
    expect(r).toMatchObject({ drawn: 12, refused: false, reason: 'aceito', totalCasters: 14 });
    expect(r.status).toBe('ok');
    expect(r.excluded).toBe(2);
    expect(r.skipped).toBe(0);
    expect(shadowPassAccepted(r)).toBe(true);
  });

  it('cleared-empty é aceito com 0 desenhados (cascata vazia: o alvo foi limpo)', () => {
    const r = readShadowPassOutcome(0, saida((o) => (o[GATE_OUT_STATUS] = STATUS.clearedEmpty)), []);
    expect(r.status).toBe('cleared-empty');
    expect(r.refused).toBe(false);
    expect(shadowPassAccepted(r)).toBe(true);
  });

  it('not-ready é recusa com motivo nao-pronto', () => {
    const r = readShadowPassOutcome(0, saida((o) => (o[GATE_OUT_STATUS] = STATUS.notReady)), []);
    expect(r).toMatchObject({ drawn: 0, refused: true, reason: 'nao-pronto' });
    expect(r.status).toBe('not-ready');
    expect(shadowPassAccepted(r)).toBe(false);
  });

  it('skipped é recusa com motivo descartado e a contagem do shim', () => {
    const r = readShadowPassOutcome(0, saida((o) => {
      o[GATE_OUT_STATUS] = STATUS.skipped;
      o[GATE_OUT_SKIPPED] = 3;
    }), []);
    expect(r).toMatchObject({ refused: true, reason: 'descartado' });
    expect(r.status).toBe('skipped');
    expect(r.skipped).toBe(3);
    expect(shadowPassAccepted(r)).toBe(false);
  });

  it('refused sem código do gate (sem alvo) é recusa com motivo sem-alvo', () => {
    const r = readShadowPassOutcome(0, saida((o) => (o[GATE_OUT_STATUS] = STATUS.refused)), []);
    expect(r).toMatchObject({ refused: true, reason: 'sem-alvo' });
    expect(r.status).toBe('refused');
  });

  it('recusa do gate: motivo pelo código, ofensor pelo slot e as contagens por motivo', () => {
    const ofensor = new Object3D();
    const r = readShadowPassOutcome(-INSTANCED, saida((o) => {
      o[INSTANCED] = 4;
      o[GATE_OUT_FIRST_OFFENDER] = 2;
      o[GATE_OUT_TOTAL_CASTERS] = 9;
      o[GATE_OUT_STATUS] = STATUS.refused;
    }), [undefined, undefined, ofensor]);
    expect(r).toMatchObject({ drawn: 0, refused: true, reason: 'instanced', totalCasters: 9, counts: 'instanced=4' });
    expect(r.offender).toBe(ofensor);
    expect(r.status).toBe('refused');
    expect(shadowPassAccepted(r)).toBe(false);
  });

  it('host antigo (status 0): sem os campos novos, e vale a regra de antes', () => {
    const desenhou = readShadowPassOutcome(5, saida(), []);
    expect(desenhou).toEqual({ drawn: 5, refused: false, reason: 'aceito', totalCasters: 0 });
    expect(shadowPassAccepted(desenhou)).toBe(true);
    const vazio = readShadowPassOutcome(0, saida(), []);
    expect(vazio.status).toBeUndefined();
    expect(vazio.refused).toBe(false);
    expect(shadowPassAccepted(vazio)).toBe(false);
  });

  it('status desconhecido é tratado como host antigo', () => {
    const r = readShadowPassOutcome(0, saida((o) => (o[GATE_OUT_STATUS] = 99)), []);
    expect(r.status).toBeUndefined();
    expect(shadowPassAccepted(r)).toBe(false);
  });

  it('os campos novos são campos normais: sobrevivem à cópia e o cleared-empty copiado continua aceito', () => {
    const r = readShadowPassOutcome(0, saida((o) => (o[GATE_OUT_STATUS] = STATUS.clearedEmpty)), []);
    expect(Object.keys(r)).toEqual(expect.arrayContaining(['skipped', 'excluded', 'status']));
    expect({ ...r }.status).toBe('cleared-empty');
    expect(shadowPassAccepted({ ...r })).toBe(true);
  });

  it('shadowPassAccepted aceita resultado sem status (mock/host antigo) pela regra de antes', () => {
    expect(shadowPassAccepted({ drawn: 3, refused: false })).toBe(true);
    expect(shadowPassAccepted({ drawn: 0, refused: false })).toBe(false);
    expect(shadowPassAccepted({ drawn: 3, refused: true })).toBe(false);
  });
});

describe('NativeSceneMirror.drawShadowPass e o contrato (SPEC-0690)', () => {
  /** Capacidade de nós da ponte falsa e floats por nó das matrizes/sync (folga sobre o layout real). */
  const NODES = 4;
  const FLOATS_PER_NODE = 16;

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexSceneMirror'];
  });

  it('manda o vetor com N+6 posições e o status em 0; host que não escreve fica sem status', () => {
    const visto = { tamanho: 0, status: 0 };
    (globalThis as Record<string, unknown>)['__cortexSceneMirror'] = {
      build: () => true,
      worldMatrices: () => new Float64Array(NODES * FLOATS_PER_NODE),
      syncBuffer: () => new Float64Array(NODES * FLOATS_PER_NODE),
      update: (changed: number) => changed,
      drawShadowPass: (...args: unknown[]) => {
        const out = args[args.length - 1] as Float64Array;
        visto.tamanho = out.length;
        visto.status = out[GATE_OUT_STATUS]!;
        return 4;
      },
    };
    const espelho = new NativeSceneMirror();
    espelho.install(new Object3D());
    const r = espelho.drawShadowPass(
      new OrthographicCamera(), new Vector3(), 0, new Float64Array(FLOATS_PER_NODE), {}, -1, false,
    );
    expect(visto.tamanho).toBe(N + 6);
    expect(visto.status).toBe(GATE_STATUS_UNWRITTEN);
    expect(r?.status).toBeUndefined();
    expect(r && shadowPassAccepted(r)).toBe(true);
  });
});
