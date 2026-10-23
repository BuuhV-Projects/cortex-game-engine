/**
 * Instrumento de paridade na mesma execução (SPEC-0362).
 *
 * O DDD 61 não tem `?bench&hold`: NPCs, trânsito e trens tornam a captura
 * entre execuções não determinística. Com `?parityFreeze=<s>`, depois de `<s>`
 * segundos de jogo o `Game` para de atualizar (mundo, `onUpdate`, UI) e só
 * desenha, e o DESENHO do passe principal alterna a cada quadro entre o
 * caminho nativo (desenho direto + lote em C++) e o do `three`. A projeção
 * fica nativa nos dois: trocá-la a cada quadro trava o host (SPEC-0362). A
 * captura da SPEC-0240 grava quadros consecutivos: N×N+1 é nativo×`three`,
 * N×N+2 é o ruído.
 */
import { debug } from '../core/debug.js';

const QUERY_KEY = 'parityFreeze=';
const MS_PER_SECOND = 1000;

/** Lido pelos caminhos do passe principal: `three` = devolver tudo ao `three`. */
export const mainPassArm = { three: false };

/** Segundos de jogo antes de congelar; 0 = desligado. */
export function parityFreezeSeconds(): number {
  try {
    if (typeof location === 'undefined') return 0;
    const search = location.search ?? '';
    const at = search.indexOf(QUERY_KEY);
    if (at < 0) return 0;
    const seconds = Number.parseFloat(search.slice(at + QUERY_KEY.length));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  } catch {
    return 0;
  }
}

/** Decide, por quadro, se o jogo atualiza; congelado, alterna o braço. */
export class ParityFreeze {
  private _startMs = -1;
  private _frozen = false;

  constructor(private readonly _seconds: number) {}

  /** `false` = congelado (não chamar o `_update`). `gameplay` = cena do jogo no ar. */
  shouldUpdate(nowMs: number, gameplay: boolean): boolean {
    if (this._frozen) {
      mainPassArm.three = !mainPassArm.three;
      return false;
    }
    if (!gameplay) return true;
    if (this._startMs < 0) this._startMs = nowMs;
    if (nowMs - this._startMs < this._seconds * MS_PER_SECOND) return true;
    this._frozen = true;
    debug('perf', `[parityFreeze] congelado aos ${this._seconds}s de jogo; alternando nativo/three por quadro`);
    return false;
  }
}
