// zod/v3 — compatível com Hermes/CortexNative (ver SceneFile.ts).
import { z } from 'zod/v3';

import type { Vec3 } from './SceneDefinition.js';

/**
 * **Manifesto de kit** (`kit.json`, ADR-0053) — o vocabulário persistente de um
 * pacote de assets: papel físico (`role`), tema (`tags`), função de design
 * (`gameplayRole`), bbox (`size`), preset de collider e **âncoras** (sockets)
 * de cada `.glb`. É o que permite à cena declarar `attach` (encaixe por socket)
 * em vez de coordenadas chutadas, e ao Chat IA raciocinar por intenção.
 *
 * O engine consome via {@link parseKit} + `buildScene(scene, defs, { kit })`.
 */

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

/**
 * Âncora (socket) em espaço LOCAL do asset. `kind: 'connect'` = encaixe de borda
 * (duas `connect` se acoplam quando suas `dir` se encaram); `'surface'` = pousar
 * em cima. `dir` é a normal de saída.
 */
const kitAnchorSchema = z.object({
  at: vec3,
  kind: z.enum(['surface', 'connect']),
  dir: vec3.optional(),
});

/** Preset de collider do asset (o `collider` explícito do nó/overlay vence). */
const kitColliderSchema = z.object({
  shape: z.enum(['box', 'circle', 'capsule', 'heightfield']).optional(),
  solid: z.boolean().optional(),
  oneWay: z.boolean().optional(),
});

const kitAssetSchema = z.object({
  /**
   * Natureza física. Vocabulário canônico (aberto a extensão): `ground | platform
   * | connector | prop | hazard | collectible | decoration | cap | tile |
   * player-start | character | enemy | rig | character-part | background`.
   */
  role: z.string().min(1),
  /** Tema/bioma + classe de tamanho (`forest`, `S/M/L`, …). */
  tags: z.array(z.string()).optional(),
  /** Bbox `[w, h, d]` em Y-up (cacheado do pipeline de kit). */
  size: vec3.optional(),
  /** Função de design: `guidance | reward | challenge | safe-zone | landmark | cover | resource | path | hazard | player`. */
  gameplayRole: z.array(z.string()).optional(),
  collider: kitColliderSchema.optional(),
  /** Sockets nomeados (`top`, `edge_left`, `a`/`b` de conector, …). */
  anchors: z.record(z.string(), kitAnchorSchema).optional(),
  thumb: z.string().optional(),
});

const kitSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  /** Unidade de grid/snap do kit (escala de espaçamento). */
  module: z.number().optional(),
  /** Design tokens de atmosfera (nome do tema). */
  theme: z.string().optional(),
  /** Chaves = caminho do asset dentro do kit (ex.: `assets/bridge.glb`). */
  assets: z.record(z.string(), kitAssetSchema),
});

/** Âncora/socket de um asset do kit (ver {@link kitAnchorSchema}). */
export type KitAnchor = z.infer<typeof kitAnchorSchema>;
/** Metadados de um asset do kit (ver {@link kitAssetSchema}). */
export type KitAsset = z.infer<typeof kitAssetSchema>;
/** Manifesto de kit parseado (ver {@link kitSchema}). */
export type KitManifest = z.infer<typeof kitSchema>;

/**
 * Valida/parseia um `kit.json` importado. Retorna `null` se inválido (padrão
 * {@link parseSceneDefinition} — quem consome decide falhar alto).
 */
export function parseKit(raw: unknown): KitManifest | null {
  const r = kitSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/**
 * Acha os metadados de um asset pelo `url` do nó da cena. As chaves do
 * `kit.json` são relativas ao kit (`assets/rock.glb`); os `url` da cena
 * costumam ter prefixo de projeto (`assets/platformer-base/rock.glb`) — o
 * match tenta chave exata, sufixo de caminho e por último o basename.
 */
export function kitAssetFor(
  kits: KitManifest | KitManifest[] | undefined,
  url: string,
): KitAsset | undefined {
  if (!kits) return undefined;
  const list = Array.isArray(kits) ? kits : [kits];
  const norm = url.replace(/\\/g, '/');
  const base = norm.slice(norm.lastIndexOf('/') + 1);
  for (const kit of list) {
    const exact = kit.assets[norm];
    if (exact) return exact;
    for (const [key, asset] of Object.entries(kit.assets)) {
      if (norm.endsWith(`/${key}`)) return asset;
    }
    for (const [key, asset] of Object.entries(kit.assets)) {
      if (key.slice(key.lastIndexOf('/') + 1) === base) return asset;
    }
  }
  return undefined;
}

/** Pose (subset) de um nó já instanciado, usada na resolução de `attach`. */
export interface AttachPose {
  position: Vec3;
  /** Rotação Y (rad) — encaixe alinha só o yaw (contexto plataforma/chão). */
  rotationY: number;
  scale: Vec3;
}

const rotY = (v: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};
const mulScale = (v: Vec3, s: Vec3): Vec3 => [v[0] * s[0], v[1] * s[1], v[2] * s[2]];
/** Heading no plano XZ (rad). `null` quando o vetor é vertical (sem heading). */
const heading = (v: Vec3): number | null =>
  Math.abs(v[0]) < 1e-9 && Math.abs(v[2]) < 1e-9 ? null : Math.atan2(v[0], v[2]);

/**
 * Resolve o transform de um nó com `attach` (ADR-0053 §2): computa a pose que
 * faz o socket próprio (`ownAnchor`) **coincidir** com o socket do alvo
 * (`targetAnchor`), com as `dir` se encarando quando ambos são `connect`.
 *
 * Matemática PURA (sem three) — unit-testável. Yaw-only por decisão: âncoras de
 * kit são autoradas no plano do chão; alinhar rotação completa em 3D exigiria
 * âncoras com frame completo, que o `kit.json` não tem.
 */
export function resolveAttachTransform(
  target: AttachPose,
  targetAnchor: KitAnchor,
  ownAnchor: KitAnchor,
  own: { rotationY: number; scale: Vec3 },
): { position: Vec3; rotationY: number } {
  // Socket do alvo em mundo: pos + rotY(escala local do socket).
  const targetSocketWorld: Vec3 = (() => {
    const local = rotY(mulScale(targetAnchor.at, target.scale), target.rotationY);
    return [
      target.position[0] + local[0],
      target.position[1] + local[1],
      target.position[2] + local[2],
    ];
  })();

  // Yaw: se ambos são `connect` com `dir`, a dir própria deve ENCARAR a do alvo
  // (dir_own_world = -dir_target_world). Senão, mantém o yaw autorado.
  let rotationY = own.rotationY;
  if (targetAnchor.kind === 'connect' && ownAnchor.kind === 'connect' && targetAnchor.dir && ownAnchor.dir) {
    const targetDirWorld = rotY(targetAnchor.dir, target.rotationY);
    const desired: Vec3 = [-targetDirWorld[0], -targetDirWorld[1], -targetDirWorld[2]];
    const hDesired = heading(desired);
    const hOwn = heading(ownAnchor.dir);
    if (hDesired !== null && hOwn !== null) rotationY = hDesired - hOwn;
  }

  // Posição: socket próprio (rotacionado/escalado) coincide com o do alvo.
  const ownOffset = rotY(mulScale(ownAnchor.at, own.scale), rotationY);
  return {
    position: [
      targetSocketWorld[0] - ownOffset[0],
      targetSocketWorld[1] - ownOffset[1],
      targetSocketWorld[2] - ownOffset[2],
    ],
    rotationY,
  };
}
