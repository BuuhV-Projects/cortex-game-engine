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
 * `oneWay` = atravessável por baixo. `offsetX`/`offsetY` deslocam o AABB em
 * relação ao objeto — pra cobrir uma sub-região (ex.: só o "deck", não os
 * pilares) ou compensar pivô descentralizado, sem desacoplar do mesh.
 */
const colliderSchema = z
  .object({
    shape: z.enum(['box', 'circle', 'capsule', 'heightfield']).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    solid: z.boolean().optional(),
    oneWay: z.boolean().optional(),
    offsetX: z.number().optional(),
    offsetY: z.number().optional(),
    /** Perfil do chão (LOCAL, ordenado por X) quando `shape` é `heightfield`. */
    points: z.array(z.tuple([z.number(), z.number()])).optional(),
  })
  .optional();

/**
 * **Placement por socket** (ADR-0053): posiciona este nó encaixando seu socket
 * `socket` na âncora `toSocket` do nó `to` (resolvido pelo {@link buildScene} a
 * partir das âncoras do kit). Análogo do `place` para o plano X/Z — declara a
 * relação em vez de chutar a coordenada. Requer `kit` no `buildScene`.
 */
const attachSchema = z
  .object({
    /** Socket DESTE asset (nome de âncora no kit). */
    socket: z.string().min(1),
    /** `id` do nó-alvo na cena. */
    to: z.string().min(1),
    /** Âncora do asset do alvo onde encaixar. */
    toSocket: z.string().min(1),
    /** Deslocamento extra `[x,y,z]` após o encaixe. */
    offset: vec3.optional(),
  })
  .optional();

/**
 * Animação de um modelo `.glb` (clipes embutidos): qual clipe tocar (`clip`, nome;
 * default = primeiro), `loop` (default true), `speed` (default 1) e `autoplay`
 * (default true quando há config). Resolvido pelo {@link buildScene}; o editor pode
 * sobrescrever via overlay. JSON vence o que o código faria.
 */
const animationSchema = z
  .object({
    clip: z.string().optional(),
    loop: z.boolean().optional(),
    speed: z.number().optional(),
    autoplay: z.boolean().optional(),
  })
  .optional();

/**
 * **Corpo de personagem** (tipo "Character" do UPBGE) — cápsula com gravidade,
 * pulo (Jump Force/Max Jumps), queda limitada (Fall Speed Max) e Step Height.
 * Fica EM CIMA de qualquer mesh (terreno/tiles/plataformas). Presença do campo =
 * o nó é um Character. Aplicado pelo {@link buildScene} (CharacterBodyComponent +
 * CharacterPhysicsSystem + CharacterGroundSystem). Editável no Inspector (overlay
 * `data.physics` sobrescreve). Ver {@link CharacterBodyComponent}.
 */
const characterSchema = z
  .object({
    radius: z.number().positive().optional(),
    height: z.number().positive().optional(),
    gravity: z.number().nonnegative().optional(),
    stepHeight: z.number().nonnegative().optional(),
    jumpForce: z.number().nonnegative().optional(),
    fallSpeedMax: z.number().positive().optional(),
    maxJumps: z.number().int().min(0).optional(),
    /** Piso plano de fallback (se não houver geometria embaixo). Default `0`. O chão principal é colisão real. */
    groundY: z.number().optional(),
  })
  .optional();

const vec3Obj = z.object({ x: z.number(), y: z.number(), z: z.number() });

/**
 * **Corpo rígido do Rapier** (física dinâmica 3D; ADR-0061/TDR-0002) — caixas/barris
 * que caem, empilham e empurram de verdade. Presença do campo = o nó vira um corpo
 * Rapier; o {@link buildScene} cria o `RapierBodyComponent` + registra o
 * `RapierPhysicsSystem` (carrega o WASM sob demanda). `shape: auto` deriva a caixa
 * do bounds do mesh. Ver {@link RapierBodyComponent}.
 */
const rapierBodySchema = z
  .object({
    bodyType: z.enum(['dynamic', 'fixed', 'kinematic']).optional(),
    shape: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('auto') }),
        z.object({ kind: z.literal('box'), halfExtents: vec3Obj }),
        z.object({ kind: z.literal('ball'), radius: z.number().positive() }),
        z.object({ kind: z.literal('capsule'), halfHeight: z.number().positive(), radius: z.number().positive() }),
      ])
      .optional(),
    restitution: z.number().min(0).optional(),
    friction: z.number().min(0).optional(),
    isSensor: z.boolean().optional(),
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

/**
 * **Material/shader por objeto** (ADR-0058) — como atribuir um shader a um objeto
 * na Unity. `standard` = PBR original do `.glb`; `unlit` = textura×cor sem luz
 * (porta o `Supyrb/Unlit/Texture`, com cull/zwrite/ztest); `toon` = cel-shading
 * em bandas + contorno. Aplicado pelo {@link buildScene} (ver `applyMaterial`).
 */
const materialSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('standard') }),
    z.object({
      type: z.literal('unlit'),
      color: colorSchema.optional(),
      opacity: z.number().min(0).max(1).optional(),
      transparent: z.boolean().optional(),
      cull: z.enum(['back', 'front', 'none']).optional(),
      depthWrite: z.boolean().optional(),
      depthTest: z.boolean().optional(),
      alphaTest: z.number().min(0).max(1).optional(),
    }),
    z.object({
      type: z.literal('toon'),
      color: colorSchema.optional(),
      gradientSteps: z.number().int().min(2).max(8).optional(),
      outline: z.number().min(0).optional(),
      outlineColor: colorSchema.optional(),
    }),
  ])
  .optional();

/**
 * Config do **veículo** (ADR-0081) como DADO da cena — editável no Inspector
 * (seção "Veículo") em vez de cravado no código. Tudo opcional (usa defaults do engine).
 */
const vehicleSchema = z
  .object({
    engineForce: z.number().optional(),
    maxBrake: z.number().optional(),
    handbrakeForce: z.number().optional(),
    reverseForce: z.number().optional(),
    maxReverseSpeed: z.number().optional(),
    rollingResistance: z.number().optional(),
    throttleSmooth: z.number().optional(),
    maxSteer: z.number().optional(),
    steerSmooth: z.number().optional(),
    mass: z.number().optional(),
    frictionSlip: z.number().optional(),
    /** Sensibilidade da suspensão (rigidez). */
    suspensionStiffness: z.number().optional(),
    /** Altura/curso de repouso da suspensão. */
    suspensionRestLength: z.number().optional(),
    suspensionCompression: z.number().optional(),
    suspensionRelaxation: z.number().optional(),
    maxSuspensionTravel: z.number().optional(),
    /** Posição da caixa do chassi (collider) relativa à origem. */
    chassisOffset: z.object({ x: z.number(), y: z.number(), z: z.number() }).partial().optional(),
    chassisHalfExtents: z.object({ x: z.number(), y: z.number(), z: z.number() }).partial().optional(),
    /** Centro de massa: y = altura (BAIXO = estável, não capota), z = frente/trás. */
    centerOfMass: z.object({ x: z.number(), y: z.number(), z: z.number() }).partial().optional(),
    /** Velocidade no fim do velocímetro (km/h). */
    maxSpeed: z.number().optional(),
    wheelSpinRate: z.number().optional(),
    /** Caminho do áudio do MOTOR (loop único — fallback simples). Ver {@link EngineSound}. */
    engineSound: z.string().optional(),
    /**
     * Áudio do motor em CAMADAS (crossfade on/off × faixas de RPM) — som realista.
     * Cada slot é um caminho de áudio (loop). Tem prioridade sobre `engineSound`.
     */
    engineLayers: z
      .object({
        onLow: z.string(), onMid: z.string(), onHigh: z.string(),
        offLow: z.string(), offMid: z.string(), offHigh: z.string(), offVeryHigh: z.string(),
      })
      .partial()
      .optional(),
  })
  .optional();

const baseFields = {
  /** Identificador único — chave pra overlay/editor e `Object3D.name`. */
  id: z.string().min(1),
  transform: transformSchema,
  place: placeSchema,
  castShadow: z.boolean().optional(),
  receiveShadow: z.boolean().optional(),
  /** Materiais foscos (mata o brilho PBR → look cartoon). Ver {@link setMatte}. */
  matte: z.boolean().optional(),
  /** Material/shader por objeto (standard/unlit/toon). Ver {@link applyMaterial}. */
  material: materialSchema,
  /** Collider 2D (plataformer): vira sólido/plataforma. */
  collider: colliderSchema,
  /** Marca como player (controller + corpo + alvo da câmera). */
  player: playerSchema,
  /** Marca como **Character** (cápsula + gravidade + pulo + step, estilo UPBGE). Ver {@link CharacterConfig}. */
  character: characterSchema,
  /** Marca como **corpo rígido do Rapier** (física dinâmica 3D — cai/empilha/empurra). Ver {@link RapierBodyConfig}. */
  rapierBody: rapierBodySchema,
  /** Config do **veículo** (motor/freio/suspensão/centro de massa) — editável no Inspector. Ver ADR-0081. */
  vehicle: vehicleSchema,
  /** Placement por socket (encaixa em outro nó via âncoras do kit). */
  attach: attachSchema,
  /** Animação do modelo `.glb` (clipe a tocar, loop, velocidade). Ver {@link SceneAnimator}. */
  animation: animationSchema,
  /**
   * **Mapa ação→clipe do player** (`{ idle, walk, run, jump, fall, ... }`) — quando o
   * nó é `player`, o {@link PlatformerAnimationSystem} toca a animação certa por
   * estado. Ausentes são auto-mapeados pelos nomes dos clipes. Ver
   * {@link PlayerAnimatorComponent}.
   */
  animations: z.record(z.string(), z.string()).optional(),
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

/**
 * **Malha de blockout editável** (ProBuilder — ADR-0071). Carrega uma **receita de
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
/**
 * **Estrada por spline** (Road Architect → Cortex, ADR-0072). `nodes` são os pontos
 * de controle (Catmull-Rom passa por eles); o {@link buildScene} gera a malha-faixa
 * (ribbon) com a textura da `surface`. `conformTerrain` faz a pista acompanhar a
 * altura do terreno (raycast por amostra). Editável no F2 (overlay vence).
 */
const roadNode = z.object({
  type: z.literal('road'),
  /** Pontos de controle da spline (≥2), em metros. */
  nodes: z.array(vec3).min(2),
  /** Largura da pista (m). Default 8 (≈2 faixas). */
  width: z.number().positive().optional(),
  /** Superfície: nome embutido (`asphalt`/…) ou URLs explícitas (diffuse/normal/repeat). */
  surface: z
    .union([
      z.enum(['asphalt', 'concrete', 'dirt', 'brick', 'cobblestone']),
      z.object({
        color: colorSchema.optional(),
        diffuse: z.string().optional(),
        normal: z.string().optional(),
        repeat: z.number().positive().optional(),
      }),
    ])
    .optional(),
  /**
   * Marcação de pista (overlay, ADR-0076): nome embutido (`dashed`/`single-yellow`/
   * `double-yellow`/`passing`/`lane`) ou `{ url, repeat }`. Ausente = sem marcação.
   */
  markings: z
    .union([
      z.enum(['dashed', 'single-yellow', 'double-yellow', 'passing', 'lane']),
      z.object({ url: z.string(), repeat: z.number().positive().optional() }),
    ])
    .optional(),
  /** Densidade da tessellation: amostras por 90° de curvatura (adaptativa). Default 16. */
  steps: z.number().int().positive().optional(),
  /** A pista acompanha a altura do terreno (raycast por amostra). Default true. */
  conformTerrain: z.boolean().optional(),
  /**
   * Como a pista se relaciona com o terreno (ADR-0072 Fase 2):
   * - `'conform'` (default): a **pista** se deforma acompanhando o relevo (Fase 1).
   * - `'cutfill'`: o **terreno** se adapta à pista — greide suavizado + *cut & fill*
   *   (corta morro acima, aterra vale abaixo) com talude nas laterais. Não-destrutivo.
   */
  terrainMode: z.enum(['conform', 'cutfill']).optional(),
  /** Largura do talude (transição terreno↔pista) em cada lado, m. Só `cutfill`. Default 6. */
  taludeWidth: z.number().nonnegative().optional(),
  /** Inclinação máx. do greide (Δalt/Δhoriz). Só `cutfill`. Default 0.25 (25% — a
   * estrada sobe o morro fazendo ladeira; baixe pra pista mais plana que aplaina mais). */
  maxSlope: z.number().positive().optional(),
  /** Levanta a pista acima do chão (evita z-fight). Default 0.05 m. */
  yOffset: z.number().optional(),
  id: z.string().min(1),
  transform: transformSchema,
  collider: colliderSchema,
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
  /** Heightmap (row-major, `(res+1)²` alturas) — autoria do editor. */
  heights: z.array(z.number()).optional(),
  /** Cor base do material. Default verde-grama. */
  color: colorSchema.optional(),
  id: z.string().min(1),
  transform: transformSchema,
  place: placeSchema,
});

/**
 * **Vegetação instanciada** (ADR-0077): espalha muitas cópias de um modelo (árvore/
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

const sceneNodeSchema = z.discriminatedUnion('type', [
  modelNode,
  primitiveNode,
  meshNode,
  roadNode,
  lightNode,
  waterNode,
  backgroundNode,
  spriteNode,
  terrainNode,
  vegetationNode,
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
      /** URL de um HDRI equiretangular (`.hdr`) → céu visível + luz por imagem (IBL). */
      hdri: z.string().optional(),
      /** Borrão do HDRI de fundo (0 = nítido). */
      hdriBlur: z.number().optional(),
      /** Intensidade da luz do HDRI (IBL). Default 1. */
      hdriIntensity: z.number().optional(),
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
    })
    .optional(),
});

// ─── Tipos públicos (inferidos do schema) ─────────────────────────────────────

/** Config de collider 2D (campo `collider` dos nós; ver {@link colliderSchema}). */
export type ColliderConfig = NonNullable<z.infer<typeof colliderSchema>>;
/** Config de placement por socket (campo `attach` dos nós; ver {@link attachSchema}). */
export type AttachConfig = NonNullable<z.infer<typeof attachSchema>>;
/** Config de animação (campo `animation` dos nós; ver {@link animationSchema}). */
export type AnimationConfig = NonNullable<z.infer<typeof animationSchema>>;
/** Config de Character (campo `character` dos nós; ver {@link characterSchema}). */
export type CharacterConfig = NonNullable<z.infer<typeof characterSchema>>;
/** Config de corpo Rapier (campo `rapierBody` dos nós; ver {@link rapierBodySchema}). */
export type RapierBodyConfig = NonNullable<z.infer<typeof rapierBodySchema>>;
export type ModelNode = z.infer<typeof modelNode>;
export type PrimitiveNode = z.infer<typeof primitiveNode>;
/** Nó de malha de blockout editável (ver {@link meshNode}; ADR-0071). */
export type MeshNode = z.infer<typeof meshNode>;
/** Nó de estrada por spline (ver {@link roadNode}; ADR-0072). */
export type RoadNode = z.infer<typeof roadNode>;

/** Nó de vegetação instanciada (ver {@link vegetationNode}; ADR-0077). */
export type VegetationNode = z.infer<typeof vegetationNode>;
export type LightNode = z.infer<typeof lightNode>;
export type WaterNode = z.infer<typeof waterNode>;
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
