/**
 * Identidade e buffers de geometria para o caminho de render nativo
 * (SPEC-0241, passo 2).
 *
 * O C++ não consegue, sozinho, saber qual `WGPUBuffer` pertence a qual malha:
 * ele só vê buffers soltos, criados pelo `three`. Este módulo dá duas coisas:
 *
 * 1. um **id estável** por `BufferGeometry`, análogo ao `textureId()` do
 *    `MaterialDesc`;
 * 2. os **buffers que o `three` já criou** para ela.
 *
 * O ponto de não criar buffers próprios é deliberado: o `three` já subiu esses
 * dados para a GPU, e uma segunda cópia **dobraria a VRAM da cena inteira** —
 * além de abrir espaço para as duas cópias divergirem se o atributo for
 * atualizado. Quem é dono dos buffers continua sendo o `three`.
 */
import type * as THREE from 'three';

/** Id do primeiro registro; 0 fica reservado para "sem geometria". */
const PRIMEIRO_ID = 1;

let proximoId = PRIMEIRO_ID;
const idsPorGeometria = new WeakMap<object, number>();

/** Os buffers de uma geometria, como o `three` os criou. */
export interface GeometryBuffers {
  /** Handle do buffer de vértice (opaco: o host desembrulha). */
  vertexBuffer: unknown;
  /** Handle do buffer de índice, ou `null` quando a malha não é indexada. */
  indexBuffer: unknown | null;
  /** Índices a desenhar; 0 quando não é indexada. */
  indexCount: number;
  /** Vértices a desenhar quando não há índice. */
  vertexCount: number;
}

interface BackendComAtributos {
  get(alvo: unknown): { buffer?: unknown } | undefined;
}

/**
 * Id estável para uma geometria. A mesma `BufferGeometry` devolve sempre o
 * mesmo id — o que importa porque malhas repetidas (as rodas de um carro, um
 * poste que se repete) compartilham a geometria, e registrar cada instância
 * como se fosse outra desperdiçaria a tabela inteira.
 */
export function geometryId(geometry: object): number {
  const existente = idsPorGeometria.get(geometry);
  if (existente !== undefined) return existente;
  const novo = proximoId++;
  idsPorGeometria.set(geometry, novo);
  return novo;
}

/** `true` quando esta geometria já recebeu id (não cria um novo). */
export function geometryIdRegistrado(geometry: object): boolean {
  return idsPorGeometria.has(geometry);
}

/**
 * Lê do backend do `three` os buffers de GPU de uma geometria.
 *
 * Devolve `null` quando o `three` ainda não subiu a geometria (acontece antes
 * do primeiro desenho dela) ou quando não há o que desenhar — nesses casos o
 * objeto simplesmente continua no caminho do `three`, em vez de sumir da
 * imagem.
 */
export function geometryBuffers(
  backend: BackendComAtributos,
  geometry: THREE.BufferGeometry,
): GeometryBuffers | null {
  const posicao = geometry.getAttribute?.('position') as { count?: number } | undefined;
  if (!posicao) return null;
  const vertexBuffer = backend.get(posicao)?.buffer;
  if (!vertexBuffer) return null;

  const indice = geometry.index as { count?: number } | null | undefined;
  const indexBuffer = indice ? (backend.get(indice)?.buffer ?? null) : null;
  // Índice declarado mas ainda sem buffer significa "o three não subiu isto
  // ainda". Desenhar sem o índice mudaria a malha — melhor recusar.
  if (indice && !indexBuffer) return null;

  const indexCount = indexBuffer ? (indice?.count ?? 0) : 0;
  const vertexCount = indexBuffer ? 0 : (posicao.count ?? 0);
  if (indexCount === 0 && vertexCount === 0) return null;

  return { vertexBuffer, indexBuffer, indexCount, vertexCount };
}

/** Reinicia a numeração. Só para teste — em runtime os ids vivem o processo. */
export function resetGeometryIds(): void {
  proximoId = PRIMEIRO_ID;
}
