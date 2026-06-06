import { z } from 'zod';

/**
 * **Definição data-driven de cena** (V1). A cena vira DADO: uma lista de nós que
 * o {@link SceneBuilder} instancia — modelos `.glb`, luzes, água, primitivas —
 * em vez de código imperativo. Isso torna delete/add limpos (o loader é o único
 * ponto de instanciação: nó deletado nunca é criado, sem desperdício) e permite
 * o editor escrever de volta (ver overlay no SceneBuilder). Lógica de jogo segue
 * em TS (systems/components); o JSON é só a cena. Ver ADR.
 *
 * Autoria: o JSON pode ser multi-arquivo (cada `SceneDefinition` é concatenado)
 * e **importado** (`import x from './scenes/ilha.json'`) pra o Vite bundlar no
 * build — multi-arquivo em dev, bundle único no build, sem fetch em runtime.
 */

/** `[x, y, z]`. */
export type Vec3 = [number, number, number];

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
/** Escala uniforme (número) ou por-eixo (`[x,y,z]`). */
const scaleSchema = z.union([z.number(), vec3]);
/** Cor: hex string amigável (`"#9fd6ee"`) ou número (`0x9fd6ee`). O three aceita ambos. */
const colorSchema = z.union([z.number(), z.string()]);

const transformSchema = z
  .object({ position: vec3.optional(), rotation: vec3.optional(), scale: scaleSchema.optional() })
  .optional();

/**
 * Diretiva de grounding: o builder chama `placeOnGround` (assenta a BASE em `y`,
 * centra em `x,z`), em vez de você dar a pose exata. A IA autora com `place` pra
 * não chutar `y`; ao mover no editor, vira `transform` explícito.
 */
const placeSchema = z
  .object({
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
    rotY: z.number().optional(),
    scale: z.number().optional(),
  })
  .optional();

/**
 * Collider AABB de plataforma 2.5D. Se `width`/`height` forem omitidos, o builder
 * deriva do bounding box do objeto. `solid` (default true) = plataforma/parede;
 * `oneWay` = atravessável por baixo.
 */
const colliderSchema = z
  .object({
    width: z.number().optional(),
    height: z.number().optional(),
    solid: z.boolean().optional(),
    oneWay: z.boolean().optional(),
  })
  .optional();

/** Marca o nó como o PLAYER (corpo de plataforma + alvo da câmera). */
const playerSchema = z
  .union([
    z.boolean(),
    z.object({
      moveSpeed: z.number().optional(),
      jumpSpeed: z.number().optional(),
      gravity: z.number().optional(),
      maxFall: z.number().optional(),
    }),
  ])
  .optional();

const baseFields = {
  /** Identificador único — chave pra overlay/editor e `Object3D.name`. */
  id: z.string().min(1),
  transform: transformSchema,
  place: placeSchema,
  castShadow: z.boolean().optional(),
  receiveShadow: z.boolean().optional(),
  /** Collider 2D (plataformer): vira sólido/plataforma. */
  collider: colliderSchema,
  /** Marca como player (controller + corpo + alvo da câmera). */
  player: playerSchema,
};

const modelNode = z.object({ type: z.literal('model'), url: z.string().min(1), ...baseFields });
const primitiveNode = z.object({
  type: z.literal('primitive'),
  shape: z.enum(['box', 'cylinder', 'plane', 'sphere']),
  size: z.union([z.number(), vec3]).optional(),
  color: colorSchema.optional(),
  roughness: z.number().optional(),
  metalness: z.number().optional(),
  ...baseFields,
});
const lightNode = z.object({
  type: z.literal('light'),
  light: z.enum(['directional', 'hemisphere', 'ambient']),
  color: colorSchema.optional(),
  /** Cor do chão (só `hemisphere`). */
  groundColor: colorSchema.optional(),
  intensity: z.number().optional(),
  position: vec3.optional(),
  castShadow: z.boolean().optional(),
  id: z.string().min(1),
});
const waterNode = z.object({
  type: z.literal('water'),
  y: z.number().optional(),
  color: colorSchema.optional(),
  causticsUrl: z.string().optional(),
  repeat: z.number().optional(),
  causticsIntensity: z.number().optional(),
  flowSpeed: z.tuple([z.number(), z.number()]).optional(),
  id: z.string().min(1),
});

const sceneNodeSchema = z.discriminatedUnion('type', [modelNode, primitiveNode, lightNode, waterNode]);

const sceneDefinitionSchema = z.object({
  version: z.literal(1),
  nodes: z.array(sceneNodeSchema),
  /** Cor de fundo do céu (hex). Em multi-arquivo, o último definido vence. */
  background: colorSchema.optional(),
  /** Névoa (cor/near/far). */
  fog: z.object({ color: colorSchema, near: z.number(), far: z.number() }).optional(),
  /** Atalho pro preset de iluminação exterior (sol+sombras+tone mapping). */
  outdoorLighting: z
    .object({
      sky: colorSchema.optional(),
      sunColor: colorSchema.optional(),
      sunIntensity: z.number().optional(),
      exposure: z.number().optional(),
    })
    .optional(),
});

// ─── Tipos públicos (inferidos do schema) ─────────────────────────────────────

export type ModelNode = z.infer<typeof modelNode>;
export type PrimitiveNode = z.infer<typeof primitiveNode>;
export type LightNode = z.infer<typeof lightNode>;
export type WaterNode = z.infer<typeof waterNode>;
/** Um nó da cena (união discriminada por `type`). */
export type SceneNode = z.infer<typeof sceneNodeSchema>;
/** Uma definição de cena (um arquivo). */
export type SceneDefinition = z.infer<typeof sceneDefinitionSchema>;

/** Valida/parseia um objeto desconhecido (ex.: import de JSON) numa {@link SceneDefinition}. */
export function parseSceneDefinition(raw: unknown): SceneDefinition | null {
  const r = sceneDefinitionSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Valida um único {@link SceneNode} (ex.: nó adicionado pelo editor na overlay). */
export function parseSceneNode(raw: unknown): SceneNode | null {
  const r = sceneNodeSchema.safeParse(raw);
  return r.success ? r.data : null;
}
