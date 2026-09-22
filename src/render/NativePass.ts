/**
 * Passe nativo do render (SPEC-0241, passo 3).
 *
 * Escolhe quais malhas da cena o C++ desenha, registra a geometria delas uma
 * vez, e manda o lote por frame. O C++ desenha **depois** do `three`, na mesma
 * cor e na mesma profundidade — a ordem foi medida no passo 0 e é a única que
 * funciona: desenhar antes não sobrevive, porque o `three` limpa o alvo e o céu
 * dele cobre a tela.
 *
 * Enquanto o passe é experimental, quem migra é escolhido por query
 * (`?nativePass=N` migra as N primeiras malhas elegíveis), e o objeto migrado é
 * **escondido do `three`** — senão os dois desenhariam o mesmo objeto e não
 * haveria como saber qual apareceu.
 */
import type * as THREE from 'three';
import { debug } from '../core/debug.js';
import { describeMaterial, isDescribed } from './MaterialDesc.js';
import { geometryBuffers, geometryId } from './GeometryDesc.js';

/** Floats por item no lote: id + matriz de mundo + cor. */
const FLOATS_POR_ITEM = 1 + 16 + 4;
/** Floats de uma matriz 4x4. */
const FLOATS_DA_MATRIZ = 16;
/** Frames entre relatos, para ver se o passe segue vivo depois da carga. */
const FRAMES_ENTRE_RELATOS = 120;
/**
 * Sistema de coordenadas do `three` em que a profundidade vai de -1 a 1 (o do
 * WebGL). O WebGPU espera 0 a 1, e usar a matriz errada NÃO desenha nada torto:
 * projeta tudo no plano distante e o teste de profundidade rejeita o objeto
 * inteiro, em silêncio.
 */
const SISTEMA_WEBGL = 2000;

/** Cor provisória dos objetos migrados, enquanto não há sombreamento. */
const COR_PROVISORIA: readonly [number, number, number, number] = [0.85, 0.2, 0.75, 1];

interface PonteDoRegistro {
  register(
    id: number,
    vertexBuffer: unknown,
    indexBuffer: unknown,
    indexCount: number,
    vertexCount: number,
    indexIs32Bit: boolean,
    vertexStride: number,
    vertexOffset: number,
  ): boolean;
  size(): number;
}

interface PonteDoPasse {
  draw(
    alvoCor: unknown,
    alvoProfundidade: unknown,
    viewProfundidade: unknown,
    viewProjection: Float32Array,
    itens: Float32Array,
  ): number;
}

interface BackendDoThree {
  get(alvo: unknown): {
    buffer?: unknown;
    texture?: unknown;
    descriptor?: { depthStencilAttachment?: { view?: unknown } };
  } | undefined;
  textureUtils?: { getDepthBuffer(depth: boolean, stencil: boolean): unknown };
  renderer?: { getCanvasTarget(): unknown };
}

function registro(): PonteDoRegistro | null {
  return (globalThis as { __cortexGeometryRegistry?: PonteDoRegistro })
    .__cortexGeometryRegistry ?? null;
}

/**
 * `?nativePassControle=1` — modo de CONTROLE da medição (SPEC-0241).
 *
 * Escolhe as MESMAS malhas que seriam migradas, mas em vez de esconder do
 * `three` só desliga o `castShadow` delas e não desenha nada em C++. Serve de
 * linha de base: a perda de sombra é idêntica à do passe ligado, então o que
 * sobrar de diferença entre os dois é o ganho de submissão de verdade.
 */
export function soControle(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search ?? '').get('nativePassControle') === '1';
}

function passe(): PonteDoPasse | null {
  return (globalThis as { __cortexNativePass?: PonteDoPasse }).__cortexNativePass ?? null;
}

/** `true` quando o host expõe o passe — no Studio/browser não existe. */
export function nativePassDisponivel(): boolean {
  return registro() !== null && passe() !== null;
}

/** Quantas malhas migrar, lido de `?nativePass=N`. 0 = desligado. */
export function malhasAMigrar(): number {
  if (typeof location === 'undefined') return 0;
  try {
    const valor = new URLSearchParams(location.search ?? '').get('nativePass');
    if (valor === null) return 0;
    const n = Number.parseInt(valor, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

interface MalhaMigrada {
  mesh: THREE.Mesh;
  geometryId: number;
}

/**
 * Orquestra o passe. Guarda quem migrou para não repetir o registro por frame:
 * a geometria não muda, e re-registrar seria trabalho puro por frame — o mesmo
 * tipo de custo que esta migração existe para eliminar.
 */
export class NativePass {
  private readonly _migradas: MalhaMigrada[] = [];
  private _lote: Float32Array = new Float32Array(0);
  private readonly _viewProjection = new Float32Array(FLOATS_DA_MATRIZ);
  private _escolhido = false;
  private _frames = 0;
  private _viewRelatada = false;

  constructor(private readonly _limite: number) {}

  /** Quantas malhas o passe nativo assumiu. */
  get total(): number {
    return this._migradas.length;
  }

  /**
   * Escolhe as malhas elegíveis e registra a geometria delas. Roda uma vez, no
   * primeiro frame em que o `three` já subiu os buffers — antes disso não há o
   * que registrar.
   */
  private _escolher(cena: THREE.Object3D, backend: BackendDoThree): void {
    const api = registro();
    if (!api) return;

    cena.traverse((objeto) => {
      if (this._migradas.length >= this._limite) return;
      const malha = objeto as THREE.Mesh;
      if (!malha.isMesh || !malha.visible || Array.isArray(malha.material)) return;
      // Só migra o que a descrição aceita: material fora do subconjunto fica
      // com o `three`, que é o escape hatch do M1.
      const descricao = describeMaterial(malha.material as THREE.Material);
      if (!isDescribed(descricao) || descricao.blend !== 'opaque') return;

      const buffers = geometryBuffers(backend, malha.geometry);
      if (!buffers) return;  // o three ainda não subiu: tenta no próximo frame

      const id = geometryId(malha.geometry);
      const ok = api.register(
        id,
        buffers.vertexBuffer,
        buffers.indexBuffer,
        buffers.indexCount,
        buffers.vertexCount,
        buffers.indexIs32Bit,
        buffers.vertexStride,
        buffers.vertexOffset,
      );
      if (!ok) return;
      // Esconde do `three`: sem isto os dois desenhariam a mesma malha e a
      // medição não diria qual apareceu.
      //
      // ATENÇÃO: `visible = false` tira a malha de TODAS as passes do `three`,
      // inclusive o shadow map — e o passe nativo não redesenha sombra. Por
      // isso existe o modo de CONTROLE abaixo: ele só desliga `castShadow`,
      // deixando a malha na cena. Comparar os dois separa o ganho de submissão
      // do ganho por sombra que deixou de ser desenhada (SPEC-0241).
      if (soControle()) {
        malha.castShadow = false;
      } else {
        malha.visible = false;
      }
      this._migradas.push({ mesh: malha, geometryId: id });
    });

    if (this._migradas.length > 0) {
      this._escolhido = true;
      this._lote = new Float32Array(this._migradas.length * FLOATS_POR_ITEM);
    }
  }

  /** Monta o lote do frame a partir das matrizes atuais. */
  private _montarLote(): void {
    for (let i = 0; i < this._migradas.length; i++) {
      const base = i * FLOATS_POR_ITEM;
      const migrada = this._migradas[i]!;
      this._lote[base] = migrada.geometryId;
      // `matrixWorld` já está atualizada pelo `three` (ou pelo espelho nativo,
      // que escreve nos mesmos elementos).
      const elementos = migrada.mesh.matrixWorld.elements;
      for (let e = 0; e < FLOATS_DA_MATRIZ; e++) this._lote[base + 1 + e] = elementos[e]!;
      for (let c = 0; c < COR_PROVISORIA.length; c++) {
        this._lote[base + 1 + FLOATS_DA_MATRIZ + c] = COR_PROVISORIA[c]!;
      }
    }
  }

  /**
   * Desenha o lote. Chamar DEPOIS de `renderer.render(...)`, com a câmera já
   * atualizada. `alvoCor` nulo quer dizer "a textura da canvas", que o host já
   * tem em mãos.
   */
  desenhar(
    cena: THREE.Object3D,
    camera: THREE.Camera,
    renderer: unknown,
    alvoCor: unknown,
  ): number {
    const api = passe();
    const r = renderer as { backend?: BackendDoThree };
    const backend = r.backend;
    if (!api || !backend) return 0;

    if (!this._escolhido) {
      this._escolher(cena, backend);
      if (!this._escolhido) return 0;
    }
    // No controle o C++ nao desenha: o que se quer medir e so o efeito de
    // perder a sombra das mesmas malhas (SPEC-0241).
    if (soControle()) return 0;

    // A VIEW de profundidade tem de ser A MESMA que o `three` usou, não uma
    // criada a partir da textura: ele guarda a view no descriptor do alvo da
    // canvas, e se a textura foi recriada depois (a janela vira SSAA), ele
    // segue escrevendo na antiga. Medido: com a view nova, o passe desenha mas
    // NADA oclui, porque o buffer lido está zerado.
    // Com alvo explicito (a RT da cena), a profundidade quem resolve e o host:
    // ele ve as passes do frame e escolhe a da cena por tamanho e volume de
    // draws. Buscar aqui, pelo alvo da canvas, so serve ao caminho sem pos-FX —
    // e era o que fazia este metodo desistir antes de chamar o host
    // (SPEC-0241).
    const alvoExplicito = alvoCor !== null && alvoCor !== undefined;
    const alvoDaCanvas = alvoExplicito ? undefined : backend.renderer?.getCanvasTarget();
    const viewProfundidade = alvoDaCanvas
      ? backend.get(alvoDaCanvas)?.descriptor?.depthStencilAttachment?.view
      : undefined;
    const r2 = renderer as { depth?: boolean; stencil?: boolean };
    const alvoProfundidade = alvoExplicito
      ? undefined
      : backend.textureUtils?.getDepthBuffer(r2.depth !== false, r2.stencil === true);
    if (!alvoExplicito && !alvoProfundidade && !viewProfundidade) return 0;
    if (!this._viewRelatada) {
      this._viewRelatada = true;
      const dados = alvoDaCanvas ? backend.get(alvoDaCanvas) : undefined;
      const desc = dados?.descriptor as Record<string, unknown> | undefined;
      const r3 = renderer as { depth?: unknown; stencil?: unknown; currentSamples?: unknown };
      debug(
        'native-pass',
        `view=${viewProfundidade ? 'obtida' : 'AUSENTE'} ` +
          `descriptor=${desc ? Object.keys(desc).join('|') : 'ausente'} ` +
          `temDepthAttachment=${desc && desc['depthStencilAttachment'] ? 'sim' : 'NAO'} ` +
          `renderer.depth=${String(r3.depth)} renderer.stencil=${String(r3.stencil)} ` +
          `amostras=${String(r3.currentSamples)}`,
      );
    }

    // A projeção vem da câmera do `three`, não recalculada aqui: recalcular
    // introduziria diferença sub-pixel sem motivo nenhum.
    const vp = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
    const sistema = (camera as { coordinateSystem?: number }).coordinateSystem;
    if (sistema === SISTEMA_WEBGL) {
      // Converte a profundidade de -1..1 para 0..1 (z' = (z + w) / 2), que é o
      // que o alvo WebGPU espera. Em coluna-maior, a terceira LINHA da matriz
      // fica nos índices 2, 6, 10 e 14.
      for (const i of [2, 6, 10, 14]) {
        vp.elements[i] = (vp.elements[i]! + vp.elements[i + 1]!) * 0.5;
      }
    }
    for (let i = 0; i < FLOATS_DA_MATRIZ; i++) this._viewProjection[i] = vp.elements[i]!;
    this._montarLote();

    // `null` como alvo NAO serve: o host traduz isso para o offscreen dele
    // (2560x1440), e o `three` desenha a cena em OUTRA textura (medido:
    // 2048x2048, a unica pass do frame com volume de draws). Sem isto o passe
    // desenha num alvo onde a cena nunca esteve, e nada tem contra o que ocluir
    // (SPEC-0241).
    const texturaDaCanvas = alvoDaCanvas ? backend.get(alvoDaCanvas)?.texture : undefined;
    const alvoFinal = alvoCor ?? texturaDaCanvas ?? null;

    const desenhados = api.draw(
      alvoFinal,
      alvoProfundidade,
      viewProfundidade ?? null,
      this._viewProjection,
      this._lote,
    );
    // Relata periodicamente, não uma vez só: precisa dar para ver se o passe
    // continua rodando DEPOIS que o jogo carrega, ou se só rodou na tela de
    // carregamento (onde a cena está vazia e não há profundidade escrita).
    this._frames += 1;
    if (this._frames % FRAMES_ENTRE_RELATOS === 1) {
      debug(
        'native-pass',
        `frame=${this._frames} migradas=${this._migradas.length} ` +
          `desenhadas=${desenhados} sistemaDaCamera=${sistema}`,
      );
    }
    return desenhados;
  }
}
