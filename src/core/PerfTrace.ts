import { Vector3, type Camera, type Object3D } from 'three';
import type { FrameProfiler } from './FrameProfiler.js';
import type { RenderPhaseProbe } from './RenderPhaseProbe.js';
import { PipelineBirthLog, drainNativePipelineBirths, type PipelineBirth } from './PipelineBirthLog.js';
import { activeSceneMirror } from './NativeSceneMirror.js';
import { readHeapStats, type HeapStats } from './heapStats.js';
// Módulos internos (SPEC-0688): só nos corpos, nunca em assinatura pública — o PerfTrace.d.ts não os importa.
import * as census from './perfTrace/sceneCensus.js';
import { readGcTotals } from './perfTrace/hostStats.js';
import { drainTraceCounters, setTraceCountersActive } from './perfTrace/traceCounters.js';
import {
  MS_DECIMALS, PHASE_MS_DECIMALS, materialCoverageEvent, readHostSections, readPhaseSections, readSystemSections, round,
} from './perfTrace/sampleSections.js';

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

/** Casas decimais das coordenadas de câmera (m). */
const POS_DECIMALS = 1;

/** Quantos nós de cena entram no censo da árvore (os maiores). */
const CENSUS_LIMIT = 20;

/** Amostras esperadas antes do censo — a cena leva alguns segundos para montar. */
const CENSUS_AFTER_SAMPLES = 20;

/**
 * Nós que o censo em rodízio ({@link SceneWalk}) visita por quadro (SPEC-0334).
 * No DDD 61 (~10 mil nós) uma volta leva ~150 quadros (~2 s) e custa uma
 * fração de ms por quadro — em vez dos ~25 ms de três travessias por amostra.
 */
const WALK_NODES_PER_FRAME = 64;

/** Casas decimais do autocusto do trace (ms). */
const TRACE_COST_DECIMALS = 3;

/**
 * Chaves que escapam do arredondamento grosso da amostra: as fases do render e
 * a calibração do relógio precisam de mais casas do que o resto do frame.
 */
const FINE_KEY_PREFIXES = ['rp', 'clock', 'trace'] as const;

function isFineKey(name: string): boolean {
  return FINE_KEY_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Uma amostra do trace, como vai serializada em JSONL. */
export interface PerfSample {
  /** ms desde o boot. */
  t: number;
  /** Heap do Hermes (SPEC-0664); ausente fora do host nativo. */
  heap?: HeapStats;
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
  /**
   * QUAIS pipelines nasceram desde a amostra anterior (SPEC-0261): objeto,
   * material, passada e custo. Ausente quando nada nasceu.
   */
  pipelinesBorn?: PipelineBirth[];
  /** Pipelines born in the engine's own renderer since the previous sample (SPEC-0585). */
  nativePipelinesBorn?: PipelineBirth[];
  /**
   * Consultas ao cache de pipeline desde a instalação — acumulado, ACERTOS
   * incluídos (SPEC-0261). Consulta sem nascimento = pipeline reaproveitado.
   */
  pipelineLookups?: number;
  /**
   * Coletor de lixo do Hermes desde o boot (SPEC-0264) — acumulado; compare
   * amostras. `oldWallMs` é parede: uma coleta velha concorrente que atravesse
   * vários quadros aparece inteira. Ausente fora do host.
   */
  gc?: GcTotals;
  draws: number;
  tris: number;
  /** Posição da câmera (x, y, z) e direção para onde olha. */
  cam: { x: number; y: number; z: number; dx: number; dy: number; dz: number };
  /** Nós de cena dentro do frustum, do mais caro (em triângulos) pro menos. */
  visible: VisibleNode[];
  /** Medidores do jogo ({@link setPerfTraceGauge}, SPEC-0595): ausente sem nenhum registrado. */
  game?: Record<string, number>;
  /** Sombra do sol nativa na janela (SPEC-0688): ausente se o passe não rodou. */
  sunShadow?: SunShadowSample;
  /** Δ do `RenderServer.stats` na janela e recusas do NativeRenderer (SPEC-0688). */
  renderServer?: RenderServerSample;
  /** Reenvios de pixels da UI à GPU por widget (SPEC-0688): ausente sem upload. */
  uiUploads?: UiUploadsSample;
  /** KB alocados pelo Hermes na janela e por sistema do ECS (SPEC-0688). */
  alloc?: AllocSample;
}

// Tipos públicos: aqui, e não em perfTrace/, para o PerfTrace.d.ts vendorizado ser autocontido (SPEC-0688).

/** Um nó de cena visível na amostra. */
export interface VisibleNode {
  /** `node.id` da cena (o `buildScene` grava em `obj.name`). */
  id: string;
  /** Sub-malhas visíveis desse nó no frame. */
  meshes: number;
  /** Triângulos que o nó contribuiu. */
  tris: number;
}

/** Resultado de uma volta completa do {@link SceneWalk}. */
export interface SceneWalkResult {
  /** Nós da árvore (inclusive os invisíveis — o `updateMatrixWorld` desce neles). */
  total: number;
  /** Nós com visibilidade efetiva (o `visible` do three é herdado). */
  visible: number;
  /** Nós com a matriz local igual à da volta anterior. */
  unchanged: number;
  /** Nós de cena no frustum, do mais caro (triângulos) pro menos. */
  visibleNodes: VisibleNode[];
  /** Quadros que a volta levou — a idade máxima do dado. */
  frames: number;
}

/** Totais do coletor do host (`__cortexGcStats`, SPEC-0264). */
export interface GcTotals {
  youngCount: number;
  youngMs: number;
  oldCount: number;
  oldWallMs: number;
  oldCpuMs: number;
  /** MB alocados pelo JS desde o boot (SPEC-0357); Δ entre amostras = alocação. Host antigo não tem. */
  allocatedMB?: number;
}

/** Objeto que barrou a sombra do sol: nome do three, `Object3D.id` e o nó de cena que o contém. */
export interface ShadowOffender {
  name: string;
  id: number;
  node: string;
}

/** Campo `sunShadow`: redesenhos e devoluções do passe na janela, e a última recusa. */
export interface SunShadowSample {
  drawn: number;
  handedBack: number;
  reason?: string;
  counts?: string;
  offender?: ShadowOffender;
}

/** Campo `renderServer`: deltas da janela e os motivos de recusa mais frequentes do NativeRenderer. */
export interface RenderServerSample {
  fallback: number;
  refused: number;
  fbEnv: number;
  nativeRefused: number;
  nativeTop: { reason: string; count: number }[];
}

/** Campo `uiUploads`: total e os widgets que mais reenviaram (`label#id`, `canvas#id`, `image#id`). */
export interface UiUploadsSample {
  total: number;
  top: { widget: string; count: number; hint?: string }[];
}

/** Campo `alloc`: KB da janela e por sistema do ECS. */
export interface AllocSample {
  windowKB?: number;
  sysKB?: Record<string, number>;
}

/** Os campos de diagnóstico da SPEC-0688, como os contadores os entregam. */
export type TraceCounterFields = Pick<PerfSample, 'sunShadow' | 'renderServer' | 'uiUploads' | 'alloc'>;

/**
 * **Censo da cena em rodízio** (SPEC-0334): anda `budget` nós por chamada e, ao fechar a volta, publica em
 * {@link SceneWalk.result} o tamanho da árvore, as matrizes paradas e os nós no frustum.
 */
export class SceneWalk {
  private readonly _impl = new census.SceneWalk();

  /** Última volta completa, ou `null` antes da primeira. */
  get result(): SceneWalkResult | null {
    return this._impl.result;
  }

  /** Avança a volta em até `budget` nós. A câmera precisa estar com `matrixWorldInverse` em dia. */
  step(scene: Object3D, camera: Camera, budget: number): void {
    this._impl.step(scene, camera, budget);
  }
}

/** Tamanho da árvore de cena (SPEC-0227): todos os nós e os de visibilidade efetiva. */
export function countNodes(scene: Object3D): { total: number; visible: number } {
  return census.countNodes(scene);
}

/** Quantos nós tiveram a matriz local inalterada desde a chamada anterior com o mesmo `previous`. */
export function countUnchangedMatrices(scene: Object3D, previous: Map<number, Float64Array>): number {
  return census.countUnchangedMatrices(scene, previous);
}

/** Censo por nó de cena: quantos `Object3D` cada nó do `level.json` carrega, os `limit` maiores. */
export function censusBySceneNode(scene: Object3D, limit: number): [string, number][] {
  return census.censusBySceneNode(scene, limit);
}

/** Nós de cena dentro do frustum da câmera, do mais caro (triângulos) pro menos. Travessia completa. */
export function collectVisible(scene: Object3D, camera: Camera): VisibleNode[] {
  return census.collectVisible(scene, camera);
}

const gauges = new Map<string, () => number>();

/**
 * Registra um medidor do jogo lido a cada amostra do trace (`game.<name>`), ou o remove com `null`.
 * Serve para o kit de medição validar o que só o jogo sabe (ex.: câmera dentro da cidade, carros do
 * trânsito andando à vista).
 *
 * @example
 * setPerfTraceGauge('urban', () => (insideCity(camera.position) ? 1 : 0));
 */
export function setPerfTraceGauge(name: string, read: (() => number) | null): void {
  if (read === null) gauges.delete(name);
  else gauges.set(name, read);
}

function readGauges(): Record<string, number> | undefined {
  if (gauges.size === 0) return undefined;
  const out: Record<string, number> = {};
  gauges.forEach((read, name) => {
    out[name] = read();
  });
  return out;
}

/** A ponte do host: existe só com as métricas ativas. */
type TraceBridge = (line: string) => void;

function bridge(): TraceBridge | undefined {
  const fn = (globalThis as { __cortexPerfTrace?: unknown }).__cortexPerfTrace;
  return typeof fn === 'function' ? (fn as TraceBridge) : undefined;
}

const _direction = new Vector3();

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
  pipelinesBorn?: PipelineBirth[];
  nativePipelinesBorn?: PipelineBirth[];
  pipelineLookups?: number;
  gc?: GcTotals;
  draws: number;
  tris: number;
  camera: Camera;
  visible: VisibleNode[];
  game?: Record<string, number>;
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
    ...(input.pipelinesBorn && input.pipelinesBorn.length > 0 ? { pipelinesBorn: input.pipelinesBorn } : {}),
    ...(input.nativePipelinesBorn && input.nativePipelinesBorn.length > 0 ? { nativePipelinesBorn: input.nativePipelinesBorn } : {}),
    ...(input.pipelineLookups !== undefined ? { pipelineLookups: input.pipelineLookups } : {}),
    ...(input.gc ? { gc: input.gc } : {}),
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
    ...(input.game ? { game: input.game } : {}),
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
  /** Censo da cena em rodízio (SPEC-0334) — a amostra só lê o resultado. */
  private readonly _walk = new census.SceneWalk();
  /** ms da travessia somados na janela da amostra, e quadros da janela. */
  private _walkMs = 0;
  private _walkSteps = 0;
  /** Custo da amostra anterior (a atual só se mede depois de gravada). */
  private _lastSampleMs = 0;
  private readonly _bridge: TraceBridge | undefined = bridge();
  private readonly _pipelineBirths = new PipelineBirthLog();
  private _watching = false;

  constructor() {
    setTraceCountersActive(this._bridge !== undefined); // SPEC-0688: contadores só com o trace
  }

  /** `true` quando o host aceita trace (métricas ativas no export nativo). */
  get enabled(): boolean {
    return this._bridge !== undefined;
  }

  /**
   * Passa a registrar QUAIS pipelines nascem (SPEC-0261). No-op sem a ponte do
   * host, e idempotente — pode ser chamado todo frame.
   *
   * @param backend - `renderer.threeRenderer.backend`.
   * @param mainCamera - câmera do jogo, para separar a passada principal das outras.
   */
  watchPipelines(backend: unknown, mainCamera: () => Camera | null): void {
    if (!this._bridge) return;
    this._watching = this._pipelineBirths.install(backend, mainCamera);
  }

  /** Consultas e nascimentos acumulados, ou `null` se a lista não está ligada. */
  pipelineCounters(): { lookups: number; born: number } | null {
    return this._watching ? { lookups: this._pipelineBirths.lookups, born: this._pipelineBirths.births } : null;
  }

  /**
   * Grava um evento avulso no trace, fora do ritmo das amostras — para o que
   * acontece uma vez, como o aquecimento (SPEC-0261). No-op sem a ponte.
   */
  recordEvent(name: string, data: Record<string, number | string>): void {
    if (!this._bridge) return;
    this._bridge(JSON.stringify({ t: Math.round(this._elapsedMs), [name]: data }));
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
    const walkStart = performance.now();
    this._walk.step(scene, camera, WALK_NODES_PER_FRAME);
    const sampleStart = performance.now();
    this._walkMs += sampleStart - walkStart;
    this._walkSteps++;
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
    const born = readHostSections(cpu); // ponte NAPI e acumulados de criação (SPEC-0225/0252)
    readPhaseSections(cpu, phases); // fases do render (SPEC-0227)
    readSystemSections(cpu, systemProfile); // perfil por sistema do ECS (SPEC-0236)
    // Tamanho da árvore: a travessia custa por NÓ, e sem este número os ms da
    // fase não viram custo por nó (SPEC-0227). Vem da última volta completa do
    // censo em rodízio (SPEC-0334); `walkFrames` é a idade do dado.
    const lap = this._walk.result;
    if (lap) {
      cpu['nodesTotal'] = lap.total;
      cpu['nodesVisible'] = lap.visible;
      cpu['nodesUnchanged'] = lap.unchanged;
      cpu['walkFrames'] = lap.frames;
    }
    // Autocusto do trace (SPEC-0334): sem ele, o instrumento volta a inflar o
    // p95 sem ninguém ver. Média por quadro da travessia e custo da amostra.
    cpu['traceWalkMs'] = round(this._walkMs / Math.max(1, this._walkSteps), TRACE_COST_DECIMALS);
    cpu['traceSampleMs'] = round(this._lastSampleMs, TRACE_COST_DECIMALS);
    this._walkMs = 0;
    this._walkSteps = 0;
    // Nós que o espelho sincronizou por quadro, em média na janela (SPEC-0322).
    const espelho = activeSceneMirror();
    if (espelho) cpu['mirrorSynced'] = round(espelho.takeAverageSyncedNodes(), MS_DECIMALS);
    // Cobertura da descricao de material (M1 do ADR-0237): uma vez so, junto
    // do censo. E o criterio de aceitacao do marco, medido na cena REAL.
    // Cobertura da descrição de material (M1 do ADR-0237): uma vez só, junto do censo, na cena REAL.
    if (!this._censusSent && this._samples + 1 >= CENSUS_AFTER_SAMPLES) {
      this._bridge(JSON.stringify({ t: Math.round(this._elapsedMs), ...materialCoverageEvent(scene) }));
    }
    // Censo: uma vez só, e NÃO na primeira amostra — na primeira a cena ainda
    // está montando (a rodada inicial pegou 228 nós de 1.271, sem os carros, e
    // quase mandou a análise para o alvo errado). Espera a cena estabilizar.
    this._samples++;
    if (!this._censusSent && this._samples >= CENSUS_AFTER_SAMPLES) {
      this._censusSent = true;
      const censo = census.censusBySceneNode(scene, CENSUS_LIMIT);
      this._bridge(JSON.stringify({ t: Math.round(this._elapsedMs), census: censo }));
    }
    const sample = buildSample({
      timeMs: this._elapsedMs,
      frameMs: deltaMs,
      cpu,
      cpuAvg,
      cpuP99,
      born,
      pipelinesBorn: this._pipelineBirths.drain(),
      nativePipelinesBorn: drainNativePipelineBirths(),
      pipelineLookups: this._watching ? this._pipelineBirths.lookups : undefined,
      gc: readGcTotals(),
      draws: info?.drawCalls ?? 0,
      tris: info?.triangles ?? 0,
      camera,
      visible: lap?.visibleNodes ?? [],
      game: readGauges(),
    });
    const heap = readHeapStats(); // SPEC-0664: tamanho do heap e memória externa do Hermes
    if (heap) sample.heap = heap;
    Object.assign(sample, drainTraceCounters()); // SPEC-0688
    this._bridge(JSON.stringify(sample));
    this._lastSampleMs = performance.now() - sampleStart;
  }
}
