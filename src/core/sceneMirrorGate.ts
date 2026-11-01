/** Estado que decide se o espelho de cena do host pode ser instalado neste quadro. */
export interface SceneMirrorGateState {
  /** Já tentou instalar (a árvore não cresce depois: uma tentativa só). */
  tried: boolean;
  /** `game.setLoading(true)` ativo. */
  loading: boolean;
  /** Quadro de aquecimento do `precompile` (SPEC-0653). */
  warmup: boolean;
  /** A cena ainda está em montagem (`buildScene` cedendo quadros). */
  building: boolean;
  /** O host tem a ponte `__cortexSceneMirror`. */
  available: boolean;
}

/**
 * O espelho nasce com a cena pronta: nunca no meio da montagem, nem durante a carga declarada — exceto no quadro de
 * aquecimento, que roda sob `setLoading(true)` de propósito e sem o espelho ia todo pelo three (SPEC-0653).
 */
export function canInstallSceneMirror(s: SceneMirrorGateState): boolean {
  return !s.tried && s.available && !s.building && (!s.loading || s.warmup);
}
