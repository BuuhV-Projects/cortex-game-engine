/**
 * **Cessão de frame durante cargas longas** (ADR-0218 / SPEC-0219).
 *
 * No host nativo o `fetch` é síncrono, então uma carga escrita com `await`
 * resolve tudo em microtasks e **nunca devolve o controle ao host** — o loop
 * não gira, a splash não aparece e a tela fica preta até o fim. Ceder o frame
 * de tempos em tempos resolve isso.
 *
 * Ceder tem custo: enquanto a splash está no ar, todo frame cedido faz
 * `present` e paga vsync (~16 ms). Por isso a cessão é por **orçamento de
 * tempo** ({@link FrameBudget}), não por item — ceder a cada nó carregado
 * serializaria a carga inteira no vsync.
 *
 * @example
 * ```ts
 * const budget = new FrameBudget();
 * for (const item of itens) {
 *   await carrega(item);
 *   await budget.maybeYield(); // cede no máximo ~10x por segundo
 * }
 * ```
 */

/** Fatia de trabalho entre duas cessões. Ver ADR-0218 (por que não é por item). */
const DEFAULT_BUDGET_MS = 100;

/** Há `requestAnimationFrame`? (Node e testes não têm — não há frame a ceder.) */
function canYield(): boolean {
  return typeof requestAnimationFrame === 'function';
}

/**
 * Cede o controle até o próximo frame. Sem `requestAnimationFrame` (Node,
 * testes) resolve na hora, sem esperar nada.
 */
export function nextFrame(): Promise<void> {
  if (!canYield()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Orçamento de tempo entre cessões: `maybeYield()` só cede o frame quando já
 * passou `budgetMs` desde a última cessão.
 *
 * Um orçamento por carga (não global): duas cargas concorrentes não roubam a
 * fatia uma da outra, e o estado morre junto com a carga.
 */
export class FrameBudget {
  private _last = Date.now();

  /**
   * @param budgetMs - Trabalho entre cessões, em ms. @default 100
   */
  constructor(private readonly budgetMs: number = DEFAULT_BUDGET_MS) {}

  /** Já passou do orçamento? (sem ceder — para decidir se vale reportar progresso) */
  get expired(): boolean {
    return Date.now() - this._last >= this.budgetMs;
  }

  /**
   * Cede o frame **se** o orçamento estourou; senão devolve sem esperar.
   *
   * @returns Promessa que resolve no próximo frame (ou já resolvida).
   */
  async maybeYield(): Promise<void> {
    if (!this.expired) return;
    await nextFrame();
    this._last = Date.now();
  }

  /** Reinicia a contagem (ex.: depois de uma etapa que já cedeu por conta). */
  reset(): void {
    this._last = Date.now();
  }
}

/**
 * Orçamento COMPARTILHADO do engine, com fatia ADAPTATIVA.
 *
 * O frame é um recurso global — se o build da cena e o carregamento de assets
 * tivessem cada um o seu orçamento, dois pontos de cessão seguidos gastariam
 * dois frames onde um basta. E a fatia certa depende de quem está na tela:
 *
 * - **splash no ar**: ela é uma ANIMAÇÃO (fade in/hold/fade out) e o host a
 *   redesenha a cada frame cedido — com fatia grande ela engasga. Fatia curta.
 * - **tela de carregamento**: é estática. Ceder direto só paga present à toa;
 *   no kart-racer, ceder de 100 em 100 ms custava 1,1 s de carga. Fatia longa.
 */
const SPLASH_BUDGET_MS = 30;
const LOADING_BUDGET_MS = 120;

/**
 * A splash da engine (ADR-0109) ainda está na tela? Só é verdade no host
 * nativo — no browser não há splash. Enquanto ela está no ar o host DESCARTA o
 * frame do jogo (só ela apresenta), então desenhar qualquer coisa nesse período
 * é trabalho jogado fora.
 */
export function isSplashActive(): boolean {
  try {
    const fn = (globalThis as Record<string, unknown>)['__cortexSplashActive'];
    return typeof fn === 'function' ? Boolean((fn as () => boolean)()) : false;
  } catch {
    return false;
  }
}

function currentBudgetMs(): number {
  return isSplashActive() ? SPLASH_BUDGET_MS : LOADING_BUDGET_MS;
}

let _sharedLast = Date.now();

/**
 * Escopos de carregamento abertos. Ceder o frame só é BARATO enquanto o jogo
 * está carregando: aí o {@link Game} desenha uma cena vazia no lugar do
 * cenário. Fora de um escopo, cada frame cedido renderizaria a cena inteira —
 * no kart-racer isso triplicou a criação dos carros (2,6 s → 8 s).
 */
let _loadingScopes = 0;

/** Há um carregamento declarado em andamento? */
export function inLoadingScope(): boolean {
  return _loadingScopes > 0;
}

/** Abre um escopo de carregamento (use com {@link endLoadingScope} num `finally`). */
export function beginLoadingScope(): void {
  _loadingScopes++;
}

/** Fecha um escopo de carregamento. */
export function endLoadingScope(): void {
  if (_loadingScopes > 0) _loadingScopes--;
}

/** O orçamento compartilhado estourou? (sem ceder) */
export function frameBudgetExpired(): boolean {
  return Date.now() - _sharedLast >= currentBudgetMs();
}

/**
 * Cede o frame se o orçamento estourou **e** há um carregamento em andamento.
 * Fora de um escopo de carga não cede nada: ver {@link inLoadingScope}.
 */
export async function yieldOnBudget(): Promise<void> {
  if (_loadingScopes === 0 || !frameBudgetExpired()) return;
  await nextFrame();
  _sharedLast = Date.now();
}

/** Reinicia o orçamento compartilhado (quem já cedeu por conta própria). */
export function resetFrameBudget(): void {
  _sharedLast = Date.now();
}
