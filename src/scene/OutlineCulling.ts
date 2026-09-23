import { Sphere, Vector3, type Object3D, type Mesh, type BufferGeometry, type Material } from 'three';

import { OUTLINE_THICKNESS_KEY } from './Materials.js';

/**
 * **Corte da casca de contorno por tamanho na tela** (ADR-0251) — esconde a
 * casca de cel-shading das malhas que ocupam poucos pixels.
 *
 * Por que isto existe: a queixa no `kart-racer` não é fps baixo, é oscilação.
 * Medido pela SPEC-0250, o `render` responde por 57% da variância do frame, e
 * comparando os 20 frames mais caros com os 20 mais baratos a diferença é de
 * 66 draws (5,8 ms) — **metade deles são os karts adversários entrando em
 * quadro**, cada um com 8 dos seus 12 draws nas quatro rodas (corpo mais
 * casca). E isso acontece quando eles estão LONGE.
 *
 * O critério é **tamanho angular**, não distância, pelo mesmo motivo medido no
 * {@link cullShadowCasters} (SPEC-0197): a casca de um prédio a 100 m ainda
 * desenha silhueta, a de uma roda a 30 m já é sub-pixel — e sub-pixel não vira
 * contorno, vira shimmer.
 *
 * A **autoria vence**: casca que nasce invisível (atrás de vidro) continua
 * invisível. O filtro só tira, nunca dá.
 */

/**
 * Limiar default: a casca some além de ~40× o raio da malha (uma roda de
 * 0,35 m, além de 14 m). Mais agressivo que o do shadow caster porque contorno
 * é detalhe fino: some antes da sombra, e antes de virar shimmer.
 */
export const DEFAULT_OUTLINE_MIN_RATIO = 0.025;

/** Distância mínima usada na razão — evita divisão por ~0 em cima da câmera. */
const MIN_DISTANCE = 1;

/** `userData` onde fica o `visible` da casca como o autor deixou. */
export const OUTLINE_AUTHORED_KEY = 'cortexOutlineAuthored';

/**
 * Esta malha é uma casca de contorno?
 *
 * Pelo MATERIAL, e não pelo `userData` do objeto, porque a marca do objeto
 * **não sobrevive ao `mergeSubtree`** — ele cria uma malha nova. A do material
 * sobrevive: o merge reúsa o material do grupo e agrupa POR material, então
 * casca e corpo nunca caem no mesmo grupo.
 */
export function isOutlineShell(material: Material | Material[] | null | undefined): boolean {
  if (!material) return false;
  const first = Array.isArray(material) ? material[0] : material;
  return first?.userData?.[OUTLINE_THICKNESS_KEY] !== undefined;
}

/** A casca desenha neste limiar? Lógica pura (testável). */
export function shouldDrawOutline(radius: number, distance: number, minRatio: number): boolean {
  if (minRatio <= 0) return true;
  return radius / Math.max(distance, MIN_DISTANCE) >= minRatio;
}

/** Resultado de uma passada de {@link cullOutlines}. */
export interface OutlineCullStats {
  /** Cascas avaliadas (as que o autor deixou visíveis). */
  evaluated: number;
  /** Cascas escondidas nesta passada. */
  culled: number;
}

/** Sphere/Vector reaproveitados — esta função roda dentro do frame. */
const _sphere = new Sphere();
const _center = new Vector3();

/**
 * Percorre `root` e liga/desliga a casca de contorno por tamanho angular
 * relativo a `cameraPosition`.
 *
 * @param root - Raiz da cena (matrizes de mundo já atualizadas).
 * @param cameraPosition - Posição da câmera que está renderizando o frame.
 * @param minRatio - Limiar `raio/distância`; `0` restaura a autoria e sai.
 */
export function cullOutlines(root: Object3D, cameraPosition: Vector3, minRatio: number): OutlineCullStats {
  const stats: OutlineCullStats = { evaluated: 0, culled: 0 };
  root.traverse((obj) => {
    const mesh = obj as Mesh & { isMesh?: boolean; userData: Record<string, unknown> };
    if (!mesh.isMesh || !isOutlineShell(mesh.material)) return;
    // Primeira visita: guarda o `visible` AUTORADO, que é o teto do filtro.
    if (mesh.userData[OUTLINE_AUTHORED_KEY] === undefined) {
      mesh.userData[OUTLINE_AUTHORED_KEY] = mesh.visible;
    }
    const authored = mesh.userData[OUTLINE_AUTHORED_KEY] === true;
    if (!authored) {
      mesh.visible = false; // casca de vidro nasce desligada; continua desligada
      return;
    }
    if (minRatio <= 0) {
      mesh.visible = true; // filtro desligado: devolve a autoria
      return;
    }
    const geometry = mesh.geometry as BufferGeometry | undefined;
    if (!geometry) return;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const bounds = geometry.boundingSphere;
    if (!bounds) return;
    _sphere.copy(bounds).applyMatrix4(mesh.matrixWorld);
    _center.copy(_sphere.center);
    stats.evaluated++;
    const draws = shouldDrawOutline(_sphere.radius, _center.distanceTo(cameraPosition), minRatio);
    if (!draws) stats.culled++;
    mesh.visible = draws;
  });
  return stats;
}
