/**
 * Spike do M5 (SPEC-0241, passo 0) — TEMPORÁRIO, sai depois de decidir.
 *
 * Responde a pergunta que decide o marco: o C++ consegue desenhar no alvo real
 * do `three` e devolver o controle para ele terminar o frame na mesma textura,
 * sem corromper estado?
 *
 * O experimento é montado para que **um único pixel** responda às três
 * perguntas, variando só a profundidade do marcador:
 *
 * - `perto` — o marcador é desenhado colado na câmera. O pixel do centro tem de
 *   ficar MAGENTA depois que o `three` desenhar por cima: prova que o desenho
 *   nativo sobrevive (o `three` não limpou) e que a profundidade escrita pelo
 *   C++ barra a geometria do `three`.
 * - `longe` — o mesmo marcador vai para o fundo. O pixel do centro tem de
 *   voltar a ser a cor da CENA: prova que o teste de profundidade é respeitado
 *   nos dois sentidos, e não que o C++ simplesmente pinta por cima.
 * - `desligado` — linha de base: a cor da cena naquele pixel, sem spike.
 *
 * O pixel de borda é controle: o marcador nunca o cobre, então ele tem de ser
 * igual nos três casos.
 */
import { debug } from '../core/debug.js';

/** Profundidade em NDC que põe o marcador colado na câmera. */
const PROFUNDIDADE_PERTO = 0;
/** Profundidade em NDC que põe o marcador no fundo da cena. */
const PROFUNDIDADE_LONGE = 1;
/** Quantos frames observar antes de concluir — pega degradação, não só o 1º. */
const FRAMES_OBSERVADOS = 10;
/** Frações da tela onde os pixels são lidos. */
const FRACAO_CENTRO = 0.5;
const FRACAO_BORDA = 0.06;
/** Canal e limiar que caracterizam o magenta do marcador. */
const LIMIAR_CANAL_ALTO = 0.5;
const LIMIAR_CANAL_BAIXO = 0.25;

export type ModoDoSpike = 'perto' | 'longe' | 'depois' | 'depois-longe' | 'desligado';

interface PonteDoSpike {
  drawMarker(cor: unknown, profundidade: unknown, ndc: number, limpar: boolean): boolean;
  readPixel(cor: unknown, x: number, y: number): number[] | null;
}

interface BackendDoThree {
  get(alvo: unknown): { texture?: unknown; depthTexture?: unknown } | undefined;
}

function ponte(): PonteDoSpike | null {
  const g = globalThis as unknown as { __cortexDualPassSpike?: PonteDoSpike };
  return g.__cortexDualPassSpike ?? null;
}

/** `true` quando o host expõe o spike — no Studio/browser ele não existe. */
export function spikeDisponivel(): boolean {
  const disponivel = ponte() !== null;
  const busca = typeof location === 'undefined' ? '(sem location)' : (location.search ?? '');
  debug('spike-m5', `ponte=${disponivel ? 'sim' : 'nao'} modo=${modoDoSpike()} busca="${busca}"`);
  return disponivel;
}

/** Lê o modo da query de lançamento (`?dualPassSpike=perto`). */
export function modoDoSpike(): ModoDoSpike {
  if (typeof location === 'undefined') return 'desligado';
  try {
    const valor = new URLSearchParams(location.search ?? '').get('dualPassSpike');
    if (valor === 'perto' || valor === 'longe' || valor === 'depois' || valor === 'depois-longe') {
      return valor;
    }
  } catch {
    return 'desligado';
  }
  return 'desligado';
}

function classificar(canais: number[] | null): string {
  if (!canais) return 'ilegivel';
  const [r, g, b] = canais;
  const ehMagenta =
    r > LIMIAR_CANAL_ALTO && b > LIMIAR_CANAL_ALTO && g < LIMIAR_CANAL_BAIXO;
  return ehMagenta ? 'MARCADOR' : 'cena';
}

function formatar(canais: number[] | null): string {
  if (!canais) return 'null';
  return canais.map((c) => c.toFixed(3)).join(', ');
}

/**
 * Observa o experimento por alguns frames e relata. Mantém estado próprio para
 * poder comparar o primeiro frame com o último — é assim que vazamento de
 * estado entre frames aparece.
 */
export class DualPassSpike {
  private _frame = 0;
  private _primeiro: string | null = null;
  private _concluido = false;
  private _faltaAlvoRelatada = false;
  private _alvosRelatados = false;
  private _amostrasRelatadas = false;
  private _hdrRelatado = false;
  private _depoisRelatado = false;
  private _faltaHdrRelatada = false;

  constructor(private readonly _modo: ModoDoSpike) {}

  /**
   * Desenha o marcador no alvo do `three`, ANTES de ele renderizar. Devolve
   * `true` se o marcador foi desenhado (e portanto o chamador NÃO deve limpar o
   * alvo — quem limpou foi o C++, que é justamente o ponto do experimento).
   */
  desenharAntesDoThree(renderer: unknown, backend: BackendDoThree, alvo: unknown): boolean {
    const api = ponte();
    if (!api || this._modo === 'desligado') return false;
    const texturaCor = backend.get((alvo as { texture: unknown }).texture)?.texture;
    // A profundidade de um render target NÃO mora no mapa do backend: quem a
    // aloca é o `Textures`, que tem mapa próprio (ele também estende DataMap).
    // Procurar no backend devolve `undefined` em silêncio — foi o que fez o
    // marcador nunca entrar no caminho do jogo na primeira medição.
    const textures = (renderer as { _textures?: { get(alvo: unknown): { depthTexture?: unknown } } })
      ._textures;
    const profundidadeDoAlvo = textures?.get(alvo)?.depthTexture;
    if (!texturaCor || !profundidadeDoAlvo) {
      if (!this._faltaHdrRelatada) {
        this._faltaHdrRelatada = true;
        debug(
          'spike-m5',
          `HDR: alvo incompleto (cor=${texturaCor ? 'ok' : 'falta'} ` +
            `profundidade=${profundidadeDoAlvo ? 'ok' : 'falta'})`,
        );
      }
      return false;
    }
    const texturaProfundidade = backend.get(profundidadeDoAlvo)?.texture;
    if (!texturaProfundidade) return false;

    if (!this._hdrRelatado) {
      this._hdrRelatado = true;
      debug('spike-m5', 'HDR: alvo do jogo resolvido — marcador entra no caminho real');
    }
    const ndc = this._modo === 'perto' ? PROFUNDIDADE_PERTO : PROFUNDIDADE_LONGE;
    return api.drawMarker(texturaCor, texturaProfundidade, ndc, true);
  }

  /**
   * Variante para o caminho da canvas (o que o jogo usa quando não há
   * pós-processamento). A cor é o offscreen do host, que o C++ já tem; aqui só
   * se resolve a textura de profundidade, que pertence ao `three` e vive no
   * contexto de render da canvas.
   */
  desenharNaCanvas(renderer: unknown): boolean {
    const api = ponte();
    if (!api || this._modo === 'desligado' || this._modo.startsWith('depois')) return false;
    const alvos = this._alvosDaCanvas(renderer);
    if (!alvos) {
      if (!this._faltaAlvoRelatada) {
        this._faltaAlvoRelatada = true;
        debug('spike-m5', 'canvas: nao consegui resolver cor/profundidade do three');
      }
      return false;
    }
    // O `three` apaga o alvo mesmo com `autoClear = false`: quem decide o
    // `loadOp` é `autoClearColor`/`autoClearDepth`, que são propriedades
    // SEPARADAS e continuam ligadas. Sem desligá-las, o desenho do C++ some —
    // foi exatamente o que a primeira medição mostrou.
    const r = renderer as { autoClearColor?: boolean; autoClearDepth?: boolean };
    r.autoClearColor = false;
    r.autoClearDepth = false;
    if (!this._alvosRelatados) {
      this._alvosRelatados = true;
      debug('spike-m5', 'canvas: alvo resolvido; autoClearColor/Depth desligados');
    }
    const ndc = this._modo === 'perto' ? PROFUNDIDADE_PERTO : PROFUNDIDADE_LONGE;
    return api.drawMarker(alvos.cor, alvos.profundidade, ndc, true);
  }

  /**
   * No caminho da canvas NÃO se lê pixel de dentro do frame: o readback é
   * síncrono (bombeia a fila até o mapeamento completar) e, no meio do frame do
   * `three`, trava o laço. A observação aqui é só de contagem; quem julga a
   * imagem é uma captura da janela, por fora.
   */
  observarNaCanvas(renderer?: unknown): void {
    // Modo `depois`: desenha o marcador DEPOIS do `three`, sem limpar. Serve
    // para separar duas hipóteses quando o marcador não aparece — se ele surge
    // aqui e não no modo `perto`, o alvo está certo e quem o apaga é o `three`.
    if (!this._modo.startsWith('depois')) return;
    const api = ponte();
    if (!api || renderer === undefined) return;
    const alvos = this._alvosDaCanvas(renderer);
    if (!alvos) return;
    // `depois-longe` é o teste DECISIVO da ordem que o M5 vai usar: desenhado
    // depois, mas no FUNDO. Se o depth test entre as duas passes valer, a
    // geometria do `three` tapa o marcador; se não valer, ele aparece por cima
    // e a oclusão entre os dois motores estaria quebrada.
    const ndc = this._modo === 'depois-longe' ? PROFUNDIDADE_LONGE : PROFUNDIDADE_PERTO;
    api.drawMarker(alvos.cor, alvos.profundidade, ndc, false);
    if (!this._depoisRelatado) {
      this._depoisRelatado = true;
      debug('spike-m5', `canvas: marcador DEPOIS do three (ndc=${ndc}, sem limpar)`);
    }
  }

  /**
   * A profundidade da canvas mora no contexto de render que o `three` monta
   * para o alvo nulo. É estado interno dele, então o acesso é explicitamente
   * defensivo: se a forma mudar numa atualização, o spike se desliga em vez de
   * quebrar o frame.
   */
  private _alvosDaCanvas(
    renderer: unknown,
  ): { cor: unknown; profundidade: unknown } | null {
    const r = renderer as {
      currentSamples?: number;
      backend?: {
        textureUtils?: {
          getColorBuffer(): unknown;
          getDepthBuffer(depth?: boolean, stencil?: boolean): unknown;
        };
      };
    };
    const utils = r.backend?.textureUtils;
    if (!utils) return null;
    // O alvo de cor do `three` MUDA conforme o antialias:
    //  - com amostras > 0 ele desenha num buffer MULTIAMOSTRA e só resolve para
    //    a textura da canvas no fim da pass (desenhar na canvas seria apagado
    //    pelo resolve);
    //  - sem amostras ele desenha DIRETO na textura da canvas, e aí o buffer
    //    multiamostra existe mas não é usado por ninguém.
    // Escolher errado faz o marcador ir para uma textura que ninguém lê — foi o
    // que aconteceu na primeira medição, e por isso o pixel não mudava.
    const amostras = r.currentSamples ?? 0;
    // `null` quer dizer "a textura da canvas", que o host já tem em mãos.
    const cor = amostras > 0 ? utils.getColorBuffer() : null;
    const profundidade = utils.getDepthBuffer(true, false);
    if (!profundidade || (amostras > 0 && !cor)) return null;
    if (!this._amostrasRelatadas) {
      this._amostrasRelatadas = true;
      debug('spike-m5', `canvas: amostras=${amostras} (alvo=${cor ? 'multiamostra' : 'canvas'})`);
    }
    return { cor, profundidade };
  }

  private _relatar(centro: number[] | null, borda: number[] | null): void {
    this._frame += 1;
    const veredito = `centro=${classificar(centro)} borda=${classificar(borda)}`;
    if (this._frame === 1) this._primeiro = veredito;
    debug(
      'spike-m5',
      `modo=${this._modo} frame=${this._frame} ${veredito} ` +
        `centroRgba=(${formatar(centro)}) bordaRgba=(${formatar(borda)})`,
    );
    if (this._frame >= FRAMES_OBSERVADOS) {
      const estavel = this._primeiro === veredito;
      debug(
        'spike-m5',
        `RESULTADO modo=${this._modo} primeiro="${this._primeiro}" ` +
          `ultimo="${veredito}" estavel=${estavel ? 'SIM' : 'NAO'}`,
      );
      this._concluido = true;
    }
  }

  /**
   * Conta os frames em que o marcador entrou pelo caminho real. NÃO lê pixel:
   * o readback é síncrono e travaria o frame do `three`. Quem julga a imagem é
   * a captura da janela, por fora.
   */
  observarDepoisDoThree(): void {
    if (this._concluido || this._modo === 'desligado') return;
    this._frame += 1;
    if (this._frame >= FRAMES_OBSERVADOS) {
      debug('spike-m5', `RESULTADO modo=${this._modo}: marcador no caminho HDR por ${this._frame} frames`);
      this._concluido = true;
    }
  }
}
