// zod/v3 — compatível com Hermes/CortexNative (ver SceneFile.ts).
import { z } from 'zod/v3';
import { roadFieldsSchema } from '../road/roadFields.js';

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

export type { Vec3 } from './sceneFieldSchemas.js';
import {
  vec3, scaleSchema, colorSchema, transformSchema, placeSchema, colliderSchema, animationSchema, characterSchema, vec3Obj, rapierBodySchema, playerSchema, materialSchema, vehicleSchema, attachSchema, baseFields,
} from './sceneFieldSchemas.js';

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

/**
 * **Malha de blockout editável** (ProBuilder — SPEC-0071). Carrega uma **receita de
 * forma** paramétrica (`shape`, regenerável: cubo/escada/rampa/arco/parede…) OU
 * **geometria explícita** (`positions`/`faces`, malha "freeform" após edição de
 * elementos). Precedência no {@link buildScene}: override do editor
 * (`overlay.data.geometry[id]`) > `shape` > geometria explícita. Como tem todos os
 * `baseFields`, collider/rapierBody/material/matte funcionam no Inspector.
 */
const meshNode = z.object({
  type: z.literal('mesh'),
  shape: z
    .object({
      kind: z.enum(['cube', 'plane', 'cylinder', 'sphere', 'cone', 'stairs', 'ramp', 'arch', 'wallOpening']),
      params: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  /** Vértices lógicos (malha freeform). Usado quando não há `shape`. */
  positions: z.array(vec3).optional(),
  /** Faces poligonais (índices em `positions`), em ordem CCW. */
  faces: z.array(z.array(z.number().int().nonnegative())).optional(),
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
/**
 * **Emissor de partículas** (ADR-0168 / SPEC-0169) — fagulha, poeira, fumaça,
 * respingo. Faixas aceitam `[min, max]` (sorteia por partícula) ou um número.
 *
 * A cor é do EMISSOR, não da partícula, e o fim da vida é por ESCALA (a partícula
 * encolhe): `instanceColor` é vertex color de instância, que o compilador de
 * shader do host nativo miscompila — ver o ADR.
 */
const particleRange = z.union([z.number(), z.tuple([z.number(), z.number()])]);
const particlesNode = z.object({
  type: z.literal('particles'),
  id: z.string().min(1),
  place: placeSchema.optional(),
  /** Capacidade do pool (teto de partículas vivas). Default 128. */
  max: z.number().int().min(1).optional(),
  /** Emissão contínua (partículas/s). `0` = só `burst`. Default 0. */
  rate: z.number().min(0).optional(),
  /** Emissão instantânea ao nascer. Default 0. */
  burst: z.number().int().min(0).optional(),
  /** `false` = solta uma leva e para (efeito de evento). Default true. */
  loop: z.boolean().optional(),
  life: particleRange.optional(),
  size: particleRange.optional(),
  speed: particleRange.optional(),
  spin: particleRange.optional(),
  direction: vec3.optional(),
  /** Abertura do cone em torno de `direction` (rad). Default 0.4. */
  spread: z.number().min(0).optional(),
  /** Aceleração em Y (u/s²). Default 0. */
  gravity: z.number().optional(),
  /** Fração da velocidade perdida por segundo. Default 0. */
  drag: z.number().min(0).optional(),
  color: colorSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
  blending: z.enum(['additive', 'normal']).optional(),
  /** Textura do sprite. Ausente = disco suave gerado por código. */
  texture: z.string().optional(),
});
const waterNode = z.object({
  type: z.literal('water'),
  style: z.enum(['simple', 'cartoon']).optional(),
  waveHeight: z.number().min(0).max(2).optional(),
  waveLength: z.number().positive().optional(),
  waveSpeed: z.number().min(0).max(10).optional(),
  foamStrength: z.number().min(0).max(1).optional(),
  foamWidth: z.number().positive().max(5).optional(),
  segments: z.number().int().min(16).max(256).optional(),
  y: z.number().optional(),
  color: colorSchema.optional(),
  causticsUrl: z.string().optional(),
  repeat: z.number().optional(),
  causticsIntensity: z.number().optional(),
  flowSpeed: z.tuple([z.number(), z.number()]).optional(),
  /** Lado do plano (quadrado), em unidades. Default `400`. */
  size: z.number().optional(),
  /**
   * Seguir a câmera (mar "infinito"): o plano re-centra no XZ da câmera e a borda
   * some no fog. Default `true`. Desligue (`false`) pra um lago/poça fixo.
   */
  follow: z.boolean().optional(),
  id: z.string().min(1),
});

const backgroundNode = z.object({
  type: z.literal('background'),
  /** URL da imagem (jpg/png) do backdrop — tileável na horizontal. */
  image: z.string().min(1),
  /** Parallax 0–1 (0 = travado na tela, 1 = anda com o mundo). Default 0.3. */
  parallax: z.number().optional(),
  /** Distância no Z atrás da câmera. Default 40. */
  distance: z.number().optional(),
  /** Altura em unidades de mundo. Default 30. */
  height: z.number().optional(),
  /** Largura em múltiplos da altura. Default 2.6. */
  widthFactor: z.number().optional(),
  id: z.string().min(1),
});

/** Uma animação de sprite no JSON: índices de frame na grade + cadência. */
const spriteAnimSchema = z.object({
  /** Frames (índices na spritesheet, 0 = topo-esquerda), na ordem de exibição. */
  frames: z.array(z.number().int().nonnegative()).min(1),
  /** Frames por segundo. Default 10. */
  fps: z.number().positive().optional(),
  /** Repete em loop? Default true (false = trava no último frame). */
  loop: z.boolean().optional(),
});

const spriteNode = z.object({
  type: z.literal('sprite'),
  /** URL da imagem (png/jpg/webp) — o sprite ou a spritesheet. */
  url: z.string().min(1),
  /** Largura de um frame em px (spritesheet). Omitir = imagem inteira é 1 frame. */
  frameWidth: z.number().int().positive().optional(),
  /** Altura de um frame em px (spritesheet). */
  frameHeight: z.number().int().positive().optional(),
  /** Alternativa a frameWidth: nº de colunas (frame = larguraTex / columns). */
  columns: z.number().int().positive().optional(),
  /** Alternativa a frameHeight: nº de linhas. */
  rows: z.number().int().positive().optional(),
  /** Animações nomeadas (`{ idle: { frames: [0], fps: 4 }, run: {...} }`). */
  animations: z.record(z.string(), spriteAnimSchema).optional(),
  /** Animação inicial a tocar. */
  initial: z.string().optional(),
  /** Px por unidade de mundo pra dimensionar o sprite. Default 100. */
  pixelsPerUnit: z.number().positive().optional(),
  /** Largura em unidades de mundo (sobrescreve o cálculo por pixelsPerUnit). */
  width: z.number().positive().optional(),
  /** Altura em unidades de mundo. */
  height: z.number().positive().optional(),
  /** Nearest filter (pixel art). Default true. */
  pixelated: z.boolean().optional(),
  /** Recorte por alpha (0 = sem corte; 0.5 bom pra borda dura). Default 0.5. */
  alphaTest: z.number().min(0).max(1).optional(),
  id: z.string().min(1),
  transform: transformSchema,
  place: placeSchema,
});

const terrainNode = z.object({
  type: z.literal('terrain'),
  /** Largura × profundidade (XZ) em unidades. Número = quadrado. Default 50. */
  size: z.union([z.number().positive(), z.tuple([z.number().positive(), z.number().positive()])]).optional(),
  /** Segmentos por lado (resolução da grade). Default 64. */
  resolution: z.number().int().positive().optional(),
  /**
   * Heightmap (row-major, `(res+1)²` alturas) — autoria do editor. Cena montada em código pode passar um
   * `Float32Array`/`Float64Array` (dado assado, SPEC-0728); o arquivo JSON fica com `number[]`.
   */
  heights: z.union([z.array(z.number()), z.instanceof(Float32Array), z.instanceof(Float64Array)]).optional(),
  /** Cor base do material. Default verde-grama. */
  color: colorSchema.optional(),
  id: z.string().min(1),
  transform: transformSchema,
  place: placeSchema,
});

/**
 * **Vegetação instanciada** (SPEC-0077): espalha muitas cópias de um modelo (árvore/
 * grama/arbusto) numa malha instanciada. As `instances` (plano `[x,y,z,rotY,scale]`)
 * são autoradas pelo pincel do editor; `model` é o `.glb` (omitido = placeholder).
 */
const vegetationNode = z.object({
  type: z.literal('vegetation'),
  /** URL do `.glb` do modelo. Omitido = placeholder procedural (ver `kind`). */
  model: z.string().optional(),
  /** Placeholder quando sem `model`: `tree` (default) ou `grass`. */
  kind: z.enum(['tree', 'grass']).optional(),
  /** Instâncias espalhadas: plano `[x,y,z,rotY,scale]` por instância. */
  instances: z.array(z.number()).optional(),
  /** Capacidade máxima de instâncias (buffer pré-alocado). Default 8192. */
  capacity: z.number().int().positive().optional(),
  /**
   * Colide com o player (vira `cortexSolid` — o personagem é empurrado pra fora dos
   * troncos). Default: liga pra árvores/modelos, desliga pra `kind: 'grass'`.
   */
  collide: z.boolean().optional(),
  id: z.string().min(1),
  transform: transformSchema,
});

/**
 * **Underlay** — imagem de referência (plano texturizado no chão) pra desenhar blockouts
 * por cima (tipo "blueprint"). Não colide, clica através. Posição/escala pelo gizmo;
 * imagem/opacidade/altura no Inspector.
 */
const underlayNode = z.object({
  type: z.literal('underlay'),
  id: z.string().min(1),
  /** Caminho da imagem de referência. */
  image: z.string().optional(),
  /** Lado do plano (m). Default 128. */
  size: z.number().positive().optional(),
  /** Opacidade (0..1). Default 0.6. */
  opacity: z.number().optional(),
  /** Altura acima do chão (m) — evita z-fighting com o terreno. Default 0.05. */
  height: z.number().optional(),
  transform: transformSchema,
  place: placeSchema,
});

/** **Estrada por spline** (ADR-0630): campos em {@link roadFieldsSchema} (SPEC-0631). */
const roadNode = z.object({ type: z.literal('road'), ...roadFieldsSchema.shape, ...baseFields });

const sceneNodeSchema = z.discriminatedUnion('type', [
  modelNode,
  primitiveNode,
  meshNode,
  lightNode,
  waterNode,
  particlesNode,
  backgroundNode,
  spriteNode,
  terrainNode,
  vegetationNode,
  underlayNode,
  roadNode,
]);

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
      /** Preenchimento hemisfério (céu/chão). Default 0.55. */
      hemisphereIntensity: z.number().optional(),
      /** Ambient (levanta sombras sem matar contraste). Default 0.18. */
      ambientIntensity: z.number().optional(),
      exposure: z.number().optional(),
      /** **CSM** (Cascaded Shadow Maps): sombra que segue a câmera, cobre o mundo. Default false. */
      csm: z.boolean().optional(),
      /** Nº de cascatas do CSM. Default 3. */
      shadowCascades: z.number().optional(),
      /** Distância máx. de sombra (CSM, m). Default 250. */
      shadowDistance: z.number().optional(),
      /**
       * Limiar do **shadow caster culling** (SPEC-0197): malha para de projetar
       * sombra quando `raio / distância_da_câmera` fica abaixo disto. Default
       * 0.05; `0` desliga (tudo que o autor marcou projeta, a qualquer distância).
       */
      shadowCasterMinRatio: z.number().optional(),
      /** Resolução do shadow map (px). Default 2048. */
      shadowMapSize: z.number().optional(),
      /** Meia-extensão do frustum de sombra único (sem CSM). Default 60. */
      shadowArea: z.number().optional(),
      /** URL de um HDRI equiretangular (`.hdr`) → céu visível + luz por imagem (IBL). */
      hdri: z.string().optional(),
      /** Borrão do HDRI de fundo (0 = nítido). */
      hdriBlur: z.number().optional(),
      /** Intensidade da luz do HDRI (IBL). Default 1. */
      hdriIntensity: z.number().optional(),
      /**
       * URL de um panorama equiretangular 2:1 (PNG/JPG/KTX2) — céu desenhado como
       * fundo visível. Vence o fundo do degradê/HDRI; a luz só muda com
       * `skyboxLighting` (ADR-0295/SPEC-0296).
       */
      skybox: z.string().optional(),
      /** O panorama também ilumina a cena (environment/IBL). Default `false`. */
      skyboxLighting: z.boolean().optional(),
      /**
       * Céu GRADIENTE procedural (sem arquivo) — usado quando NÃO há `hdri`. Defina ao
       * menos `skyTop`/`skyMiddle` pra ligar (ex.: céu limpo de Brasília: top azul forte,
       * middle azul pálido). Vira fundo visível + luz suave (IBL).
       */
      skyTop: colorSchema.optional(),
      skyMiddle: colorSchema.optional(),
      skyBottom: colorSchema.optional(),
      /** Intensidade da luz do céu gradiente (IBL). Default 1. */
      skyGradientIntensity: z.number().optional(),
      /**
       * `false` PULA a criação do environment/céu default do builder — pra
       * jogos que instalam o próprio skybox+IBL logo após o `buildScene` (ex.:
       * skybox por mundo do teste4). Evita gerar um PMREM (par 3072×4096,
       * ~144 MB transitório) que seria substituído em seguida (SPEC-0155).
       * Default `true`.
       */
      environment: z.boolean().optional(),
    })
    .optional(),
});

// ─── Tipos públicos (inferidos do schema) ─────────────────────────────────────

/** Config de collider 2D (campo `collider` dos nós; ver {@link colliderSchema}). */
export type ColliderConfig = NonNullable<z.infer<typeof colliderSchema>>;
/** Config de encaixe por socket (campo `attach` dos nós; ver {@link attachSchema}; ADR-0053). */
export type AttachConfig = NonNullable<z.infer<typeof attachSchema>>;
/** Config de animação (campo `animation` dos nós; ver {@link animationSchema}). */
export type AnimationConfig = NonNullable<z.infer<typeof animationSchema>>;
/** Config de Character (campo `character` dos nós; ver {@link characterSchema}). */
export type CharacterConfig = NonNullable<z.infer<typeof characterSchema>>;
/** Config de corpo Rapier (campo `rapierBody` dos nós; ver {@link rapierBodySchema}). */
export type RapierBodyConfig = NonNullable<z.infer<typeof rapierBodySchema>>;
export type ModelNode = z.infer<typeof modelNode>;
export type PrimitiveNode = z.infer<typeof primitiveNode>;
/** Nó de malha de blockout editável (ver {@link meshNode}; SPEC-0071). */
export type MeshNode = z.infer<typeof meshNode>;

/** Nó de vegetação instanciada (ver {@link vegetationNode}; SPEC-0077). */
export type VegetationNode = z.infer<typeof vegetationNode>;
export type LightNode = z.infer<typeof lightNode>;
export type WaterNode = z.infer<typeof waterNode>;
/** Nó de estrada por spline (SPEC-0631). */
export type RoadNode = z.infer<typeof roadNode>;
export type ParticlesNode = z.infer<typeof particlesNode>;
export type BackgroundNode = z.infer<typeof backgroundNode>;
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
