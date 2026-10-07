/**
 * Quadro de aquecimento (ADR-0262 / SPEC-0263).
 *
 * O render pula objeto invisível e objeto fora da câmera — e é justamente o que
 * o aquecimento precisa compilar: efeitos escondidos até o uso, pista fora de
 * quadro. Isto revela a árvore inteira para UM render e devolve como desfazer.
 */
import type { Object3D } from 'three';

/**
 * Força `visible = true` e `frustumCulled = false` em `root` e descendentes.
 *
 * @returns função que devolve cada objeto ao estado anterior. Chame num
 *   `finally`: sem restaurar, a cena inteira ficaria visível e sem culling.
 */
export function revealForWarmup(root: Object3D): () => void {
  const saved: Array<[Object3D, boolean, boolean]> = [];
  root.traverse((object) => {
    saved.push([object, object.visible, object.frustumCulled]);
    object.visible = true;
    object.frustumCulled = false;
  });
  return () => {
    for (const [object, visible, frustumCulled] of saved) {
      object.visible = visible;
      object.frustumCulled = frustumCulled;
    }
  };
}

/** O pedaço interno do `Pipelines` do three que o aquecimento usa. */
interface PipelinesLike {
  updateForRender(renderObject: unknown): void;
  getForRender(renderObject: unknown, promises: Promise<unknown>[] | null): unknown;
}

/**
 * Roda `draw` (o quadro de aquecimento) com os pipelines criados por
 * `createRenderPipelineAsync`, todos disparados no mesmo quadro (ADR-0310 /
 * SPEC-0309). O descritor sai do render real (mesmas chaves do jogo); só a
 * criação fica assíncrona e o Dawn compila em paralelo.
 *
 * @returns as promessas dos pipelines criados — espere todas antes de revelar o
 *   jogo. Vazio (e `draw` roda normal) se o three não tiver o caminho esperado.
 */
export function drawWithParallelPipelines(threeRenderer: unknown, draw: () => void): Promise<unknown>[] {
  const pipelines = (threeRenderer as { _pipelines?: Partial<PipelinesLike> } | null)?._pipelines;
  if (!pipelines || typeof pipelines.getForRender !== 'function' || typeof pipelines.updateForRender !== 'function') {
    draw();
    return [];
  }
  const promises: Promise<unknown>[] = [];
  const own = Object.prototype.hasOwnProperty.call(pipelines, 'updateForRender');
  const previous = pipelines.updateForRender;
  const getForRender = pipelines.getForRender.bind(pipelines);
  pipelines.updateForRender = (renderObject: unknown) => {
    getForRender(renderObject, promises);
  };
  try {
    draw();
  } finally {
    if (own) pipelines.updateForRender = previous;
    else delete pipelines.updateForRender;
  }
  return promises;
}
