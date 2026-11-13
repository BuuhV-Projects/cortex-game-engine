// zod/v3 — compatível com Hermes/CortexNative (ver SceneFile.ts).
import { z } from 'zod/v3';

/**
 * Campos compartilhados dos nós da cena (SPEC-0728 dividiu o SceneDefinition.ts): transform, encaixe, collider,
 * animação, personagem, Rapier, material, veículo, attach e os campos-base. Os nós e a união ficam em
 * {@link SceneDefinition}.
 */

/** `[x, y, z]`. */
export type Vec3 = [number, number, number];

export const vec3 = z.tuple([z.number(), z.number(), z.number()]);
/** Escala uniforme (número) ou por-eixo (`[x,y,z]`). */
export const scaleSchema = z.union([z.number(), vec3]);
/** Cor: hex string amigável (`"#9fd6ee"`) ou número (`0x9fd6ee`). O three aceita ambos. */
export const colorSchema = z.union([z.number(), z.string()]);

export const transformSchema = z
  .object({ position: vec3.optional(), rotation: vec3.optional(), scale: scaleSchema.optional() })
  .optional();

/**
 * Diretiva de grounding: o builder chama `placeOnGround` (assenta a BASE em `y`,
 * centra em `x,z`), em vez de você dar a pose exata. A IA autora com `place` pra
 * não chutar `y`; ao mover no editor, vira `transform` explícito.
 */
export const placeSchema = z
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
export const colliderSchema = z
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
 * Animação de um modelo `.glb` (clipes embutidos): qual clipe tocar (`clip`, nome;
 * default = primeiro), `loop` (default true), `speed` (default 1) e `autoplay`
 * (default true quando há config). Resolvido pelo {@link buildScene}; o editor pode
 * sobrescrever via overlay. JSON vence o que o código faria.
 */
export const animationSchema = z
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
export const characterSchema = z
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

export const vec3Obj = z.object({ x: z.number(), y: z.number(), z: z.number() });

/**
 * **Corpo rígido do Rapier** (física dinâmica 3D; ADR-0061/TDR-0002) — caixas/barris
 * que caem, empilham e empurram de verdade. Presença do campo = o nó vira um corpo
 * Rapier; o {@link buildScene} cria o `RapierBodyComponent` + registra o
 * `RapierPhysicsSystem` (carrega o WASM sob demanda). `shape: auto` deriva a caixa
 * do bounds do mesh. Ver {@link RapierBodyComponent}.
 */
export const rapierBodySchema = z
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
export const playerSchema = z
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
 * **Material/shader por objeto** (SPEC-0058) — como atribuir um shader a um objeto
 * na Unity. `standard` = PBR original do `.glb`; `unlit` = textura×cor sem luz
 * (porta o `Supyrb/Unlit/Texture`, com cull/zwrite/ztest); `toon` = cel-shading
 * em bandas + contorno. Aplicado pelo {@link buildScene} (ver `applyMaterial`).
 */
export const materialSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('standard') }),
    z.object({
      type: z.literal('unlit'),
      color: colorSchema.optional(),
      // `false` = descarta o `map` do modelo → COR CHAPADA (a moeda amarela do
      // teste4). Faltava aqui: o zod descartava a chave em silêncio e a cena
      // data-driven (level.json / Chat IA) não conseguia pedir cor chapada.
      textured: z.boolean().optional(),
      opacity: z.number().min(0).max(1).optional(),
      transparent: z.boolean().optional(),
      cull: z.enum(['back', 'front', 'none']).optional(),
      depthWrite: z.boolean().optional(),
      depthTest: z.boolean().optional(),
      alphaTest: z.number().min(0).max(1).optional(),
      // Contorno de silhueta (o mesmo do toon) — "unlit toon": cor chapada + borda.
      outline: z.number().min(0).optional(),
      outlineColor: colorSchema.optional(),
    }),
    z.object({
      type: z.literal('toon'),
      shading: z.enum(['bands', 'cel']).optional(),
      preserveGloss: z.boolean().optional(),
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
export const vehicleSchema = z
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
    /** Escala da inércia de curva (yaw): <1 = vira mais fácil/ágil; 1 = físico. */
    yawInertiaScale: z.number().optional(),
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

/**
 * **Encaixe por socket** (ADR-0053 §2) — o análogo do `place` pro plano X/Z: em
 * vez de chutar coordenada, o nó declara a RELAÇÃO ("meu socket `a` no socket
 * `edge_right` de `ilha_1`") e o {@link buildScene} resolve o transform de forma
 * determinística usando as âncoras do `kit.json` (passe `options.kit`). Exige
 * que o nó e o alvo sejam `model` com entrada no kit; socket inexistente, alvo
 * ausente ou ciclo de attach **falham alto** (build lança). O override do editor
 * (overlay `objects[id]`) vence o attach.
 */
export const attachSchema = z
  .object({
    /** Socket PRÓPRIO (nome de âncora no `kit.json` deste asset). */
    socket: z.string().min(1),
    /** `id` do nó alvo na cena. */
    to: z.string().min(1),
    /** Socket do ALVO (nome de âncora no `kit.json` do asset do alvo). */
    toSocket: z.string().min(1),
  })
  .optional();

export const baseFields = {
  /** Identificador único — chave pra overlay/editor e `Object3D.name`. */
  id: z.string().min(1),
  transform: transformSchema,
  place: placeSchema,
  /** Encaixe por socket no lugar de coordenadas (ver {@link attachSchema}; ADR-0053). */
  attach: attachSchema,
  castShadow: z.boolean().optional(),
  receiveShadow: z.boolean().optional(),
  /** `false` = mesh não renderizado (invisível), mas ainda presente na física/raycast. */
  visible: z.boolean().optional(),
  /**
   * `false` = a névoa da cena (`fog`) NÃO tinge este objeto.
   *
   * A névoa é global e some com tudo que está longe — inclusive com o que está
   * longe **de propósito**: um planeta, uma montanha ou um marco de horizonte
   * cuja função é justamente ser lido à distância. Isentá-los devolve a cor
   * própria da peça sem abrir mão da profundidade no resto da cena.
   *
   * Omitido = o objeto recebe a névoa (o comportamento normal).
   */
  fog: z.boolean().optional(),
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
  /** Animação do modelo `.glb` (clipe a tocar, loop, velocidade). Ver {@link SceneAnimator}. */
  animation: animationSchema,
  /**
   * **Mapa ação→clipe do player** (`{ idle, walk, run, jump, fall, ... }`) — quando o
   * nó é `player`, o {@link PlatformerAnimationSystem} toca a animação certa por
   * estado. Ausentes são auto-mapeados pelos nomes dos clipes. Ver
   * {@link PlayerAnimatorComponent}.
   */
  animations: z.record(z.string(), z.string()).optional(),
  /**
   * **Scripts anexados** (estilo MonoBehaviour — ADR-0085): comportamentos por nome
   * registrado + valores dos campos. O {@link ScriptHostSystem} roda no Play; o Inspector
   * adiciona/edita ("Adicionar Componente → Script"). Overlay `data.scripts[id]` vence.
   */
  scripts: z
    .array(z.object({ type: z.string().min(1), fields: z.record(z.string(), z.unknown()).optional() }))
    .optional(),
};
