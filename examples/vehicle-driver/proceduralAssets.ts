/**
 * Kart e piloto **gerados em código** na convenção da SPEC-0275 — a cena de
 * validação testa a engine sem depender de asset. Os clipes fazem o papel dos
 * que virão baked do Blender (sem IK em runtime, ADR-0274): cada um já traz a
 * pose de mãos e pés do seu estado.
 */
import {
  AnimationClip,
  Bone,
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  TorusGeometry,
} from 'three';

type Vec3 = readonly [number, number, number];

const SKIN = new MeshStandardMaterial({ color: 0xf2c9a0 });
const SUIT = new MeshStandardMaterial({ color: 0xe0413a });
const HELMET = new MeshStandardMaterial({ color: 0xf5f5f5 });
const DARK = new MeshStandardMaterial({ color: 0x22252b });
const BODY = new MeshStandardMaterial({ color: 0x2f7de1 });

function box(size: Vec3, material: MeshStandardMaterial, at: Vec3 = [0, 0, 0]): Mesh {
  const m = new Mesh(new BoxGeometry(size[0], size[1], size[2]), material);
  m.position.set(at[0], at[1], at[2]);
  m.castShadow = true;
  return m;
}

function named<T extends Object3D>(obj: T, name: string, parent: Object3D, at: Vec3): T {
  obj.name = name;
  obj.position.set(at[0], at[1], at[2]);
  parent.add(obj);
  return obj;
}

// ─── Kart ─────────────────────────────────────────────────────────────────────

/** Raio das rodas do kart, em metros. */
export const WHEEL_RADIUS = 0.16;
const WHEEL_WIDTH = 0.14;
const WHEEL_TRACK = 0.42;
const WHEEL_BASE_FRONT = 0.48;
const WHEEL_BASE_REAR = -0.42;

/** Kart com os 6 anchors da convenção (assento, volante, 4 rodas). */
export function createKart(): Group {
  const kart = new Group();
  kart.name = 'kart';
  kart.add(box([0.7, 0.12, 1.3], BODY, [0, 0.2, 0]));
  kart.add(box([0.5, 0.18, 0.3], BODY, [0, 0.3, 0.55]));
  const seat = named(new Object3D(), 'assento', kart, [0, 0.28, -0.22]);
  seat.add(box([0.36, 0.06, 0.34], DARK), box([0.36, 0.4, 0.06], DARK, [0, 0.2, -0.17]));

  const wheelMount = named(new Group(), 'volante', kart, [0, 0.62, 0.3]);
  wheelMount.rotation.x = -0.9; // coluna inclinada para o piloto
  const rim = new Mesh(new TorusGeometry(0.13, 0.02, 8, 24), DARK);
  wheelMount.add(rim, box([0.24, 0.03, 0.02], DARK));

  const wheels: [string, number, number][] = [
    ['roda_frente_esquerda', WHEEL_TRACK, WHEEL_BASE_FRONT],
    ['roda_frente_direita', -WHEEL_TRACK, WHEEL_BASE_FRONT],
    ['roda_traseira_esquerda', WHEEL_TRACK, WHEEL_BASE_REAR],
    ['roda_traseira_direita', -WHEEL_TRACK, WHEEL_BASE_REAR],
  ];
  for (const [name, x, z] of wheels) {
    const wheel = named(new Group(), name, kart, [x, WHEEL_RADIUS, z]);
    const tire = new Mesh(new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 16), DARK);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wheel.add(tire);
  }
  return kart;
}

// ─── Piloto ───────────────────────────────────────────────────────────────────

/** Piloto com os bones da convenção; peças rígidas penduradas nos bones. */
export function createDriver(): Group {
  const root = new Group();
  root.name = 'piloto';
  const bone = (name: string, parent: Object3D, at: Vec3): Bone => named(new Bone(), name, parent, at);

  const hips = bone('Hips', root, [0, 0.08, 0]);
  hips.add(box([0.26, 0.1, 0.18], SUIT));
  const spine = bone('Spine', hips, [0, 0.1, 0]);
  spine.add(box([0.24, 0.12, 0.16], SUIT, [0, 0.05, 0]));
  const chest = bone('Chest', spine, [0, 0.12, 0]);
  chest.add(box([0.3, 0.18, 0.18], SUIT, [0, 0.08, 0]));
  const neck = bone('Neck', chest, [0, 0.19, 0]);
  const head = bone('Head', neck, [0, 0.04, 0]);
  head.add(box([0.24, 0.24, 0.26], HELMET, [0, 0.12, 0]), box([0.2, 0.08, 0.02], DARK, [0, 0.13, 0.13]));

  for (const [side, x] of [['Left', 0.18], ['Right', -0.18]] as const) {
    const upper = bone(`${side}UpperArm`, chest, [x, 0.14, 0]);
    upper.add(box([0.08, 0.18, 0.08], SUIT, [0, -0.09, 0]));
    const lower = bone(`${side}LowerArm`, upper, [0, -0.18, 0]);
    lower.add(box([0.07, 0.16, 0.07], SUIT, [0, -0.08, 0]));
    const hand = bone(`${side}Hand`, lower, [0, -0.16, 0]);
    hand.add(box([0.07, 0.07, 0.07], SKIN, [0, -0.03, 0]));

    const thigh = bone(`${side}UpLeg`, hips, [x * 0.5, -0.04, 0]);
    thigh.add(box([0.1, 0.24, 0.1], SUIT, [0, -0.12, 0]));
    const shin = bone(`${side}Leg`, thigh, [0, -0.24, 0]);
    shin.add(box([0.09, 0.22, 0.09], SUIT, [0, -0.11, 0]));
    const foot = bone(`${side}Foot`, shin, [0, -0.22, 0]);
    foot.add(box([0.1, 0.06, 0.16], DARK, [0, -0.02, 0.04]));
  }
  return root;
}

// ─── Clipes "baked" ─────────────────────────────────────────────────────────

/** Rotação local por bone (Euler XYZ, rad). */
type Pose = Record<string, Vec3>;

/** Sentado com as mãos no volante reto: a base de todo clipe de direção. */
const SIT: Pose = {
  Spine: [0.1, 0, 0],
  Chest: [0, 0, 0],
  Head: [-0.1, 0, 0],
  LeftUpperArm: [-1.25, 0, -0.25],
  RightUpperArm: [-1.25, 0, 0.25],
  LeftLowerArm: [-0.55, 0, 0],
  RightLowerArm: [-0.55, 0, 0],
  LeftUpLeg: [-1.45, 0, 0],
  RightUpLeg: [-1.45, 0, 0],
  LeftLeg: [0.35, 0, 0],
  RightLeg: [0.35, 0, 0],
  LeftFoot: [0.9, 0, 0],
  RightFoot: [0.9, 0, 0],
};

/** Volante virado para a esquerda (`sign` +1) ou direita (−1), com intensidade `k`. */
function steerPose(sign: number, k: number): Pose {
  return {
    ...SIT,
    // mão do lado da curva desce, a outra sobe; o tronco acompanha o volante
    LeftUpperArm: [-1.25 + 0.3 * k * sign, 0, -0.25],
    RightUpperArm: [-1.25 - 0.3 * k * sign, 0, 0.25],
    Chest: [0, 0.18 * k * sign, 0.08 * k * sign],
    Spine: [0.1, 0.06 * k * sign, 0],
  };
}

const BRAKE: Pose = {
  ...SIT,
  Spine: [-0.05, 0, 0], // braços travados empurram o tronco contra o banco
  LeftLowerArm: [-0.25, 0, 0],
  RightLowerArm: [-0.25, 0, 0],
  RightUpLeg: [-1.3, 0, 0], // pé direito no freio
  RightLeg: [0.1, 0, 0],
  RightFoot: [0.55, 0, 0],
};

const ARMS_UP: Pose = { ...SIT, LeftUpperArm: [-2.9, 0, -0.4], RightUpperArm: [-2.9, 0, 0.4], LeftLowerArm: [0, 0, 0], RightLowerArm: [0, 0, 0], Head: [-0.25, 0, 0] };
const WAVE_L: Pose = { ...ARMS_UP, LeftUpperArm: [-2.9, 0, -0.7], RightUpperArm: [-2.9, 0, 0.1] };
const WAVE_R: Pose = { ...ARMS_UP, LeftUpperArm: [-2.9, 0, -0.1], RightUpperArm: [-2.9, 0, 0.7] };

/** Leve respiração/vibração em cima de uma pose. */
function bob(pose: Pose, amount: number): Pose {
  const s = pose.Spine ?? [0, 0, 0];
  return { ...pose, Spine: [s[0] + amount, s[1], s[2]] };
}

const _q = new Quaternion();
const _e = new Euler();

/** Clipe com um keyframe por pose, espaçados igualmente em `duration`. */
function clip(name: string, duration: number, poses: Pose[]): AnimationClip {
  const times = poses.map((_, i) => (poses.length === 1 ? 0 : (i / (poses.length - 1)) * duration));
  const bones = Object.keys(poses[0]!);
  const tracks = bones.map((boneName) => {
    const values: number[] = [];
    for (const p of poses) {
      const r = p[boneName] ?? [0, 0, 0];
      values.push(..._q.setFromEuler(_e.set(r[0], r[1], r[2])).toArray());
    }
    return new QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values);
  });
  return new AnimationClip(name, duration, tracks);
}

const LOOP = 1.2;
const BOB = 0.03;

/** Os 8 clipes da convenção, com a pose de mãos/pés de cada estado. */
export function createDriverClips(): AnimationClip[] {
  return [
    clip('idle', LOOP * 2, [SIT, bob(SIT, BOB), SIT]),
    clip('accelerate', LOOP / 2, [bob(SIT, BOB), SIT, bob(SIT, BOB)]),
    clip('brake', LOOP, [BRAKE, bob(BRAKE, BOB), BRAKE]),
    clip('steer_left', LOOP, [steerPose(1, 1), bob(steerPose(1, 1), BOB), steerPose(1, 1)]),
    clip('steer_right', LOOP, [steerPose(-1, 1), bob(steerPose(-1, 1), BOB), steerPose(-1, 1)]),
    clip('drift_left', LOOP, [steerPose(1, 1.6), bob(steerPose(1, 1.6), BOB), steerPose(1, 1.6)]),
    clip('drift_right', LOOP, [steerPose(-1, 1.6), bob(steerPose(-1, 1.6), BOB), steerPose(-1, 1.6)]),
    clip('victory', 2, [SIT, ARMS_UP, WAVE_L, WAVE_R, WAVE_L, ARMS_UP]),
  ];
}
