import { Sphere, Vector3, type Object3D, type Mesh, type BufferGeometry } from 'three';

/**
 * **Shadow caster culling por tamanho angular** (SPEC-0197) — tira do shadow
 * pass as malhas cuja sombra ocuparia poucos pixels: quando
 * `raio ÷ distância_da_câmera` fica abaixo de um limiar, o objeto deixa de
 * projetar sombra.
 *
 * Por que isto existe: com CSM a cena é percorrida uma vez por cascata, então
 * cada malha custa 1 + N draws por frame. Medido na cena do `kart-racer`
 * (câmera de gameplay): 2807 draws sem filtro → 1966 com o limiar default.
 * Cortar por DISTÂNCIA não adianta (o CSM já limita por `shadowDistance`) — o
 * que paga é o tamanho na tela.
 *
 * A **autoria vence**: o `castShadow` autorado (nó/JSON/Inspector) é memorizado
 * em `userData.cortexShadowAuthored` e o filtro só pode TIRAR sombra de quem
 * tinha, nunca dar a quem o autor desligou.
 */

/**
 * Limiar default: objeto some da sombra além de ~20× o próprio raio (uma árvore
 * de 5 m de raio, além de 100 m). Escolhido por medição + comparação visual na
 * cena do `kart-racer` (SPEC-0197): corta 30% dos draws com screenshots
 * indistinguíveis do original; a partir de `0.1` a sombra de contato de um carro
 * distante começa a sumir.
 */
export const DEFAULT_SHADOW_CASTER_MIN_RATIO = 0.05;

/** Distância mínima usada na razão — evita divisão por ~0 em cima da câmera. */
const MIN_DISTANCE = 1;

/**
 * `userData` onde fica o `castShadow` como o autor deixou.
 *
 * Exportado porque o espelho de cena nativo (SPEC-0245) precisa mandar ao C++
 * o valor AUTORADO, não o que este filtro deixou no frame: quem reaplica a
 * regra lá é o enumerador, então o que ele recebe tem de ser o teto.
 */
export const SHADOW_AUTHORED_KEY = 'cortexShadowAuthored';
const AUTHORED = SHADOW_AUTHORED_KEY;

/**
 * O `castShadow` como o AUTOR deixou — a memória do filtro quando ela existe,
 * o valor atual antes da primeira passada.
 */
export function authoredCastShadow(object: Object3D): boolean {
  const memorizado = (object.userData as Record<string, unknown> | undefined)?.[AUTHORED];
  return memorizado === undefined ? object.castShadow === true : memorizado === true;
}

/** Resultado de uma passada de {@link cullShadowCasters}. */
export interface ShadowCullStats {
  /** Malhas avaliadas (candidatas, já sem skinned/instanced). */
  evaluated: number;
  /** Malhas que tiveram a sombra desligada nesta passada. */
  culled: number;
}

/** Uma malha projeta sombra neste limiar? Lógica pura (testável). */
export function shouldCastShadow(radius: number, distance: number, minRatio: number): boolean {
  if (minRatio <= 0) return true;
  return radius / Math.max(distance, MIN_DISTANCE) >= minRatio;
}

/** Sphere/Vector reaproveitados — esta função roda dentro do frame. */
const _sphere = new Sphere();
const _center = new Vector3();

/**
 * Percorre `root` e liga/desliga `castShadow` por tamanho angular relativo a
 * `cameraPosition`. Chamado periodicamente (não todo frame) pelo CSM do
 * {@link setupOutdoorLighting}.
 *
 * Ficam **de fora** (mantêm o que o autor definiu): malha skinada — o bounding
 * sphere da geometria mente com o rig (personagem perderia sombra de perto) — e
 * `InstancedMesh`, cujo bounding sphere descreve uma instância e não o conjunto.
 *
 * @param root - Raiz da cena (matrizes de mundo já atualizadas).
 * @param cameraPosition - Posição da câmera que está renderizando o frame.
 * @param minRatio - Limiar `raio/distância`; `0` restaura a autoria e sai.
 */
export function cullShadowCasters(root: Object3D, cameraPosition: Vector3, minRatio: number): ShadowCullStats {
  const stats: ShadowCullStats = { evaluated: 0, culled: 0 };
  root.traverse((obj) => {
    const mesh = obj as Mesh & {
      isMesh?: boolean;
      isSkinnedMesh?: boolean;
      isInstancedMesh?: boolean;
      castShadow: boolean;
      userData: Record<string, unknown>;
    };
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh) return;
    // Primeira visita: guarda o valor AUTORADO, que é o teto do que o filtro pode dar.
    if (mesh.userData[AUTHORED] === undefined) mesh.userData[AUTHORED] = mesh.castShadow;
    const authored = mesh.userData[AUTHORED] === true;
    if (!authored) {
      mesh.castShadow = false;
      return;
    }
    if (minRatio <= 0) {
      mesh.castShadow = true; // filtro desligado: devolve a autoria
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
    const casts = shouldCastShadow(_sphere.radius, _center.distanceTo(cameraPosition), minRatio);
    if (!casts) stats.culled++;
    mesh.castShadow = casts;
  });
  return stats;
}
