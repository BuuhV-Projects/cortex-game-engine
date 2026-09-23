import { Frustum, Matrix4, Vector3, type Camera, type Mesh, type Object3D } from 'three';
import type { FrameProfiler } from './FrameProfiler.js';
import type { RenderPhaseProbe } from './RenderPhaseProbe.js';
import { describeMaterial, isDescribed, measureCoverage } from '../render/MaterialDesc.js';
import { countDistinctPipelines } from '../render/PipelineKey.js';

/**
 * **Perf trace de gameplay** (SPEC-0198) — com as métricas ativas, grava uma
 * linha JSONL por amostra num arquivo, enquanto se joga: fps, tempo de CPU por
 * seção, draws/triângulos, onde a câmera estava e **quais nós de cena estavam
 * visíveis**.
 *
 * É a ferramenta que responde "por que caiu de 50 pra 32 naquele trecho" sem
 * depender de print de HUD no momento certo — foi o que custou uma rodada
 * inteira de otimização no alvo errado no `kart-racer`.
 *
 * Só escreve no **host nativo**: a ponte é `globalThis.__cortexPerfTrace`, que o
 * host registra apenas quando o jogo roda com métricas (export `--debug`,
 * dev-run ou `CORTEX_VRAM_LOG`). Sem a ponte, {@link PerfTrace.tick} não coleta
 * nada e o custo é zero.
 */

/** Intervalo entre amostras, em ms. */
const SAMPLE_MS = 500;

/** Casas decimais dos tempos (ms) na linha gravada. */
const MS_DECIMALS = 1;

/** Casas decimais das coordenadas de câmera (m). */
const POS_DECIMALS = 1;

/**
 * Casas decimais das fases do render (SPEC-0227). Mais fino que `MS_DECIMALS`
 * de propósito: uma fase pode valer centésimos de ms por frame e ainda assim
 * dominar o custo POR OBJETO, que é a pergunta em jogo.
 */
const PHASE_MS_DECIMALS = 3;

/** Casas decimais do custo do relógio (ns). */
const CLOCK_NS_DECIMALS = 1;

/** Elementos de uma Matrix4. */
const MATRIX_ELEMENTS = 16;

/** Quantos nós de cena entram no censo da árvore (os maiores). */
const CENSUS_LIMIT = 20;

/** Amostras esperadas antes do censo — a cena leva alguns segundos para montar. */
const CENSUS_AFTER_SAMPLES = 20;

/**
 * Chaves que escapam do arredondamento grosso da amostra: as fases do render e
 * a calibração do relógio precisam de mais casas do que o resto do frame.
 */
const FINE_KEY_PREFIXES = ['rp', 'clock'] as const;

function isFineKey(name: string): boolean {
  return FINE_KEY_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Um nó de cena visível na amostra. */
export interface VisibleNode {
  /** `node.id` da cena (o `buildScene` grava em `obj.name`). */
  id: string;
  /** Sub-malhas visíveis desse nó no frame. */
  meshes: number;
  /** Triângulos que o nó contribuiu. */
  tris: number;
}

/** Uma amostra do trace, como vai serializada em JSONL. */
export interface PerfSample {
  /** ms desde o boot. */
  t: number;
  fps: number;
  frameMs: number;
  /** ms de CPU por seção do {@link FrameProfiler} (`{ render: 28.1, … }`). */
  cpu: Record<string, number>;
  /**
   * Custo TÍPICO por seção — a média da janela de 240 frames do
   * {@link FrameProfiler}, não o frame sorteado que vai em {@link cpu}.
   */
  cpuAvg: Record<string, number>;
  /**
   * PIOR CASO por seção (p99 da mesma janela). A distância até {@link cpuAvg}
   * é a variância da seção, que é o que o jogador sente como oscilação —
   * `cpu` sozinho não responde isso (SPEC-0250).
   */
  cpuP99: Record<string, number>;
  /**
   * Recursos de GPU CRIADOS desde o boot (SPEC-0252) — acumulados.
   *
   * A diferença entre duas amostras diz quantos nasceram no intervalo, que é a
   * pergunta que os contadores de custo não respondem: um frame que engasga
   * sem draws altos e sem seção cara estava criando alguma coisa.
   *
   * `pipelines` é o mais decisivo: diferente de `cpu.napiPipe` (que conta
   * `setPipeline`, ou seja, quantas vezes um pipeline é LIGADO), este conta
   * quantos NASCEM — e só isso denuncia compilação dentro do frame.
   */
  born?: { pipelines: number; buffers: number; textures: number };
  draws: number;
  tris: number;
  /** Posição da câmera (x, y, z) e direção para onde olha. */
  cam: { x: number; y: number; z: number; dx: number; dy: number; dz: number };
  /** Nós de cena dentro do frustum, do mais caro (em triângulos) pro menos. */
  visible: VisibleNode[];
}

/** A ponte do host: existe só com as métricas ativas. */
type TraceBridge = (line: string) => void;

function bridge(): TraceBridge | undefined {
  const fn = (globalThis as { __cortexPerfTrace?: unknown }).__cortexPerfTrace;
  return typeof fn === 'function' ? (fn as TraceBridge) : undefined;
}

/** Arredonda pra `decimals` casas (evita linha cheia de ruído de ponto flutuante). */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Triângulos que uma malha desenha (indexada ou não). */
function triangleCount(mesh: Mesh): number {
  const geometry = mesh.geometry;
  if (!geometry) return 0;
  const index = geometry.index;
  const position = geometry.getAttribute('position');
  const count = index ? index.count : (position?.count ?? 0);
  return Math.floor(count / 3);
}

/**
 * Sobe a hierarquia até o nó de cena (`userData.cortexSceneNode`) e devolve o
 * `id` dele. Malha fora de um nó de cena (chrome do editor, malha criada por
 * código) cai no nome próprio — o trace registra o que existe, sem inventar.
 */
function sceneNodeIdOf(obj: Object3D): string {
  let current: Object3D | null = obj;
  while (current) {
    if ((current.userData as Record<string, unknown>)['cortexSceneNode'] === true) {
      return current.name || '(sem id)';
    }
    current = current.parent;
  }
  return obj.name || '(avulso)';
}

const _frustum = new Frustum();
const _matrix = new Matrix4();
const _direction = new Vector3();

/**
 * Tamanho da árvore de cena (SPEC-0227). Duas contagens porque as duas fases
 * mais caras do render percorrem conjuntos diferentes: o `updateMatrixWorld`
 * desce em TODOS os nós, inclusive invisíveis; o culling para em subárvore
 * invisível.
 */
export function countNodes(scene: Object3D): { total: number; visible: number } {
  let total = 0;
  let visible = 0;
  const visitar = (obj: Object3D, paiVisivel: boolean): void => {
    total++;
    const visivel = paiVisivel && obj.visible;
    if (visivel) visible++;
    for (const child of obj.children) visitar(child, visivel);
  };
  visitar(scene, true);
  return { total, visible };
}

/**
 * Quantos nós tiveram a **matriz local inalterada** desde a amostra anterior.
 *
 * É o número que dimensiona a poda de recomposição de matriz: só quem nunca
 * muda pode ter o compose desligado com segurança. Medido na corrida de
 * verdade, não na cena parada — com a cena parada a resposta seria "todos", que
 * é verdadeira e inútil.
 *
 * Compara a matriz composta, e não `position`/`quaternion`, porque é ela que o
 * `updateMatrix` recalcula; guardar 16 floats por nó duas vezes por segundo é
 * barato perto de recompor 1.271 matrizes 60 vezes por segundo. Em `Float64Array`
 * e não `Float32`: arredondar faria mudança pequena passar por "sem mudança" e
 * inflaria justamente o número que decide se a poda vale.
 */
export function countUnchangedMatrices(scene: Object3D, previous: Map<number, Float64Array>): number {
  let unchanged = 0;
  scene.traverse((obj) => {
    const elements = obj.matrix.elements;
    const before = previous.get(obj.id);
    if (before) {
      let igual = true;
      for (let i = 0; i < MATRIX_ELEMENTS; i++) {
        if (before[i] !== elements[i]) {
          igual = false;
          break;
        }
      }
      if (igual) unchanged++;
      for (let i = 0; i < MATRIX_ELEMENTS; i++) before[i] = elements[i];
    } else {
      const copia = new Float64Array(MATRIX_ELEMENTS);
      for (let i = 0; i < MATRIX_ELEMENTS; i++) copia[i] = elements[i];
      previous.set(obj.id, copia);
    }
  });
  return unchanged;
}

/**
 * Censo da árvore por nó de cena: quantos `Object3D` cada nó do `level.json`
 * carrega. Responde "quem são os 1.271 nós" — a pergunta que decide se vale
 * podar a travessia (cenário estático) ou reduzir malha (modelo com peças
 * demais), que são trabalhos completamente diferentes.
 */
export function censusBySceneNode(scene: Object3D, limit: number): [string, number][] {
  const byId = new Map<string, number>();
  const visitar = (obj: Object3D): void => {
    const id = sceneNodeIdOf(obj);
    byId.set(id, (byId.get(id) ?? 0) + 1);
    for (const child of obj.children) visitar(child);
  };
  visitar(scene);
  return [...byId.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/**
 * Percorre a cena e agrega, por nó de cena, o que está DENTRO do frustum da
 * câmera. É o traverse mais caro do trace — roda uma vez por amostra, nunca por
 * frame.
 */
export function collectVisible(scene: Object3D, camera: Camera): VisibleNode[] {
  camera.updateMatrixWorld();
  _matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_matrix);

  const byId = new Map<string, VisibleNode>();
  // Travessia própria (e não `traverse`) porque ela PARA em subárvore invisível.
  // O `visible` do three é herdado: uma malha com `visible: true` dentro de um
  // pai escondido não desenha. Com `traverse` ela entrava na conta e inflava o
  // diagnóstico — no kart-racer, as variantes de roda da garagem, que ficam
  // todas na cena com só uma visível, apareciam como se desenhassem.
  const visitar = (obj: Object3D): void => {
    if (!obj.visible) return;
    const mesh = obj as Mesh & { isMesh?: boolean };
    if (mesh.isMesh && mesh.geometry) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      if (_frustum.intersectsObject(mesh)) {
        const id = sceneNodeIdOf(mesh);
        const entry = byId.get(id) ?? { id, meshes: 0, tris: 0 };
        entry.meshes++;
        entry.tris += triangleCount(mesh);
        byId.set(id, entry);
      }
    }
    for (const child of obj.children) visitar(child);
  };
  visitar(scene);
  return [...byId.values()].sort((a, b) => b.tris - a.tris);
}

/**
 * Milissegundos gastos dentro da ponte NAPI no último frame fechado do host
 * (SPEC-0225), ou `null` no browser, onde não há ponte.
 */
function napiBridgeMs(): number | null {
  const stats = napiStats();
  const ms = stats?.ms;
  return typeof ms === 'number' && Number.isFinite(ms) ? round(ms, MS_DECIMALS) : null;
}

/** Contadores do último frame fechado do host, ou `null` no browser. */
function napiStats(): Record<string, number> | null {
  const fn = (globalThis as { __cortexNapiStats?: () => Record<string, number> }).__cortexNapiStats;
  if (typeof fn !== 'function') return null;
  try {
    return fn();
  } catch {
    return null;
  }
}

/** Dados do frame que a amostra precisa, já lidos pelo chamador. */
export interface SampleInput {
  timeMs: number;
  frameMs: number;
  cpu: Record<string, number>;
  /** Opcionais porque `buildSample` é pública e já tinha chamadores; ausentes
   * viram `{}`, que é o que um trace sem a janela do profiler tem a dizer. */
  cpuAvg?: Record<string, number>;
  cpuP99?: Record<string, number>;
  born?: { pipelines: number; buffers: number; textures: number };
  draws: number;
  tris: number;
  camera: Camera;
  visible: VisibleNode[];
}

/** Monta a amostra (função pura — é o que os testes exercitam). */
export function buildSample(input: SampleInput): PerfSample {
  const position = input.camera.position;
  input.camera.getWorldDirection(_direction);
  const arredondarSecoes = (origem: Record<string, number>): Record<string, number> => {
    const saida: Record<string, number> = {};
    for (const [name, ms] of Object.entries(origem)) {
      saida[name] = round(ms, isFineKey(name) ? PHASE_MS_DECIMALS : MS_DECIMALS);
    }
    return saida;
  };
  const cpu = arredondarSecoes(input.cpu);
  return {
    t: Math.round(input.timeMs),
    fps: input.frameMs > 0 ? round(1000 / input.frameMs, MS_DECIMALS) : 0,
    frameMs: round(input.frameMs, MS_DECIMALS),
    cpu,
    cpuAvg: arredondarSecoes(input.cpuAvg ?? {}),
    cpuP99: arredondarSecoes(input.cpuP99 ?? {}),
    ...(input.born ? { born: input.born } : {}),
    draws: input.draws,
    tris: input.tris,
    cam: {
      x: round(position.x, POS_DECIMALS),
      y: round(position.y, POS_DECIMALS),
      z: round(position.z, POS_DECIMALS),
      dx: round(_direction.x, 2),
      dy: round(_direction.y, 2),
      dz: round(_direction.z, 2),
    },
    visible: input.visible,
  };
}

/**
 * Amostrador do trace. O {@link Game} chama {@link tick} a cada frame; ele só
 * faz trabalho quando (a) o host registrou a ponte e (b) passou o intervalo.
 */
export class PerfTrace {
  private _sinceSampleMs = 0;
  private _elapsedMs = 0;
  /** O censo da árvore vai uma vez só — a composição da cena não muda por frame. */
  private _censusSent = false;
  private _samples = 0;
  /** Matriz local da amostra anterior, por id de objeto (SPEC-0227). */
  private readonly _previousMatrices = new Map<number, Float64Array>();
  private readonly _bridge: TraceBridge | undefined = bridge();

  /** `true` quando o host aceita trace (métricas ativas no export nativo). */
  get enabled(): boolean {
    return this._bridge !== undefined;
  }

  /**
   * Avança o relógio e, no intervalo, grava uma amostra.
   *
   * @param deltaMs - Duração do frame.
   * @param scene - Raiz da cena ativa.
   * @param camera - Câmera que renderizou o frame.
   * @param profiler - Fonte do tempo de CPU por seção.
   * @param info - `renderer.info.render` (draws/triângulos do frame).
   * @param phases - Sonda de fases do render (SPEC-0227); inerte se desligada.
   */
  tick(
    deltaMs: number,
    scene: Object3D,
    camera: Camera,
    profiler: FrameProfiler,
    info: { drawCalls?: number; triangles?: number } | null,
    phases?: RenderPhaseProbe | null,
    systemProfile?: Map<string, number> | null,
  ): void {
    if (!this._bridge) return;
    this._elapsedMs += deltaMs;
    this._sinceSampleMs += deltaMs;
    if (this._sinceSampleMs < SAMPLE_MS) return;
    this._sinceSampleMs = 0;

    const cpu: Record<string, number> = {};
    // `lastMs` é UM frame, sorteado uma vez a cada SAMPLE_MS. Serve para ver o
    // instante; não serve para variância — foi a causa de duas conclusões
    // erradas nesta campanha (SPEC-0250). Por isso a média e o p99 da janela
    // de 240 frames vêm junto: o profiler já os calcula, só eram descartados.
    const cpuAvg: Record<string, number> = {};
    const cpuP99: Record<string, number> = {};
    for (const section of profiler.summary()) {
      cpu[section.name] = section.lastMs;
      cpuAvg[section.name] = section.avgMs;
      cpuP99[section.name] = section.p99Ms;
    }
    // Ponte NAPI do host (SPEC-0225). Entra no mesmo mapa porque é a mesma
    // pergunta — quanto do frame é isto — mas ATENÇÃO: não é uma seção nova e
    // sim um SUBCONJUNTO de `render`. Somar tudo contaria duas vezes.
    const napiMs = napiBridgeMs();
    if (napiMs !== null) cpu['napi'] = napiMs;
    // Contadores da ponte no mesmo mapa: a pergunta em aberto é se os
    // `writeBuffer` acompanham os draws (uniforme de objeto estático reescrito
    // todo frame) ou só os objetos que de fato se movem (SPEC-0225).
    const stats = napiStats();
    if (stats) {
      cpu['napiWb'] = stats['writeBuffer'] ?? 0;
      cpu['napiBind'] = stats['setBindGroup'] ?? 0;
      cpu['napiPipe'] = stats['setPipeline'] ?? 0;
    }
    // Acumulados de criação (SPEC-0252). Ficam FORA do mapa `cpu` de propósito:
    // não são milissegundos, e misturá-los ali faria qualquer soma de seções
    // dar um número sem sentido.
    const born = stats && stats['bornPipelines'] !== undefined
      ? {
          pipelines: stats['bornPipelines'] ?? 0,
          buffers: stats['bornBuffers'] ?? 0,
          textures: stats['bornTextures'] ?? 0,
        }
      : undefined;
    // Fases do render (SPEC-0227): mesma regra do `napi` — são SUBCONJUNTOS de
    // `render`, não seções novas, e não se somam ao total. `rpCalls*` conta as
    // chamadas de topo, para separar "fase cara" de "fase chamada muitas vezes".
    if (phases?.enabled) {
      const phaseMs = phases.lastFrameMs();
      const phaseCalls = phases.lastFrameCalls();
      for (const [name, ms] of Object.entries(phaseMs)) {
        cpu[`rp${name[0].toUpperCase()}${name.slice(1)}`] = round(ms, PHASE_MS_DECIMALS);
      }
      for (const [name, calls] of Object.entries(phaseCalls)) {
        cpu[`rpCalls${name[0].toUpperCase()}${name.slice(1)}`] = calls;
      }
      // Custo e resolução do relógio: sem eles não dá para saber se um balde
      // pequeno é trabalho ou é o próprio instrumento (e um `clockResNs` de
      // ~1e6 denuncia que a SPEC-0226 não está de pé neste binário).
      // Nível 3: 1 = colaboradores internos embrulhados, 0 = não deu (baldes
      // internos zerados NÃO são "fase barata"); ausente = nível 3 não pedido.
      // M0 do ADR-0237: refazer x reaproveitar o trabalho por objeto.
      const refresh = phases.lastFrameRefresh();
      if (refresh.refresh + refresh.reuse > 0) {
        cpu['rpRefresh'] = refresh.refresh;
        cpu['rpReuse'] = refresh.reuse;
      }
      const internals = phases.internalsOk;
      if (internals !== null) cpu['rpInternals'] = internals ? 1 : 0;
      const clock = phases.clock;
      if (clock) {
        cpu['clockNs'] = round(clock.costNs, CLOCK_NS_DECIMALS);
        cpu['clockResNs'] = round(clock.resolutionNs, CLOCK_NS_DECIMALS);
      }
    }
    // Perfil por sistema do ECS (SPEC-0236): o `world` deixa de ser um bloco
    // só. Prefixo `sys` para não colidir com as seções do profiler de frame.
    if (systemProfile) {
      for (const [nome, ms] of systemProfile) {
        cpu[`sys${nome}`] = round(ms, PHASE_MS_DECIMALS);
      }
      systemProfile.clear();
    }
    // Tamanho da árvore: a travessia custa por NÓ, e sem este número os ms da
    // fase não viram custo por nó (SPEC-0227).
    const nodes = countNodes(scene);
    cpu['nodesTotal'] = nodes.total;
    cpu['nodesVisible'] = nodes.visible;
    cpu['nodesUnchanged'] = countUnchangedMatrices(scene, this._previousMatrices);
    // Cobertura da descricao de material (M1 do ADR-0237): uma vez so, junto
    // do censo. E o criterio de aceitacao do marco, medido na cena REAL.
    if (!this._censusSent && this._samples + 1 >= CENSUS_AFTER_SAMPLES) {
      const materiais = new Set<never>();
      scene.traverse((obj) => {
        const mesh = obj as { material?: unknown };
        if (!mesh.material) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materiais.add(m as never);
      });
      const cobertura = measureCoverage(materiais);
      // Passo 2 da SPEC-0238: quantos pipelines DISTINTOS a cena gera. Contexto
      // fixo porque layout de vertice e formato de alvo ainda nao sao
      // catalogados — entao este numero e o PISO, nao o total.
      const descritos = [];
      for (const m of materiais) {
        const d = describeMaterial(m as never);
        if (isDescribed(d)) descritos.push(d);
      }
      const pipelines = countDistinctPipelines(descritos, { vertexLayoutId: 0, targetFormatId: 0 });
      this._bridge(JSON.stringify({ t: Math.round(this._elapsedMs), materialCoverage: cobertura, pipelines }));
    }
    // Censo: uma vez só, e NÃO na primeira amostra — na primeira a cena ainda
    // está montando (a rodada inicial pegou 228 nós de 1.271, sem os carros, e
    // quase mandou a análise para o alvo errado). Espera a cena estabilizar.
    this._samples++;
    if (!this._censusSent && this._samples >= CENSUS_AFTER_SAMPLES) {
      this._censusSent = true;
      const censo = censusBySceneNode(scene, CENSUS_LIMIT);
      this._bridge(JSON.stringify({ t: Math.round(this._elapsedMs), census: censo }));
    }
    const sample = buildSample({
      timeMs: this._elapsedMs,
      frameMs: deltaMs,
      cpu,
      cpuAvg,
      cpuP99,
      born,
      draws: info?.drawCalls ?? 0,
      tris: info?.triangles ?? 0,
      camera,
      visible: collectVisible(scene, camera),
    });
    this._bridge(JSON.stringify(sample));
  }
}
