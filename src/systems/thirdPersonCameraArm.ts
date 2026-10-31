import * as THREE from 'three';
import { NearMeshIndex, firstHit, recentScan, traverseCollidable } from '../physics/nearMeshes.js';
import { isSkinned } from '../physics/raycastAccel.js';
import { COLLECT_INTERVAL_MS } from './CharacterPhysicsSystem.js';

/** Distância mínima PREFERIDA alvo↔câmera (m): abaixo dela a câmera tenta desviar (SPEC-0625). */
export const CAM_MIN_DIST = 0.8;
/** Raio da câmera (m): raios deslocados disso + folga até a superfície (near plane não corta, SPEC-0625). */
export const CAM_RADIUS = 0.25;
/** Passo e nº de passos da sonda de desvio de yaw (15° × 11 = até 165° de cada lado). */
export const CAM_SWING_STEP = Math.PI / 12;
export const CAM_SWING_STEPS = 11;
/** Velocidade do giro de desvio (rad/s). */
export const CAM_SWING_SPEED = 10;
/** Estabilidade da volta (SPEC-0311): segura `CAM_RELEASE_HOLD` s após encolher e volta a `CAM_RELEASE_SPEED` m/s. */
export const CAM_RELEASE_HOLD = 1;
export const CAM_RELEASE_SPEED = 3;
/** Raios deslocados: direita, esquerda, cima, baixo (fatores do vetor direita/cima). */
const OFFSETS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Estado do braço: distância atual e segundos de espera antes de voltar. */
export interface ArmState {
  dist: number;
  hold: number;
}

/**
 * Leva o braço até `target` (SPEC-0625/0311): encolher é IMEDIATO; depois segura
 * `CAM_RELEASE_HOLD` s e só então volta a `CAM_RELEASE_SPEED` m/s. `dist` não finito = corte (encaixa).
 */
export function stepArm(s: ArmState, target: number, dt: number): number {
  if (!Number.isFinite(s.dist) || !Number.isFinite(dt)) {
    s.dist = target;
  } else if (target < s.dist) {
    s.dist = target;
    s.hold = CAM_RELEASE_HOLD;
  } else if (s.hold > 0) {
    s.hold -= dt;
  } else {
    s.dist = Math.min(target, s.dist + CAM_RELEASE_SPEED * dt);
  }
  return s.dist;
}

/**
 * Escolhe o desvio de yaw (rad, com sinal) mais perto que libera `need` m, ou `null`.
 * `only` restringe a um lado (jogador girando / desvio em andamento); `prefer` desempata.
 */
export function pickSwing(
  freeAt: (yawOffset: number) => number,
  need: number,
  only: number,
  prefer: number,
): number | null {
  const first = only !== 0 ? Math.sign(only) : prefer < 0 ? -1 : 1;
  for (let i = 1; i <= CAM_SWING_STEPS; i++) {
    const a = i * CAM_SWING_STEP;
    if (freeAt(first * a) >= need) return first * a;
    if (only === 0 && freeAt(-first * a) >= need) return -first * a;
  }
  return null;
}

/** A câmera ignora (não colide com) o próprio player (gizmo e escondido saem na poda, SPEC-0307). */
function isUnderSelf(obj: THREE.Object3D, self?: THREE.Object3D): boolean {
  if (!self) return false;
  for (let p: THREE.Object3D | null = obj; p; p = p.parent) if (p === self) return true;
  return false;
}

/** Sonda de colisão do braço: raios com o raio da câmera contra o {@link NearMeshIndex}. */
export class CameraArmProbe {
  readonly index = new NearMeshIndex();
  private readonly targets: THREE.Object3D[] = []; // alvos do braço (sem skinned/self)
  /** ms desde a última varredura (começa vencido; SPEC-0302). */
  private sinceCollect = Infinity;
  /** `at` da varredura compartilhada já usada (SPEC-0328); `NaN` = nenhuma. */
  private scanAt = NaN;
  /** Dono dos alvos coletados (o `self` muda → recoleta). */
  private self?: THREE.Object3D;
  /** Só o acerto mais próximo de cada malha interessa (SPEC-0328). */
  private readonly ray = Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
  private readonly o = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly probeDir = new THREE.Vector3();
  /** Lado do desvio em andamento (−1/1), 0 = nenhum. */
  private swingSign = 0;

  /**
   * Atualiza os alvos: a cada `COLLECT_INTERVAL_MS` (SPEC-0302), reaproveitando a varredura
   * que o CharacterPhysicsSystem acabou de fazer da mesma raiz, se houver (SPEC-0328).
   * Pula malha skinada: raycast nela faz skinning por vértice na CPU a cada raio.
   */
  collect(root: THREE.Object3D, self: THREE.Object3D | undefined, elapsedMs: number): void {
    this.sinceCollect += elapsedMs;
    const shared = recentScan(root, COLLECT_INTERVAL_MS);
    const selfChanged = this.self !== self;
    if (shared && (shared.at !== this.scanAt || selfChanged)) {
      this.targets.length = 0;
      for (let i = 0; i < shared.meshes.length; i++) {
        const o = shared.meshes[i]!;
        if (!isUnderSelf(o, self)) this.targets.push(o);
      }
      this.scanAt = shared.at;
    } else if (!shared && (this.sinceCollect >= COLLECT_INTERVAL_MS || selfChanged)) {
      this.targets.length = 0;
      traverseCollidable(root, (o, hidden) => {
        if (hidden) return false; // nada lá dentro é alvo: não desce (SPEC-0320)
        if (!(o as { isMesh?: boolean }).isMesh || isSkinned(o)) return;
        if (isUnderSelf(o, self)) return;
        this.targets.push(o);
      });
    } else return;
    this.index.rebuild(this.targets);
    this.sinceCollect = 0;
    this.self = self;
  }

  /** Distância do 1º acerto de `origin` em `dir` até `far`, ou `Infinity`. */
  hit(origin: THREE.Vector3, dir: THREE.Vector3, far: number): number {
    this.ray.far = far;
    this.ray.set(origin, dir);
    return firstHit(this.ray, this.index)?.distance ?? Infinity;
  }

  /**
   * Distância livre (m, em [0, `want`]) do centro da câmera ao longo de `dir` a partir de
   * `origin`: menor acerto entre o raio central, 4 deslocados de {@link CAM_RADIUS} e o do
   * peito (`lowDrop` m abaixo), menos {@link CAM_RADIUS}.
   */
  clearance(origin: THREE.Vector3, dir: THREE.Vector3, want: number, lowDrop: number): number {
    const far = want + CAM_RADIUS;
    let h = this.hit(origin, dir, far);
    this.o.copy(origin);
    this.o.y -= lowDrop;
    h = Math.min(h, this.hit(this.o, dir, far));
    this.right.crossVectors(dir, WORLD_UP);
    if (this.right.lengthSq() < 1e-8) this.right.set(1, 0, 0); // olhando reto pra cima/baixo
    this.right.normalize();
    this.up.crossVectors(this.right, dir).normalize();
    for (const [r, u] of OFFSETS) {
      this.o.copy(origin).addScaledVector(this.right, r * CAM_RADIUS).addScaledVector(this.up, u * CAM_RADIUS);
      h = Math.min(h, this.hit(this.o, dir, far));
    }
    return Math.max(0, Math.min(want, h - CAM_RADIUS));
  }

  /**
   * Desvio (SPEC-0625): yaw (rad, com sinal) a andar até o ângulo mais perto que libera `need`
   * m atrás de `target`, ou `null`. Jogador girando (`playerSign`) → só o lado dele (nunca
   * contra a mão); senão mantém o desvio em andamento. Sem argumentos: esquece o desvio.
   */
  swing(target?: THREE.Vector3, yaw = 0, pitch = 0, need = 0, lowDrop = 0, playerSign = 0): number | null {
    if (!target) {
      this.swingSign = 0;
      return null;
    }
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const freeAt = (off: number): number => {
      this.probeDir.set(Math.sin(yaw + off) * cp, sp, Math.cos(yaw + off) * cp);
      return this.clearance(target, this.probeDir, need, lowDrop);
    };
    let off = pickSwing(freeAt, need, playerSign || this.swingSign, this.swingSign);
    if (off === null && playerSign === 0 && this.swingSign !== 0) off = pickSwing(freeAt, need, 0, this.swingSign);
    this.swingSign = off === null ? 0 : Math.sign(off); // canto fechado: só encolhe
    return off;
  }
}
