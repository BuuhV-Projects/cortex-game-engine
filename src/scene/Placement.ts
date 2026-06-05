import { Box3, Vector3 } from 'three';
import type { Object3D } from 'three';

/**
 * Caixa delimitadora (axis-aligned) de um objeto em **world space**, com os
 * limites já desempacotados em escalares pra facilitar posicionamento e
 * conexão de peças de cenário.
 *
 * Os campos `minX`/`maxX`/`minZ`/`maxZ` são o que você usa pra **conectar**
 * assets pela borda real (ex.: encostar uma ponte no `maxX` de uma ilha e no
 * `minX` da próxima), em vez de chutar coordenadas. `maxY` é o "topo" (pra
 * empilhar algo em cima); `minY` é a base (pra assentar no chão).
 */
export interface WorldBounds {
  /** Canto mínimo (x,y,z) da caixa em world space. */
  min: Vector3;
  /** Canto máximo (x,y,z) da caixa em world space. */
  max: Vector3;
  /** Dimensões (largura, altura, profundidade). */
  size: Vector3;
  /** Centro geométrico da caixa. */
  center: Vector3;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Mede a caixa delimitadora de um `Object3D` (incluindo todos os descendentes)
 * em **world space**. Atualiza as matrizes de mundo antes de medir, então o
 * resultado reflete a posição/rotação/escala atuais — útil logo após carregar
 * um `.glb` (cujo pivô é imprevisível) pra saber onde a geometria realmente
 * está.
 *
 * @param object - O objeto (ou grupo, ex.: a cena de um glTF) a medir.
 * @returns Os limites em world space, com os escalares desempacotados.
 *
 * @example
 * const island = instance(islandGlb)
 * scene.add(island)
 * const b = getWorldBounds(island)
 * // borda direita da ilha (pra encostar a próxima peça):
 * nextPiece.position.x = b.maxX
 */
export function getWorldBounds(object: Object3D): WorldBounds {
  object.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(object);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);
  return {
    min: box.min.clone(),
    max: box.max.clone(),
    size,
    center,
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z,
  };
}

/**
 * Assenta um objeto no chão: desloca `object.position.y` até que a **base** da
 * caixa delimitadora (o ponto mais baixo da geometria) fique exatamente em
 * `groundY`. Retorna os limites em world space **já com o objeto reposicionado**
 * — use as bordas (`minX`/`maxX`/...) pra conectar a próxima peça.
 *
 * Resolve o problema nº1 ao montar cena com `.glb`: como o pivô de cada modelo
 * é arbitrário, posicionar por um `y` chutado deixa peças flutuando ou afundadas.
 * `placeOnGround` mede e encaixa, independente de onde está o pivô.
 *
 * Pra **empilhar** um objeto em cima de outro, passe o topo do alvo como
 * `groundY`: `placeOnGround(flag, getWorldBounds(island).maxY)`.
 *
 * @param object - O objeto a assentar (tipicamente recém-adicionado à cena).
 * @param groundY - Altura em que a base deve ficar. Default `0`.
 * @returns Os limites em world space após o reposicionamento.
 *
 * @example
 * // Ilha afundada 1.5u na água, e uma bandeira apoiada no topo dela:
 * const b = placeOnGround(island, -1.5)
 * placeOnGround(flag, b.maxY)
 * flag.position.x = b.center.x
 */
export function placeOnGround(object: Object3D, groundY = 0): WorldBounds {
  object.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(object);
  object.position.y += groundY - box.min.y;
  return getWorldBounds(object);
}
