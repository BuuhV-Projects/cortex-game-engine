import { z } from 'zod';
import type { Vec3 } from './SceneDefinition.js';

/**
 * **Manifesto do kit** (`kit.json`, V1) — o *vocabulário* do design system
 * (ADR-0053). Tagueia cada asset `.glb` de um pacote em três eixos ortogonais —
 * `role` (natureza física), `tags` (tema/bioma) e `gameplayRole` (função de
 * design) — além de `size` (bbox), `collider` preset, `anchors` (sockets) e
 * `thumb`. É a memória semântica persistente do pacote: o {@link buildScene} usa
 * o preset de collider por `role` e resolve `attach` (placement por socket) a
 * partir das `anchors`.
 *
 * Produzido pela skill `process-asset-kit` (e, no futuro, pelo `inspect_assets`).
 */

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

/**
 * Ponto de conexão de um asset, em espaço LOCAL. `kind: 'surface'` = pousar em
 * cima (ex.: topo de uma ilha); `kind: 'connect'` = encaixe de borda (dois
 * `connect` se acoplam quando suas `dir` são opostas). `dir` é a normal de saída.
 */
const anchorSchema = z.object({
  at: vec3,
  kind: z.enum(['surface', 'connect']),
  dir: vec3.optional(),
});

/** Preset de collider 2D do asset (mesma forma do `collider` de {@link SceneNode}). */
const kitColliderSchema = z
  .object({
    shape: z.enum(['box', 'circle', 'capsule', 'heightfield']).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    solid: z.boolean().optional(),
    oneWay: z.boolean().optional(),
    offsetX: z.number().optional(),
    offsetY: z.number().optional(),
    points: z.array(z.tuple([z.number(), z.number()])).optional(),
  })
  .optional();

/**
 * Eixo `role` — natureza física do asset (enum fechado, ADR-0053 §6). Cada papel
 * carrega um preset de collider default no kit.
 */
export const KIT_ROLES = [
  'ground',
  'platform',
  'connector',
  'prop',
  'hazard',
  'collectible',
  'decoration',
  'cap',
  'tile',
  'player-start',
  'character',
  'enemy',
  'background',
] as const;

/** Uma animação de sprite num kit 2D: índices de frame + cadência. */
const kitSpriteAnimSchema = z.object({
  frames: z.array(z.number().int().nonnegative()).min(1),
  fps: z.number().positive().optional(),
  loop: z.boolean().optional(),
});

/**
 * **Framedata 2D** de um asset sprite/spritesheet (ADR-0057). Carrega a grade de
 * frames e as animações nomeadas pra o nó `sprite` da cena herdar do kit (igual
 * o `collider` por `role`) — assim o nó só referencia a `url` e o kit fornece a
 * grade/animações. Ausente em assets 3D (`.glb`).
 */
const kitSpriteSchema = z
  .object({
    /** Largura de um frame em px (ou use `columns`). */
    frameWidth: z.number().int().positive().optional(),
    /** Altura de um frame em px (ou use `rows`). */
    frameHeight: z.number().int().positive().optional(),
    /** Nº de colunas (frame = larguraTex / columns). */
    columns: z.number().int().positive().optional(),
    /** Nº de linhas. */
    rows: z.number().int().positive().optional(),
    /** Animações nomeadas (`{ idle: { frames: [0] }, walk: {...} }`). */
    animations: z.record(z.string(), kitSpriteAnimSchema).optional(),
    /** Animação inicial. */
    initial: z.string().optional(),
    /** Px por unidade de mundo. Default 100. */
    pixelsPerUnit: z.number().positive().optional(),
  })
  .optional();

const kitAssetSchema = z.object({
  role: z.enum(KIT_ROLES),
  /** Tema/bioma + size-class (`forest`, `rock`, `S/M/L`, …). */
  tags: z.array(z.string()).optional(),
  /** Função de design (`guidance`, `reward`, `landmark`, `cover`, …). */
  gameplayRole: z.array(z.string()).optional(),
  /** Bounding box `[x, y, z]` em unidades do engine (Y-up). */
  size: vec3.optional(),
  collider: kitColliderSchema,
  /** Framedata 2D (grade + animações) — só em assets sprite/spritesheet. */
  sprite: kitSpriteSchema,
  /** Sockets/âncoras por nome (`top`, `edge_left`, …). */
  anchors: z.record(z.string(), anchorSchema).optional(),
  /** Caminho relativo do thumbnail (`thumbnails/<name>.png`). */
  thumb: z.string().optional(),
});

const kitDefinitionSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  /** Unidade de grid/snap em unidades de mundo (a "escala de espaçamento"). */
  module: z.number().optional(),
  /** Nome do tema (paleta + atmosfera) — tokens resolvidos à parte (ADR-0053 §3). */
  theme: z.string().optional(),
  /** Assets por chave (caminho relativo, ex.: `assets/bridge_001.glb`). */
  assets: z.record(z.string(), kitAssetSchema),
});

export type KitAnchor = z.infer<typeof anchorSchema>;
export type KitAsset = z.infer<typeof kitAssetSchema>;
/** Framedata 2D de um asset sprite no kit (grade + animações). Ver {@link KitAsset}. */
export type KitSprite = NonNullable<KitAsset['sprite']>;
export type KitDefinition = z.infer<typeof kitDefinitionSchema>;

/** Valida/parseia um objeto desconhecido (ex.: import de `kit.json`) num {@link KitDefinition}. */
export function parseKit(raw: unknown): KitDefinition | null {
  const r = kitDefinitionSchema.safeParse(raw);
  return r.success ? r.data : null;
}

function basename(url: string): string {
  const i = Math.max(url.lastIndexOf('/'), url.lastIndexOf('\\'));
  return i >= 0 ? url.slice(i + 1) : url;
}

/**
 * Acha o {@link KitAsset} de um `url` de nó. Casa pela **chave exata** do kit
 * (`assets/bridge.glb`) ou, em fallback, pelo **basename** (`bridge.glb`) — assim
 * o nó pode referenciar o asset com prefixo diferente do usado no kit.
 */
export function kitAssetFor(
  kits: KitDefinition | KitDefinition[] | undefined,
  url: string,
): KitAsset | undefined {
  if (!kits) return undefined;
  const list = Array.isArray(kits) ? kits : [kits];
  const base = basename(url);
  for (const kit of list) {
    const exact = kit.assets[url];
    if (exact) return exact;
    for (const [key, asset] of Object.entries(kit.assets)) {
      if (basename(key) === base) return asset;
    }
  }
  return undefined;
}

/** Âncora nomeada de um asset (via {@link kitAssetFor}), ou `undefined`. */
export function kitAnchor(
  kits: KitDefinition | KitDefinition[] | undefined,
  url: string,
  socket: string,
): KitAnchor | undefined {
  return kitAssetFor(kits, url)?.anchors?.[socket];
}

/**
 * Posição pra o `socket` deste nó coincidir com a âncora `toSocket` do alvo já
 * posicionado: `alvo + ancoraAlvo − ancoraEste (+ offset)`. Translação pura — é o
 * análogo do `place` (grounding em Y) para o plano X/Z. Rotação/`dir` ficam pra
 * uma fase posterior (ADR-0053).
 */
export function resolveAttachPosition(
  targetPos: Vec3,
  targetAnchor: Vec3,
  thisAnchor: Vec3,
  offset?: Vec3,
): Vec3 {
  return [
    targetPos[0] + targetAnchor[0] - thisAnchor[0] + (offset?.[0] ?? 0),
    targetPos[1] + targetAnchor[1] - thisAnchor[1] + (offset?.[1] ?? 0),
    targetPos[2] + targetAnchor[2] - thisAnchor[2] + (offset?.[2] ?? 0),
  ];
}

/**
 * Ordena ids de nós com `attach` por dependência (o **alvo é resolvido antes**),
 * via ordenação topológica. **Falha alto** (lança) em ciclo ou alvo ausente —
 * nunca silenciar numa pose chutada (ADR-0053). `exists` informa se um id de alvo
 * existe na cena (mesmo que não tenha `attach`).
 */
export function attachResolveOrder(
  items: { id: string; to: string }[],
  exists: (id: string) => boolean,
): string[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (id: string, chain: string[]): void => {
    const st = state.get(id);
    if (st === 'done') return;
    if (st === 'visiting') {
      throw new Error(`attach: ciclo de dependência (${[...chain, id].join(' → ')})`);
    }
    const item = byId.get(id);
    if (item) {
      if (!exists(item.to)) {
        throw new Error(`attach: nó "${id}" referencia alvo inexistente "${item.to}"`);
      }
      state.set(id, 'visiting');
      visit(item.to, [...chain, id]);
      state.set(id, 'done');
      order.push(id);
    }
    // se não tem attach próprio, não entra na ordem (já está posicionado)
  };

  for (const it of items) visit(it.id, []);
  return order;
}
