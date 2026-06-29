import {
  Color,
  Fog,
  Mesh,
  Group,
  BoxGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  DoubleSide,
  Raycaster,
  Vector3,
  RepeatWrapping,
  SRGBColorSpace,
  LinearFilter,
  LinearMipmapLinearFilter,
  DirectionalLight,
  HemisphereLight,
  AmbientLight,
  PCFSoftShadowMap,
  type BufferGeometry,
  type Object3D,
  type PerspectiveCamera,
  type OrthographicCamera,
} from 'three';
import { Scene } from '../core/Scene.js';
import type { Renderer } from '../core/Renderer.js';
import type { World } from '../ecs/World.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { ScriptComponent, type ScriptDecl } from '../components/ScriptComponent.js';
import { Collider2DComponent } from '../components/Collider2DComponent.js';
import { PlatformerBodyComponent } from '../components/PlatformerBodyComponent.js';
import { FollowCameraTargetComponent } from '../components/FollowCameraTargetComponent.js';
import { PlayerAnimatorComponent } from '../components/PlayerAnimatorComponent.js';
import type { Entity } from '../ecs/Entity.js';
import { loadGLB, loadTexture, instance, placeOnGround, getWorldBounds, setMatte } from './SceneAssets.js';
import { applyMaterial, type MaterialConfig } from './Materials.js';
import { createSprite } from './Sprite.js';
import { Spritesheet, createAnimatedSprite } from './Spritesheet.js';
import { SpriteAnimationComponent } from '../components/SpriteAnimationComponent.js';
import { SpriteAnimationSystem } from '../systems/SpriteAnimationSystem.js';
import { TerrainComponent } from '../components/TerrainComponent.js';
import { TerrainCollisionSystem } from '../systems/TerrainCollisionSystem.js';
import { CharacterBodyComponent } from '../components/CharacterBodyComponent.js';
import { CharacterPhysicsSystem } from '../systems/CharacterPhysicsSystem.js';
import { RapierBodyComponent } from '../components/RapierBodyComponent.js';
import { RapierPhysicsSystem } from '../systems/RapierPhysicsSystem.js';
import { RapierPhysics } from '../physics/RapierPhysics.js';
import { Water } from './Water.js';
import { Background } from './Background.js';
import { toBufferGeometry, type EditableMesh } from '../probuilder/EditableMesh.js';
import { buildShape } from '../probuilder/shapes.js';
import { sampleSpline } from '../road/RoadSpline.js';
import { toRoadGeometry, ribbonToGeometry } from '../road/RoadMesh.js';
import { resolveSurface, resolveMarking, type RoadMarking, type RoadSurfaceName } from '../road/surfaces.js';
import { getProfile } from '../road/profiles.js';
import { profileMesh } from '../road/roadProfileMesh.js';
import { smoothGrade, moldHeightfield, mergeDeltas, type GradePoint } from '../road/RoadGrade.js';
import { Terrain, type TerrainPaintData } from './Terrain.js';
import { Vegetation, makePlaceholderVegetation } from './Vegetation.js';
import { setupOutdoorLighting } from './OutdoorLighting.js';
import { Skybox } from '../core/Skybox.js';
import { debug } from '../core/debug.js';
import {
  parseSceneNode,
  type SceneDefinition,
  type SceneNode,
  type ColliderConfig,
  type AttachConfig,
  type AnimationConfig,
  type CharacterConfig,
  type RapierBodyConfig,
} from './SceneDefinition.js';
import { SceneAnimator } from './SceneAnimator.js';
import {
  kitAssetFor,
  kitAnchor,
  resolveAttachPosition,
  attachResolveOrder,
  type KitAnchor,
  type KitDefinition,
  type KitSprite,
} from './Kit.js';
import type { SceneFileV1 } from './SceneFile.js';

/**
 * Constrói a cena a partir de {@link SceneDefinition}(s) data-driven — o ÚNICO
 * ponto de instanciação. Aplica a **overlay** do editor (um {@link SceneFileV1}):
 * pula nós deletados (nunca instancia → sem desperdício), sobrescreve transforms
 * editadas e instancia nós adicionados. Resolve delete/add/persistência de forma
 * limpa, sem create-then-remove. Ver ADR.
 */

/** Handle da cena construída. */
export interface SceneHandle {
  /** Objetos instanciados, por `id`. */
  byId: Map<string, Object3D>;
  /** Chame no loop com dt em **segundos** — anima águas (cáusticas). */
  update(deltaSeconds: number): void;
}

export interface BuildSceneOptions {
  /** Necessário se alguma definição usa o preset `outdoorLighting`. */
  renderer?: Renderer;
  /** Overlay do editor (overrides de transform + `data.deleted`/`data.added`). */
  overlay?: SceneFileV1 | null;
  /**
   * Mundo ECS — quando presente, nós com `collider`/`player` viram entidades
   * (Transform + Object3D + Collider2D [+ PlatformerBody + FollowCameraTarget]),
   * pra a física de plataforma agir. Registre os sistemas (Object3DSync,
   * PlatformerPhysics/Input, FollowCamera2D) — ou use `setupPlatformer`.
   */
  world?: World;
  /**
   * Kit(s) de assets (manifesto(s) `kit.json`, ADR-0053). Quando presente: nós
   * `model` herdam o **preset de collider por `role`** do kit (se não definirem
   * `collider` próprio), e nós com `attach` são posicionados por **socket** a
   * partir das âncoras do kit.
   */
  kit?: KitDefinition | KitDefinition[];
  /**
   * Deixa **todos** os modelos foscos (mata o brilho PBR → look cartoon/desenho).
   * Um nó pode sobrescrever com `matte: false`. Atalho global do {@link setMatte}.
   */
  matte?: boolean;
  /**
   * Câmera do jogo — **necessária** se a cena tem nós `background` (o backdrop
   * segue a câmera e rola em parallax). Passe `game.camera`.
   */
  camera?: PerspectiveCamera | OrthographicCamera;
  /**
   * Predicado pra **pausar a física de Character** (gravidade/pulo) — o
   * `CharacterPhysicsSystem` que o `buildScene` registra pra nós `character`
   * recebe isso como `pauseWhen`. Passe `() => game.editorActive` pra o personagem
   * não cair enquanto você edita a cena no F2. Sem isso, a física roda sempre.
   */
  physicsPaused?: () => boolean;
}

/**
 * Tipo de corpo físico de um nó (autorado/override do Inspector). `rigid` = corpo
 * dinâmico do Rapier (caixa/barril que cai/empilha); `static`/`character` = física
 * 2.5D/cápsula antiga; `none` = sem física.
 */
export type BodyType = 'none' | 'static' | 'character' | 'rigid';

/** Override de física por objeto (overlay `data.physics[nome]`). */
export interface PhysicsOverride {
  type: BodyType;
  /** Parâmetros quando `type === 'character'`. */
  character?: CharacterConfig;
  /** Parâmetros quando `type === 'rigid'` (corpo Rapier). */
  rapier?: RapierBodyConfig;
}

/** Lê `data.deleted` da overlay (ids removidos no editor). */
export function overlayDeleted(overlay: SceneFileV1 | null | undefined): string[] {
  const d = overlay?.data?.['deleted'];
  return Array.isArray(d) ? (d.filter((x) => typeof x === 'string') as string[]) : [];
}

/** Lê `data.added` da overlay (nós adicionados no editor), validados. */
export function overlayAdded(overlay: SceneFileV1 | null | undefined): SceneNode[] {
  const a = overlay?.data?.['added'];
  if (!Array.isArray(a)) return [];
  const out: SceneNode[] = [];
  for (const raw of a) {
    const node = parseSceneNode(raw);
    if (node) out.push(node);
  }
  return out;
}

/**
 * Lê `data.colliders` da overlay — colliders **autorados no editor**, por nome de
 * objeto (`{ [nome]: { width?, height?, offsetX?, offsetY?, solid?, oneWay? } }`).
 * São aplicados pelo `buildScene` aos objetos que **não** têm collider no código
 * (o `node.collider` vence). Validação leve: campos numéricos/booleanos só.
 */
export function overlayColliders(
  overlay: SceneFileV1 | null | undefined,
): Record<string, ColliderConfig> {
  const raw = overlay?.data?.['colliders'];
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, ColliderConfig> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const num = (k: string): number | undefined => (typeof o[k] === 'number' ? (o[k] as number) : undefined);
    const bool = (k: string): boolean | undefined => (typeof o[k] === 'boolean' ? (o[k] as boolean) : undefined);
    const sh = o['shape'];
    const shape = sh === 'circle' || sh === 'capsule' || sh === 'heightfield' ? sh : undefined;
    let points: [number, number][] | undefined;
    if (Array.isArray(o['points'])) {
      points = (o['points'] as unknown[])
        .filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
        .map((p) => [p[0], p[1]] as [number, number]);
    }
    out[name] = {
      shape,
      width: num('width'),
      height: num('height'),
      offsetX: num('offsetX'),
      offsetY: num('offsetY'),
      solid: bool('solid'),
      oneWay: bool('oneWay'),
      points,
    };
  }
  return out;
}

/**
 * Lê `data.physics` da overlay — o **tipo de corpo autorado no Inspector** por
 * nome de objeto (`{ [nome]: { type: 'none'|'static'|'character', ... } }`). É a
 * fonte **autoritativa** (sobrescreve o que o código/`level.json` declara): permite
 * REMOVER um collider cravado no código (`type: 'none'`), trocar pra `character`,
 * etc. — pra a física ficar sempre visível/editável no Inspector (ADR-0058).
 */
export function overlayPhysics(
  overlay: SceneFileV1 | null | undefined,
): Record<string, PhysicsOverride> {
  const raw = overlay?.data?.['physics'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, PhysicsOverride> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const t = o['type'];
    if (t !== 'none' && t !== 'static' && t !== 'character' && t !== 'rigid') continue;
    const num = (k: string): number | undefined => (typeof o[k] === 'number' ? (o[k] as number) : undefined);
    let character: CharacterConfig | undefined;
    if (t === 'character') {
      character = {
        radius: num('radius'),
        height: num('height'),
        gravity: num('gravity'),
        stepHeight: num('stepHeight'),
        jumpForce: num('jumpForce'),
        fallSpeedMax: num('fallSpeedMax'),
        maxJumps: num('maxJumps'),
        groundY: num('groundY'),
      };
    }
    let rapier: RapierBodyConfig | undefined;
    if (t === 'rigid') {
      const r = (o['rapier'] && typeof o['rapier'] === 'object' ? o['rapier'] : o) as Record<string, unknown>;
      const bt = r['bodyType'];
      rapier = {
        bodyType: bt === 'dynamic' || bt === 'fixed' || bt === 'kinematic' ? bt : undefined,
        restitution: typeof r['restitution'] === 'number' ? (r['restitution'] as number) : undefined,
        friction: typeof r['friction'] === 'number' ? (r['friction'] as number) : undefined,
        isSensor: typeof r['isSensor'] === 'boolean' ? (r['isSensor'] as boolean) : undefined,
      };
    }
    out[name] = { type: t, character, rapier };
  }
  return out;
}

/**
 * Lê `data.matte` da overlay — o estado fosco/cartoon **autorado no editor** por
 * nome de objeto (`{ [nome]: boolean }`). `true` = fosco; `false` = sobrescreve um
 * `matte` definido no código/nó pra NÃO-fosco. Ausência = sem opinião (cai pro nó/
 * global). Ver {@link setMatte}.
 */
export function overlayMatte(overlay: SceneFileV1 | null | undefined): Record<string, boolean> {
  const raw = overlay?.data?.['matte'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[name] = v;
  }
  return out;
}

/**
 * Lê `data.vehicle` da overlay — a config do **veículo** autorada no Inspector por id
 * (`{ [id]: VehicleConfig }`, ADR-0081). Sobrescreve o `vehicle` do nó (JSON). É só
 * mesclada no `userData.cortexVehicle` (o jogo lê ao criar o veículo).
 */
export function overlayVehicle(overlay: SceneFileV1 | null | undefined): Record<string, Record<string, unknown>> {
  const raw = overlay?.data?.['vehicle'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[name] = v as Record<string, unknown>;
  }
  return out;
}

/** Lê `data.underlay` da overlay — imagem/opacidade/altura do underlay autoradas no editor. */
export function overlayUnderlay(
  overlay: SceneFileV1 | null | undefined,
): Record<string, { image?: string; opacity?: number; height?: number }> {
  const raw = overlay?.data?.['underlay'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, { image?: string; opacity?: number; height?: number }> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[name] = v as { image?: string; opacity?: number; height?: number };
  }
  return out;
}

/**
 * Lê `data.material` da overlay — o material/shader **autorado no editor** por id
 * (`{ [id]: MaterialConfig }`, ADR-0058). Sobrescreve o `material` do nó (JSON).
 * Ausência = sem opinião (cai pro nó). Ver {@link applyMaterial}.
 */
export function overlayMaterial(overlay: SceneFileV1 | null | undefined): Record<string, MaterialConfig> {
  const raw = overlay?.data?.['material'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, MaterialConfig> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string') {
      out[id] = v as MaterialConfig;
    }
  }
  return out;
}

/**
 * Lê `data.terrain` da overlay — o **heightmap esculpido no editor** por id
 * (`{ [id]: number[] }`). Sobrescreve o `heights` do nó (JSON). Ver {@link Terrain}.
 */
export function overlayTerrain(overlay: SceneFileV1 | null | undefined): Record<string, number[]> {
  const raw = overlay?.data?.['terrain'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number[]> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v) && v.every((n) => typeof n === 'number')) out[id] = v as number[];
  }
  return out;
}

/**
 * Lê `data.terrainPaint` da overlay — a **pintura de textura do terreno** autorada
 * no editor por id (`{ [id]: TerrainPaintData }`: camadas + splatmap base64). Ver
 * {@link Terrain.setPaint}.
 */
export function overlayTerrainPaint(overlay: SceneFileV1 | null | undefined): Record<string, TerrainPaintData> {
  const raw = overlay?.data?.['terrainPaint'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, TerrainPaintData> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (Array.isArray(o['layers']) && typeof o['size'] === 'number' && typeof o['splat'] === 'string') {
      out[id] = o as unknown as TerrainPaintData;
    }
  }
  return out;
}

/**
 * Lê `data.geometry` da overlay — a **geometria editada** (vértice/face) de nós
 * `mesh` autorada no editor, por id (`{ [id]: { positions, faces } }`). **Vence** a
 * receita `shape`/geometria do nó (ADR-0071). "Resetar forma" remove a entrada.
 */
export function overlayGeometry(overlay: SceneFileV1 | null | undefined): Record<string, EditableMesh> {
  const raw = overlay?.data?.['geometry'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, EditableMesh> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (Array.isArray(o['positions']) && Array.isArray(o['faces'])) {
      out[id] = { positions: o['positions'] as EditableMesh['positions'], faces: o['faces'] as number[][] };
    }
  }
  return out;
}

/**
 * Lê `data.animation` da overlay — a animação **autorada no editor** por id
 * (`{ [id]: { clip?, loop?, speed?, autoplay? } }`). Sobrescreve o `animation` do
 * nó (JSON), que por sua vez vence o código. Ver {@link SceneAnimator}.
 */
export function overlayAnimation(overlay: SceneFileV1 | null | undefined): Record<string, AnimationConfig> {
  const raw = overlay?.data?.['animation'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, AnimationConfig> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    out[id] = {
      clip: typeof o['clip'] === 'string' ? o['clip'] : undefined,
      loop: typeof o['loop'] === 'boolean' ? o['loop'] : undefined,
      speed: typeof o['speed'] === 'number' ? o['speed'] : undefined,
      autoplay: typeof o['autoplay'] === 'boolean' ? o['autoplay'] : undefined,
    };
  }
  return out;
}

/**
 * Lê `data.playerAnimations` da overlay — o **mapa ação→clipe do player** autorado
 * no editor (`{ [id]: { idle, run, jump, … } }`). Sobrescreve o `animations` do nó.
 * Ver {@link PlayerAnimatorComponent}.
 */
export function overlayPlayerAnimations(
  overlay: SceneFileV1 | null | undefined,
): Record<string, Record<string, string>> {
  const raw = overlay?.data?.['playerAnimations'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const m: Record<string, string> = {};
    for (const [action, clip] of Object.entries(v as Record<string, unknown>)) {
      if (typeof clip === 'string') m[action] = clip;
    }
    out[id] = m;
  }
  return out;
}

/**
 * Scripts anexados por nó vindos do overlay do editor (`data.scripts[id]` = lista de
 * `{ type, fields }`). Vence o `node.scripts` do código/JSON. Ver ADR-0085.
 */
export function overlayScripts(overlay: SceneFileV1 | null | undefined): Record<string, ScriptDecl[]> {
  const raw = overlay?.data?.['scripts'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, ScriptDecl[]> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const decls: ScriptDecl[] = [];
    for (const s of v) {
      if (s && typeof s === 'object' && typeof (s as { type?: unknown }).type === 'string') {
        const o = s as { type: string; fields?: unknown };
        const fields = o.fields && typeof o.fields === 'object' && !Array.isArray(o.fields) ? (o.fields as Record<string, unknown>) : {};
        decls.push({ type: o.type, fields });
      }
    }
    out[name] = decls;
  }
  return out;
}

/**
 * Constrói a cena. `defs` pode ser uma definição ou um array (multi-arquivo —
 * os `nodes` são concatenados; configs de cena como `background`/`fog`/
 * `outdoorLighting`: o último definido vence).
 */
export async function buildScene(
  scene: Scene,
  defs: SceneDefinition | SceneDefinition[],
  options: BuildSceneOptions = {},
): Promise<SceneHandle> {
  const list = Array.isArray(defs) ? defs : [defs];
  const three = scene.getThreeScene();
  const byId = new Map<string, Object3D>();
  const waters: Water[] = [];
  const backgrounds: Background[] = [];
  const animators: SceneAnimator[] = [];
  const overlay = options.overlay ?? null;
  const deleted = new Set<string>(overlayDeleted(overlay));
  const overrides = overlay?.objects ?? {};
  const editorColliders = overlayColliders(overlay);
  const editorPhysics = overlayPhysics(overlay);
  const editorScripts = overlayScripts(overlay);
  debug('scene', 'buildScene: overlayPhysics =', editorPhysics);
  const editorMatte = overlayMatte(overlay);
  const editorMaterial = overlayMaterial(overlay);
  const editorTerrain = overlayTerrain(overlay);
  const editorTerrainPaint = overlayTerrainPaint(overlay);
  const editorGeometry = overlayGeometry(overlay);
  const editorAnim = overlayAnimation(overlay);
  const editorPlayerAnim = overlayPlayerAnimations(overlay);
  const editorVehicle = overlayVehicle(overlay);
  const editorUnderlay = overlayUnderlay(overlay);

  // ── Config de cena (último arquivo a definir vence) ──────────────────────────
  let background: number | string | undefined;
  let fog: SceneDefinition['fog'];
  let outdoor: SceneDefinition['outdoorLighting'];
  for (const d of list) {
    if (d.background !== undefined) background = d.background;
    if (d.fog) fog = d.fog;
    if (d.outdoorLighting) outdoor = d.outdoorLighting;
  }
  if (background !== undefined) three.background = new Color(background);
  if (fog) three.fog = new Fog(fog.color, fog.near, fog.far);
  if (options.renderer) {
    // Liga soft shadows no renderer pra luzes data-driven com castShadow funcionarem
    // (o preset outdoorLighting também liga; aqui cobre o caso sem preset).
    const r = options.renderer.threeRenderer;
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFSoftShadowMap;
    if (outdoor) {
      setupOutdoorLighting(options.renderer, scene, outdoor);
      // HDRI (céu visível + luz por imagem). Sobrepõe o `background` de cor.
      if (outdoor.hdri) {
        await Skybox.fromHDRI(scene, outdoor.hdri, {
          backgroundBlurriness: outdoor.hdriBlur ?? 0,
          environmentIntensity: outdoor.hdriIntensity ?? 1,
        });
      } else if (outdoor.skyTop || outdoor.skyMiddle || outdoor.skyBottom) {
        // Céu gradiente procedural (sem arquivo) — céu limpo/ensolarado.
        Skybox.fromGradient(scene, {
          top: outdoor.skyTop,
          middle: outdoor.skyMiddle,
          bottom: outdoor.skyBottom,
          environmentIntensity: outdoor.skyGradientIntensity ?? 1,
        });
      }
    }
  }

  // ── Nós: base (arquivos) + adicionados (overlay) ─────────────────────────────
  const allNodes: SceneNode[] = [...list.flatMap((d) => d.nodes), ...overlayAdded(overlay)];
  const kit = options.kit;

  // 1) Instancia todos os nós (sem criar entidades ainda — `attach` pode mover a
  //    pose depois, e a entidade ECS copia a posição final).
  const placed: SceneNode[] = [];
  for (const node of allNodes) {
    if (deleted.has(node.id) || byId.has(node.id)) continue;
    // Backdrop 2D com parallax — segue a câmera, então precisa dela.
    if (node.type === 'background') {
      if (!options.camera) throw new Error(`buildScene: nó background "${node.id}" requer options.camera`);
      const bg = new Background(scene, options.camera, {
        url: node.image,
        parallax: node.parallax,
        distance: node.distance,
        height: node.height,
        widthFactor: node.widthFactor,
      });
      backgrounds.push(bg);
      byId.set(node.id, bg.mesh);
      continue;
    }
    const obj = await instantiate(node, scene, three, waters, kit, editorGeometry[node.id]);
    if (!obj) continue;
    // Veículo (ADR-0081): config do nó + overlay → userData.cortexVehicle (o jogo lê pra
    // criar o veículo; o Inspector edita). Marca o nó como veículo pro Inspector mostrar a seção.
    if (node.type === 'model' && (node.vehicle || editorVehicle[node.id])) {
      (obj.userData as Record<string, unknown>)['cortexVehicle'] = { ...node.vehicle, ...editorVehicle[node.id] };
    }
    // Underlay: aplica imagem/opacidade/altura autoradas no editor (overlay) — sobrevive ao reload.
    if (node.type === 'underlay' && editorUnderlay[node.id]) {
      const ov = editorUnderlay[node.id]!;
      const plane = (obj.userData as Record<string, unknown>)['cortexUnderlay'] as Mesh | undefined;
      const mat = plane?.material as MeshBasicMaterial | undefined;
      if (plane && mat) {
        if (typeof ov.opacity === 'number') mat.opacity = ov.opacity;
        if (typeof ov.height === 'number') plane.position.y = ov.height;
        if (ov.image) {
          (obj.userData as Record<string, unknown>)['cortexUnderlayImage'] = ov.image;
          void loadTexture(ov.image, false).then((t) => { mat.map = t; mat.needsUpdate = true; });
        }
      }
    }
    // Terreno: heightmap/pintura autorados no editor (overlay) vencem o nó (JSON).
    if (node.type === 'terrain' && (editorTerrain[node.id] || editorTerrainPaint[node.id])) {
      const terrain = (obj.userData as Record<string, unknown>)['cortexTerrain'] as Terrain | undefined;
      if (editorTerrain[node.id]) terrain?.setHeights(editorTerrain[node.id]!);
      if (editorTerrainPaint[node.id]) terrain?.setPaint(editorTerrainPaint[node.id]!);
    }
    // Override do editor (transform exata salva) tem precedência sobre place/transform/attach.
    const ov = overrides[node.id];
    if (ov) {
      obj.position.set(ov.position[0], ov.position[1], ov.position[2]);
      obj.rotation.set(ov.rotation[0], ov.rotation[1], ov.rotation[2]);
      obj.scale.set(ov.scale[0], ov.scale[1], ov.scale[2]);
    }
    byId.set(node.id, obj);
    placed.push(node);

    // Look fosco/cartoon. Precedência: overlay do editor (autorado) > nó (`matte`)
    // > global (`options.matte`). Overlay `false` sobrescreve um matte do código.
    if (node.type === 'model' || node.type === 'primitive' || node.type === 'mesh') {
      if (editorMatte[node.id] ?? node.matte ?? options.matte) setMatte(obj);
      // Material/shader por objeto (ADR-0058) — aplicado DEPOIS do matte, então
      // um `material` (unlit/toon) que troca a malha vence o tweak de matte.
      // Precedência: overlay do editor (autorado) > nó (JSON).
      const matCfg = editorMaterial[node.id] ?? node.material;
      if (matCfg) applyMaterial(obj, matCfg as MaterialConfig);
    }

    // Animação: modelos `.glb` com clipes ganham um SceneAnimator (em
    // `userData.cortexAnim` — o editor controla por ali). Toca o clipe se o nó/
    // overlay pedir. Precedência: overlay (editor) > nó (JSON).
    if (node.type === 'model') {
      const gltf = await loadGLB(node.url);
      if (gltf.animations && gltf.animations.length > 0) {
        const animator = new SceneAnimator(obj, gltf.animations);
        (obj.userData as Record<string, unknown>)['cortexAnim'] = animator;
        animators.push(animator);
        const cfg = editorAnim[node.id] ?? node.animation;
        if (cfg && cfg.autoplay !== false) {
          animator.play(cfg.clip ?? gltf.animations[0]!.name, { loop: cfg.loop, speed: cfg.speed });
        }
      }
    }
  }

  // 2) Resolve `attach` (placement por socket) — após todos posicionados, em ordem
  //    topológica; falha alto em ciclo/alvo ausente. Nós com override do editor
  //    ficam "pinados" (a edição manual vence o attach).
  resolveAttachments(placed, byId, kit, new Set(Object.keys(overrides)));

  // 2.5) Terreno se adapta às estradas `cutfill` (cut & fill + talude, ADR-0072 Fase 2).
  //      Depois de tudo posicionado — não-destrutivo, recalculado a cada build.
  moldTerrainToRoads(three);

  // 3) Plataforma 2.5D: nós com collider/player viram entidades ECS acopladas
  //    (posições já finais). Precedência do collider: código (`node.collider`) >
  //    overlay do editor (`data.colliders[id]`) > preset do `role` no kit.
  if (options.world) {
    // Rapier (física dinâmica): cria o mundo SOB DEMANDA na 1ª vez que um nó
    // `rapierBody` aparece (carrega o WASM via dynamic import) e registra o sistema
    // uma vez só. `physicsPaused` pausa no editor (não simula no F2). Ver ADR-0061.
    const world = options.world;
    let rapierPhysics: RapierPhysics | undefined;
    const ensureRapier = async (): Promise<void> => {
      if (rapierPhysics) return;
      rapierPhysics = await RapierPhysics.create();
      const s = new RapierPhysicsSystem(rapierPhysics);
      if (options.physicsPaused) s.pauseWhen = options.physicsPaused;
      world.addSystem(s);
    };

    for (const node of placed) {
      // Scripts anexados (ADR-0085): overlay (`data.scripts[id]`) VENCE o nó (`node.scripts`).
      // Vale pra QUALQUER tipo de nó — entidade dedicada com o Object3D do nó. O
      // ScriptHostSystem (adicionado pelo jogo, com o contexto) roda no Play.
      const scriptDecls = editorScripts[node.id] ?? (node as { scripts?: ScriptDecl[] }).scripts;
      if (scriptDecls && scriptDecls.length) {
        const sObj = byId.get(node.id);
        if (sObj) {
          const e = world.createEntity();
          e.addComponent(new ScriptComponent(sObj, scriptDecls));
        }
      }

      // Sprite animado: acopla o SpriteAnimationComponent (stashed em userData)
      // a uma entidade ECS e liga o SpriteAnimationSystem (uma vez só).
      if (node.type === 'sprite') {
        const sObj = byId.get(node.id)!;
        const anim = (sObj.userData as Record<string, unknown>)['cortexSpriteAnim'] as
          | SpriteAnimationComponent
          | undefined;
        if (anim) {
          const e = options.world.createEntity();
          e.addComponent(new Object3DComponent(sObj));
          e.addComponent(anim);
          if (!options.world.hasSystem(SpriteAnimationSystem)) options.world.addSystem(new SpriteAnimationSystem());
        }
        continue;
      }
      // Terreno: vira entidade colidível (sólido por padrão) + liga o
      // TerrainCollisionSystem (uma vez) — os corpos ficam em cima da superfície.
      if (node.type === 'terrain') {
        const tObj = byId.get(node.id)!;
        const terrain = (tObj.userData as Record<string, unknown>)['cortexTerrain'] as Terrain | undefined;
        if (terrain) {
          const e = options.world.createEntity();
          e.addComponent(new TerrainComponent(terrain, tObj));
          if (!options.world.hasSystem(TerrainCollisionSystem)) options.world.addSystem(new TerrainCollisionSystem());
        }
        continue;
      }
      if (node.type !== 'model' && node.type !== 'primitive' && node.type !== 'mesh') continue;
      const kitCol =
        node.type === 'model' ? (kitAssetFor(kit, node.url)?.collider as ColliderConfig | undefined) : undefined;
      // Collider efetivo: overlay do editor (autorado) > nó (`collider`) > preset do
      // kit. A overlay VENCE o código agora — pra a edição/remoção no Inspector ter
      // efeito (antes o código vencia e não dava pra mexer; ver ADR-0058).
      const colliderCfg = editorColliders[node.id] ?? node.collider ?? kitCol;
      const obj = byId.get(node.id)!;

      // Tipo de corpo: override do Inspector (overlay `data.physics`) é AUTORITATIVO
      // — sobrescreve o que o nó/código declara. `player` NÃO é um override do
      // Inspector (só o nó declara); sem override, deriva do nó.
      const phys = editorPhysics[node.id] as PhysicsOverride | undefined;

      // Corpo rígido do Rapier (física dinâmica 3D): override 'rigid' do Inspector
      // (autoritativo) OU o nó `rapierBody` (quando não há override dizendo outra
      // coisa). Cria o componente + garante o mundo/sistema (lazy). Vence a 2.5D.
      const rapierCfg: RapierBodyConfig | undefined =
        phys?.type === 'rigid'
          ? (phys.rapier ?? node.rapierBody ?? {})
          : !phys && node.rapierBody
            ? node.rapierBody
            : undefined;
      if (node.rapierBody || phys) {
        debug('scene', 'nó', node.id, 'rapierBody=', node.rapierBody, 'override=', phys, '=> rapierCfg=', rapierCfg);
      }
      if (rapierCfg) {
        await ensureRapier();
        const e = world.createEntity();
        e.addComponent(new Object3DComponent(obj));
        e.addComponent(new RapierBodyComponent(rapierCfg));
        continue;
      }

      if (!phys && node.player) {
        // Mapa ação→clipe do player: overlay (editor) > nó (`animations`) — auto-map
        // por nome completa o que faltar dentro do createPlatformerEntity.
        const playerAnim =
          node.type === 'model' && node.player ? (editorPlayerAnim[node.id] ?? node.animations) : undefined;
        createPlatformerEntity(options.world, obj, node, colliderCfg, playerAnim);
        continue;
      }

      const type: BodyType =
        phys?.type ?? (node.character ? 'character' : colliderCfg ? 'static' : 'none');

      if (type === 'character') {
        // Character (UPBGE): cápsula + gravidade + pulo. Aterra num piso plano
        // (estável, sem raycast) em `groundY` — default 0 (o chão), então colocar o
        // personagem no alto faz ele CAIR até 0. Edite groundY pra outro piso.
        const cfg = phys?.character ?? node.character ?? {};
        const e = options.world.createEntity();
        e.addComponent(new TransformComponent(obj.position.x, obj.position.y, obj.position.z, obj.rotation.y));
        e.addComponent(new Object3DComponent(obj));
        // footOffset: distância da origem do mesh até os pés (base). Primitivas têm
        // origem no centro → sem isso o mesh AFUNDA metade no chão (a física ancora os
        // pés). Modelos com origem nos pés → ~0. Ver CharacterBodyComponent.
        const footOffset = Math.max(0, obj.position.y - getWorldBounds(obj).bottomY);
        e.addComponent(new CharacterBodyComponent({ ...cfg, groundY: cfg.groundY ?? 0, footOffset }));
        // PERF: o personagem é uma malha SKINADA (raycast por vértice com os ossos é
        // caríssimo na CPU) e NUNCA é obstáculo (câmera/chão/carro). Desliga o raycast
        // dele — o que derrubava o FPS no play. A seleção no editor usa o fallback por
        // bbox (ObjectEditSystem), então continua clicável.
        obj.traverse((o) => {
          if ((o as { isMesh?: boolean }).isMesh) o.raycast = (): void => {};
        });
        ensureCharacterSystems(options.world, [three], options.physicsPaused);
      } else if (type === 'static') {
        // Estático sólido: collider de plataforma. Sem dims em lugar nenhum (ex.: o
        // Inspector marcou Estático num objeto "pelado"), deriva do bbox dentro do
        // createPlatformerEntity passando um collider sólido mínimo.
        createPlatformerEntity(options.world, obj, node, colliderCfg ?? { solid: true });
        // Marca SÓLIDO: o CharacterPhysicsSystem trata como PAREDE (colisão horizontal
        // por cápsula). Sem isso, o player (Character/raycast) atravessa o blockout
        // estático — o Collider2D acima é do mundo 2.5D, que o Character ignora.
        (obj.userData as Record<string, unknown>)['cortexSolid'] = true;
      }
      // type === 'none' → nenhuma física (override pode ter DESLIGADO um collider do código).
    }
  }

  return {
    byId,
    update(dt: number): void {
      for (const w of waters) w.update(dt);
      for (const b of backgrounds) b.update();
      for (const a of animators) a.update(dt);
    },
  };
}

/**
 * Instancia UM nó de cena e o adiciona à `scene` (modelo `.glb`, primitiva, luz
 * ou água), já nomeado por `id` e com `place`/`transform` aplicado. Usado pelo
 * {@link buildScene} e pelo editor pra **adicionar um objeto ao vivo** (F2).
 *
 * Nota: água adicionada por aqui não é animada (sem o tick do `buildScene`) até
 * recarregar — adicionar água ao vivo é caso raro.
 *
 * @returns O `Object3D` criado, ou `null` se o tipo for desconhecido.
 */
export async function addSceneNode(scene: Scene, node: SceneNode): Promise<Object3D | null> {
  return instantiate(node, scene, scene.getThreeScene());
}

/**
 * Registra (uma vez) o {@link CharacterPhysicsSystem} (gravidade/pulo + colisão de
 * chão por raycast na cena + piso `groundY` de fallback) no mundo. `roots` =
 * raízes da cena pra colisão real (tipo Unity). `paused` vira o `pauseWhen` do
 * sistema (ex.: `() => game.editorActive`) pra o personagem não cair durante a
 * edição no F2.
 */
function ensureCharacterSystems(world: World, roots: Object3D[], paused?: () => boolean): void {
  if (!world.hasSystem(CharacterPhysicsSystem)) {
    const s = new CharacterPhysicsSystem(roots);
    if (paused) s.pauseWhen = paused;
    world.addSystem(s);
  }
}

/**
 * Cria a entidade ECS de um nó de plataforma — **acoplada à mesh** (Object3D +
 * Transform + Collider2D), então o collider e o objeto movem juntos. `col` é a
 * config de collider resolvida (código `node.collider` tem precedência sobre o
 * overlay do editor; ver {@link overlayColliders}).
 */
function createPlatformerEntity(
  world: World,
  obj: Object3D,
  node: Extract<SceneNode, { type: 'model' | 'primitive' | 'mesh' }>,
  col: ColliderConfig | undefined,
  playerAnimations?: Record<string, string>,
): Entity {
  const e = world.createEntity();
  // rotationY do Object3D (já com override do overlay aplicado) entra no Transform —
  // senão o Object3DSyncSystem zera a rotação Y restaurada todo frame (rotação
  // editada no editor se perdia ao recarregar). pos idem; rotX/Z ficam no Object3D.
  e.addComponent(new TransformComponent(obj.position.x, obj.position.y, obj.position.z, obj.rotation.y));
  e.addComponent(new Object3DComponent(obj));

  const offX = col?.offsetX ?? 0;
  const offY = col?.offsetY ?? 0;
  const shape = col?.shape ?? 'box';
  const points = shape === 'heightfield' ? col?.points : undefined;

  let halfW: number;
  let halfH: number;
  if (points && points.length > 0) {
    // Heightfield: bbox derivado dos pontos (broadphase/gizmo).
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [px, py] of points) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    halfW = (maxX - minX) / 2;
    halfH = Math.max((maxY - minY) / 2, 0.01);
  } else if (col?.width !== undefined && col?.height !== undefined) {
    halfW = col.width / 2;
    halfH = col.height / 2;
  } else {
    const b = getWorldBounds(obj);
    halfW = b.size.x / 2;
    halfH = b.size.y / 2;
  }

  if (node.player) {
    // Player: collider não-sólido (não é parede) + corpo + alvo da câmera.
    e.addComponent(new Collider2DComponent(halfW, halfH, false, false, offX, offY, shape, points));
    const p = typeof node.player === 'object' ? node.player : {};
    e.addComponent(new PlatformerBodyComponent(p.moveSpeed, p.jumpSpeed, p.gravity, p.maxFall));
    e.addComponent(new FollowCameraTargetComponent());
    // Animação por ação: se o modelo tem clipes, o player ganha o mapa ação→clipe
    // — APENAS o que estiver EXPLÍCITO (JSON `animations` ou overlay do editor).
    // NÃO auto-mapeia em runtime (nada escondido): mapa vazio = sem animação
    // (animação não é obrigatória). A inferência por nome é uma conveniência do
    // editor (botão "Auto-mapear") que GRAVA o resultado — ou a IA escreve no JSON.
    const animator = (obj.userData as Record<string, unknown>)['cortexAnim'] as
      | { clipNames(): string[] }
      | undefined;
    if (animator) {
      e.addComponent(new PlayerAnimatorComponent({ ...(playerAnimations ?? {}) }));
    }
  } else if (col) {
    e.addComponent(
      new Collider2DComponent(halfW, halfH, col.solid ?? true, col.oneWay ?? false, offX, offY, shape, points),
    );
  }
  return e;
}

/** Âncora `socket` de um nó `model` (via kit), ou `undefined` (primitivas não têm). */
function anchorAt(
  node: SceneNode,
  socket: string,
  kit: KitDefinition | KitDefinition[] | undefined,
): KitAnchor | undefined {
  return node.type === 'model' ? kitAnchor(kit, node.url, socket) : undefined;
}

/**
 * Resolve os nós com `attach` (placement por socket, ADR-0053): posiciona cada um
 * encaixando seu socket na âncora do alvo, em **ordem topológica** (alvo antes).
 * **Falha alto** se faltar socket/âncora ou houver ciclo. `pinned` = ids com
 * override do editor (não move). Sem `kit`, nós com `attach` falham (precisam das
 * âncoras) — exceto se pinados.
 */
function resolveAttachments(
  nodes: SceneNode[],
  byId: Map<string, Object3D>,
  kit: KitDefinition | KitDefinition[] | undefined,
  pinned: Set<string>,
): void {
  const attachers = nodes.filter(
    (n): n is Extract<SceneNode, { type: 'model' | 'primitive' }> & { attach: AttachConfig } =>
      (n.type === 'model' || n.type === 'primitive') && !!n.attach && !pinned.has(n.id),
  );
  if (attachers.length === 0) return;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const order = attachResolveOrder(
    attachers.map((n) => ({ id: n.id, to: n.attach.to })),
    (id) => byId.has(id),
  );

  for (const id of order) {
    const node = nodeById.get(id) as Extract<SceneNode, { type: 'model' | 'primitive' }> & { attach: AttachConfig };
    const att = node.attach;
    const obj = byId.get(id)!;
    const targetObj = byId.get(att.to)!; // existência garantida por attachResolveOrder
    const targetNode = nodeById.get(att.to);
    const thisAnchor = anchorAt(node, att.socket, kit);
    const targetAnchor = targetNode ? anchorAt(targetNode, att.toSocket, kit) : undefined;
    if (!thisAnchor || !targetAnchor) {
      throw new Error(
        `attach: âncora ausente — "${id}".${att.socket}=${!!thisAnchor} ou "${att.to}".${att.toSocket}=${!!targetAnchor} (kit carregado?)`,
      );
    }
    const pos = resolveAttachPosition(
      [targetObj.position.x, targetObj.position.y, targetObj.position.z],
      targetAnchor.at,
      thisAnchor.at,
      att.offset,
    );
    obj.position.set(pos[0], pos[1], pos[2]);
  }
}

async function instantiate(
  node: SceneNode,
  scene: Scene,
  three: import('three').Scene,
  waters?: Water[],
  kit?: KitDefinition | KitDefinition[],
  meshGeometry?: EditableMesh,
): Promise<Object3D | null> {
  let obj: Object3D;
  switch (node.type) {
    case 'model':
      obj = instance(await loadGLB(node.url), { castShadow: node.castShadow, receiveShadow: node.receiveShadow });
      three.add(obj);
      applyPlacement(obj, node);
      break;
    case 'primitive':
      obj = makePrimitive(node);
      three.add(obj);
      applyPlacement(obj, node);
      break;
    case 'mesh':
      obj = makeEditableMesh(node, meshGeometry);
      three.add(obj);
      applyPlacement(obj, node);
      break;
    case 'road':
      obj = makeRoad(node, three);
      three.add(obj);
      applyPlacement(obj, node);
      break;
    case 'vegetation':
      obj = await makeVegetation(node);
      three.add(obj);
      applyPlacement(obj, node);
      break;
    case 'light':
      obj = makeLight(node);
      three.add(obj);
      break;
    case 'underlay':
      obj = await makeUnderlay(node);
      three.add(obj);
      applyPlacement(obj, node);
      break;
    case 'water': {
      const water = new Water(scene, {
        y: node.y,
        color: node.color,
        causticsUrl: node.causticsUrl,
        repeat: node.repeat,
        causticsIntensity: node.causticsIntensity,
        flowSpeed: node.flowSpeed,
      });
      waters?.push(water);
      obj = water.mesh;
      break;
    }
    case 'sprite': {
      const texture = await loadTexture(node.url, node.pixelated !== false);
      obj = makeSprite(node, texture, kitAssetFor(kit, node.url)?.sprite);
      three.add(obj);
      applyPlacement(obj, node);
      break;
    }
    case 'terrain': {
      const terrain = new Terrain({
        size: node.size,
        resolution: node.resolution,
        heights: node.heights,
        color: node.color,
      });
      obj = terrain.mesh; // o controlador fica em mesh.userData.cortexTerrain (editor esculpe)
      three.add(obj);
      applyPlacement(obj, node);
      break;
    }
    case 'background':
      // Backdrop precisa da câmera — é criado no buildScene, não por aqui.
      throw new Error('Nó background não é instanciável isoladamente (use buildScene com options.camera).');
  }
  obj.name = node.id;
  // Marca como NÓ da cena: o editor só deixa autorar física (collider/character/
  // Rapier) em nós (o overlay reconcilia no boot). Objetos criados em código não
  // têm essa marca → o Inspector bloqueia, pra não enganar com edição que se perde.
  (obj.userData as Record<string, unknown>)['cortexSceneNode'] = true;
  return obj;
}

/**
 * Cria o mesh de um nó `sprite`: estático ({@link createSprite}) ou animado
 * ({@link createAnimatedSprite}, quando há `animations`). No caso animado, o
 * {@link SpriteAnimationComponent} fica em `userData.cortexSpriteAnim` — o
 * {@link buildScene} (com `world`) o acopla a uma entidade ECS e liga o
 * {@link SpriteAnimationSystem}. A grade vem de `frameWidth/frameHeight` ou de
 * `columns/rows` (derivado do tamanho da textura).
 */
function makeSprite(
  node: Extract<SceneNode, { type: 'sprite' }>,
  texture: import('three').Texture,
  kitSprite?: KitSprite,
): Object3D {
  const img = texture.image as { width?: number; height?: number } | undefined;
  const texW = img?.width ?? 0;
  const texH = img?.height ?? 0;
  // Framedata: campos do nó vencem; o kit (por `url`) preenche o que faltar.
  const animations = node.animations ?? kitSprite?.animations;
  const columns = node.columns ?? kitSprite?.columns;
  const rows = node.rows ?? kitSprite?.rows;
  const common = {
    pixelsPerUnit: node.pixelsPerUnit ?? kitSprite?.pixelsPerUnit,
    width: node.width,
    height: node.height,
    alphaTest: node.alphaTest,
  };

  if (animations && Object.keys(animations).length > 0) {
    const frameWidth = Math.max(1, node.frameWidth ?? kitSprite?.frameWidth ?? (columns ? Math.floor(texW / columns) : texW));
    const frameHeight = Math.max(1, node.frameHeight ?? kitSprite?.frameHeight ?? (rows ? Math.floor(texH / rows) : texH));
    const sheet = new Spritesheet(texture, {
      frameWidth,
      frameHeight,
      ...(columns ? { columns } : {}),
      ...(rows ? { rows } : {}),
    });
    const { sprite, animation } = createAnimatedSprite(sheet, animations, {
      ...common,
      initial: node.initial ?? kitSprite?.initial,
    });
    (sprite.userData as Record<string, unknown>)['cortexSpriteAnim'] = animation;
    return sprite;
  }

  return createSprite(texture, { ...common, pixelated: node.pixelated });
}

/** Aplica `place` (grounding) ou `transform` (pose direta) a um mesh. */
function applyPlacement(obj: Object3D, node: { place?: unknown; transform?: unknown }): void {
  const place = node.place as
    | { x?: number; y?: number; z?: number; rotY?: number; scale?: number }
    | undefined;
  const transform = node.transform as
    | { position?: number[]; rotation?: number[]; scale?: number | number[] }
    | undefined;
  if (place) {
    placeOnGround(obj, place);
  } else if (transform) {
    if (transform.position) obj.position.set(transform.position[0]!, transform.position[1]!, transform.position[2]!);
    if (transform.rotation) obj.rotation.set(transform.rotation[0]!, transform.rotation[1]!, transform.rotation[2]!);
    if (transform.scale !== undefined) {
      if (typeof transform.scale === 'number') obj.scale.setScalar(transform.scale);
      else obj.scale.set(transform.scale[0]!, transform.scale[1]!, transform.scale[2]!);
    }
  }
}

/**
 * Underlay — plano texturizado deitado no chão (imagem de referência pra blockout).
 * `userData.cortexUnderlay` aponta pra o mesh (o Inspector edita material/altura).
 */
async function makeUnderlay(node: Extract<SceneNode, { type: 'underlay' }>): Promise<Object3D> {
  const size = node.size ?? 128;
  const mat = new MeshBasicMaterial({
    transparent: true,
    opacity: node.opacity ?? 0.6,
    depthWrite: false,
    depthTest: false, // overlay: desenha SEM testar profundidade → sem z-fight com o terreno
    toneMapped: false, // a referência sai com a cor da imagem (sem ACES)
    side: DoubleSide,
  });
  if (node.image) mat.map = await loadTexture(node.image, false);
  const plane = new Mesh(new PlaneGeometry(size, size), mat);
  plane.rotation.x = -Math.PI / 2; // deita no plano XZ (chão)
  plane.position.y = node.height ?? 0.05;
  plane.renderOrder = 10; // desenha por cima da cena (translúcido); blockouts aparecem através
  plane.raycast = () => {}; // clica ATRAVÉS → dá pra posicionar blockouts por cima
  const group = new Group();
  group.add(plane);
  const ud = group.userData as Record<string, unknown>;
  ud['cortexUnderlay'] = plane;
  ud['cortexUnderlayImage'] = node.image ?? '';
  return group;
}

function makePrimitive(node: Extract<SceneNode, { type: 'primitive' }>): Mesh {
  const s = node.size;
  const dims: [number, number, number] =
    s === undefined ? [1, 1, 1] : typeof s === 'number' ? [s, s, s] : [s[0], s[1], s[2]];
  let geometry;
  switch (node.shape) {
    case 'cylinder':
      geometry = new CylinderGeometry(dims[0] / 2, dims[0] / 2, dims[1], 32);
      break;
    case 'plane':
      geometry = new PlaneGeometry(dims[0], dims[2] || dims[0]);
      break;
    case 'sphere':
      geometry = new SphereGeometry(dims[0] / 2, 32, 16);
      break;
    default:
      geometry = new BoxGeometry(dims[0], dims[1], dims[2]);
  }
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: node.color ?? 0xcccccc,
      roughness: node.roughness ?? 1,
      metalness: node.metalness ?? 0,
    }),
  );
  if (node.shape === 'plane') mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = node.castShadow ?? true;
  mesh.receiveShadow = node.receiveShadow ?? true;
  return mesh;
}

/**
 * Cria o mesh de um nó `mesh` (blockout editável — ADR-0071). Precedência da
 * geometria: `geomOverride` (overlay do editor) > geometria explícita do nó
 * (`positions`/`faces`) > receita `shape` > cubo default. Flat-shaded + DoubleSide
 * (look facetado, sem fragilidade de winding). Os **mapas de picking** e a malha
 * lógica ficam em `userData.cortexMesh` (a edição de elementos lê daqui).
 */
function makeEditableMesh(node: Extract<SceneNode, { type: 'mesh' }>, geomOverride?: EditableMesh): Mesh {
  const logical: EditableMesh =
    geomOverride ??
    (node.positions && node.faces
      ? { positions: node.positions as EditableMesh['positions'], faces: node.faces }
      : node.shape
        ? buildShape(node.shape.kind, node.shape.params)
        : buildShape('cube'));
  const { geometry, maps } = toBufferGeometry(logical);
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: node.color ?? 0xb0b4bd,
      roughness: node.roughness ?? 1,
      metalness: node.metalness ?? 0,
      side: DoubleSide,
    }),
  );
  mesh.castShadow = node.castShadow ?? true;
  mesh.receiveShadow = node.receiveShadow ?? true;
  (mesh.userData as Record<string, unknown>)['cortexMesh'] = { logical, maps };
  return mesh;
}

/**
 * Cria a malha de uma **estrada** (spline → ribbon — ADR-0072). Amostra a spline dos
 * `nodes`, opcionalmente **conforma ao terreno** (raycast pra baixo por amostra, fixa
 * o Y em `terrenoY + yOffset`), gera a faixa e aplica a textura da superfície (carrega
 * async). Guarda a spline em `userData.cortexRoad` (o editor edita os nós). O `three`
 * já tem o terreno instanciado (o nó terrain vem antes na ordem da cena).
 */
/**
 * Ajusta uma textura pra **tilear bem numa pista** (ADR-0072): repeat + mipmaps +
 * filtragem linear + anisotropia (mata o granulado/aliasing ao longe). `albedo` =
 * setar sRGB (diffuse); normal map fica linear. Força os filtros mesmo se a textura
 * veio do cache com NearestFilter.
 */
function smoothTiled(t: import('three').Texture, albedo: boolean): void {
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  if (albedo) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
}

function makeRoad(node: Extract<SceneNode, { type: 'road' }>, three: Object3D): Object3D {
  if (node.profile) return makeProfiledRoad(node, three); // ADR-0087: seção transversal
  const mesh = new Mesh();
  mesh.receiveShadow = true;
  applyRoad(mesh, node, three);
  return mesh;
}

/**
 * **Via com perfil** (ADR-0087): extruda a seção transversal ({@link profileMesh}) ao longo da
 * spline → um `Group` com uma malha por parte (pista/calçada/meio-fio), cada uma conformada ao
 * terreno (raycast por vértice + yOffset) e com material flat stylized (cor da superfície). As
 * partes dirigíveis + o meio-fio viram collider do carro (`cortexRoad`). Editor live-edit de
 * perfil ainda não suportado (regenera só no reload).
 */
function makeProfiledRoad(node: Extract<SceneNode, { type: 'road' }>, three: Object3D): Object3D {
  const group = new Group();
  const profile = getProfile(node.profile!);
  const yOffset = node.yOffset ?? 0.05;
  const samples = sampleSpline(node.nodes as [number, number, number][], node.steps ?? 24);
  const parts = profileMesh(samples, profile);

  const terrains: Object3D[] = [];
  three.traverse((o) => { if ((o.userData as Record<string, unknown>)['cortexTerrain']) terrains.push(o); });
  const conform = node.conformTerrain !== false && terrains.length > 0;
  const ray = new Raycaster();
  const down = new Vector3(0, -1, 0);
  const origin = new Vector3();

  for (const part of parts) {
    const geometry = ribbonToGeometry(part.ribbon);
    const pos = geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      if (conform) {
        origin.set(pos.getX(i), 1e4, pos.getZ(i));
        ray.set(origin, down);
        const hit = ray.intersectObjects(terrains, true)[0];
        y = (hit ? hit.point.y : 0) + part.ribbon.positions[i * 3 + 1]!; // mantém o degrau do perfil
      }
      pos.setY(i, y + yOffset);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const surf = resolveSurface(part.surface as RoadSurfaceName | undefined);
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: surf.color, roughness: 1, metalness: 0 }));
    mesh.receiveShadow = true;
    mesh.name = `${node.id}_${part.role}`;
    // Pista + meio-fio = collider do carro (o chassi bate no meio-fio e fica na pista).
    if (part.drivable || part.role === 'curb') (mesh.userData as Record<string, unknown>)['cortexRoad'] = true;
    group.add(mesh);
  }
  (group.userData as Record<string, unknown>)['cortexRoadProfile'] = { id: node.id, profile: node.profile };
  return group;
}

/**
 * (Re)gera a malha + material de uma estrada num `mesh` existente (ADR-0072).
 * Amostra a spline dos `nodes`, **conforma ao terreno** (raycast pra baixo por amostra
 * → `terrenoY + yOffset`), monta o ribbon e aplica a superfície. Quando há textura, a
 * cor base vira **branca** (senão o `color` escuro escureceria a textura). Atualiza
 * `userData.cortexRoad`. Exportado pra o editor regenerar ao vivo (trocar superfície/
 * largura). `three` = raiz da cena (pra achar o terreno).
 */
export function applyRoad(mesh: Mesh, node: Extract<SceneNode, { type: 'road' }>, three: Object3D): void {
  const surf = resolveSurface(node.surface);
  const width = node.width ?? 8;
  const yOffset = node.yOffset ?? 0.05;
  // Densidade generosa (fiel ao Road Architect): muitas amostras no comprimento +
  // colunas ao longo da largura → conforma de verdade ao relevo (não só inclina).
  const samples = sampleSpline(node.nodes as [number, number, number][], node.steps ?? 24);
  const widthSegments = Math.max(2, Math.min(16, Math.round(width / 1.5)));

  mesh.geometry?.dispose();
  const geometry = toRoadGeometry(samples, width, surf.repeat, widthSegments);

  // Relação pista↔terreno (ADR-0072). `conform` (Fase 1): a PISTA se deforma seguindo
  // o relevo (raycast por vértice). `cutfill` (Fase 2): a pista tem GREIDE suavizado e
  // o TERRENO é moldado a ela (corte/aterro + talude) — a moldagem em si acontece no
  // post-pass `moldTerrainToRoads`; aqui só fixamos o Y da pista no greide + guardamos
  // o eixo (centerline) pro post-pass reusar o MESMO greide.
  const mode = node.terrainMode ?? 'conform';
  const conform = node.conformTerrain !== false;
  const terrains: Object3D[] = [];
  three.traverse((o) => { if ((o.userData as Record<string, unknown>)['cortexTerrain']) terrains.push(o); });
  const pos = geometry.getAttribute('position');
  const vertsPerRow = widthSegments + 1;
  let centerline: GradePoint[] | undefined;

  if (mode === 'cutfill' && terrains.length > 0) {
    // Altura do terreno sob cada amostra do eixo → greide suavizado (média móvel +
    // clamp de inclinação). A pista fica PLANA na largura e segue o greide no comprimento.
    const ray = new Raycaster();
    const down = new Vector3(0, -1, 0);
    const origin = new Vector3();
    const terrainY = samples.map((s) => {
      origin.set(s.pos[0], 1e4, s.pos[2]);
      ray.set(origin, down);
      const hit = ray.intersectObjects(terrains, true)[0];
      return hit ? hit.point.y : s.pos[1];
    });
    const grade = smoothGrade(samples, terrainY, { maxSlope: node.maxSlope });
    for (let i = 0; i < pos.count; i++) {
      const row = Math.min(grade.length - 1, Math.floor(i / vertsPerRow));
      pos.setY(i, grade[row]! + yOffset);
    }
    centerline = samples.map((s, i) => ({ x: s.pos[0], z: s.pos[2], y: grade[i]! }));
  } else if (conform && terrains.length > 0) {
    // Conformar (Fase 1): raycast pra baixo em CADA vértice da grade (bordas + meio),
    // fixa o Y em terrenoY + yOffset, e RECALCULA as normais (sombreamento na rampa).
    const ray = new Raycaster();
    const down = new Vector3(0, -1, 0);
    const origin = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      origin.set(pos.getX(i), 1e4, pos.getZ(i));
      ray.set(origin, down);
      const hit = ray.intersectObjects(terrains, true)[0];
      pos.setY(i, (hit ? hit.point.y : pos.getY(i)) + yOffset);
    }
  } else {
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + yOffset);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals(); // normais reais da superfície conformada
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  mesh.geometry = geometry;
  // Cor BRANCA quando há textura (o map é multiplicado pela cor — cor escura =
  // pista preta). Sem textura, usa a cor da superfície como fallback.
  const material = new MeshStandardMaterial({ color: surf.diffuse ? 0xffffff : surf.color, roughness: 0.95, metalness: 0 });
  if (surf.diffuse) {
    // pixelated=false → filtragem LINEAR + mipmaps (senão a pista fica granulada/aliased
    // ao longe). + anisotropia (nitidez em ângulo rasante) + sRGB (albedo).
    void loadTexture(surf.diffuse, false).then((t) => {
      smoothTiled(t, true);
      material.map = t;
      material.needsUpdate = true;
    }).catch(() => {});
  }
  if (surf.normal) {
    void loadTexture(surf.normal, false).then((t) => {
      smoothTiled(t, false); // normal map é dado LINEAR — não setar colorSpace sRGB
      material.normalMap = t;
      material.needsUpdate = true;
    }).catch(() => {});
  }
  (mesh.material as MeshStandardMaterial | undefined)?.dispose();
  mesh.material = material;

  // Marcação de pista (ADR-0076): overlay RGBA transparente um tiquinho ACIMA da pista,
  // reusando a MESMA geometria conformada (clonada). A textura atravessa a largura (U)
  // com as linhas no lugar; tila no comprimento (V) pelo `repeat` da marcação.
  applyRoadMarkings(mesh, geometry, node.markings, surf.repeat);

  (mesh.userData as Record<string, unknown>)['cortexRoad'] = {
    nodes: node.nodes,
    width,
    surface: node.surface ?? 'asphalt',
    markings: node.markings ?? null,
    conformTerrain: conform,
    terrainMode: mode,
    taludeWidth: node.taludeWidth ?? 6,
    maxSlope: node.maxSlope ?? 0.25,
    steps: node.steps ?? 12,
    yOffset,
    centerline, // eixo + greide (coords de mundo) — consumido por moldTerrainToRoads
  };
}

/**
 * Gera (ou remove/atualiza) o **overlay de marcação** de uma estrada (ADR-0076). Clona a
 * geometria conformada da pista, **levanta** os vértices um epsilon e reescala o V do UV
 * pro tile da marcação; aplica um material **transparente** (`depthWrite:false` +
 * `polygonOffset` evitam z-fight). O overlay vive como filho do mesh da pista
 * (`userData.cortexRoadMarkings`) — chamado a cada {@link applyRoad}, então primeiro
 * descarta o overlay anterior (regen ao vivo no editor).
 */
function applyRoadMarkings(mesh: Mesh, roadGeo: BufferGeometry, markings: RoadMarking | undefined, surfRepeat: number): void {
  const prev = mesh.children.find((c) => (c.userData as Record<string, unknown>)['cortexRoadMarkings']) as Mesh | undefined;
  if (prev) {
    mesh.remove(prev);
    prev.geometry?.dispose();
    (prev.material as MeshStandardMaterial | undefined)?.dispose();
  }
  const def = resolveMarking(markings);
  if (!def) return;

  const geo = roadGeo.clone();
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + 0.02); // acima da pista
  pos.needsUpdate = true;
  // roadV = dist/surfRepeat ⇒ markV = dist/markRepeat = roadV·(surfRepeat/markRepeat).
  const uvAttr = geo.getAttribute('uv');
  const scaleV = surfRepeat / def.repeat;
  for (let i = 0; i < uvAttr.count; i++) uvAttr.setY(i, uvAttr.getY(i) * scaleV);
  uvAttr.needsUpdate = true;

  const omat = new MeshStandardMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    roughness: 0.9,
    metalness: 0,
  });
  void loadTexture(def.url, false).then((t) => {
    smoothTiled(t, true);
    omat.map = t;
    omat.needsUpdate = true;
  }).catch(() => {});
  const omesh = new Mesh(geo, omat);
  omesh.receiveShadow = true;
  omesh.raycast = () => {}; // decoração: fora dos raycasts (chão/parede do personagem)
  (omesh.userData as Record<string, unknown>)['cortexRoadMarkings'] = true;
  mesh.add(omesh);
}

/**
 * **Post-pass: o terreno se adapta às estradas `cutfill`** (ADR-0072 Fase 2). Depois
 * de todos os nós posicionados, para cada terreno acumula o *cut & fill* (+ talude) de
 * cada estrada `cutfill` (reusando o greide já calculado em {@link applyRoad}, guardado
 * em `cortexRoad.centerline`) e aplica via {@link Terrain.setRoadMolding} —
 * **não-destrutivo** (recalculado a cada build; mover/remover a estrada re-ajeita o
 * terreno sem cicatriz salva). Sem estradas `cutfill`, limpa a moldagem (idempotente).
 * Exportado pra o editor remoldar ao vivo após {@link applyRoad}.
 */
export function moldTerrainToRoads(three: Object3D): void {
  const terrains: Object3D[] = [];
  const roads: { width: number; talude: number; centerline: GradePoint[] }[] = [];
  three.traverse((o) => {
    const ud = o.userData as Record<string, unknown>;
    if (ud['cortexTerrain']) terrains.push(o);
    const cr = ud['cortexRoad'] as
      | { terrainMode?: string; width?: number; taludeWidth?: number; centerline?: GradePoint[] }
      | undefined;
    if (cr && cr.terrainMode === 'cutfill' && Array.isArray(cr.centerline) && cr.centerline.length >= 2) {
      roads.push({ width: cr.width ?? 8, talude: cr.taludeWidth ?? 6, centerline: cr.centerline });
    }
  });
  if (terrains.length === 0) return;

  const v = new Vector3();
  for (const t of terrains) {
    const terrain = (t.userData as Record<string, unknown>)['cortexTerrain'] as Terrain;
    t.updateMatrixWorld(true);
    const grid = { width: terrain.width, depth: terrain.depth, resolution: terrain.resolution, base: terrain.getHeights() };
    const deltas: Float32Array[] = [];
    for (const road of roads) {
      // Eixo da estrada (mundo) → coords LOCAIS do terreno (X/Z no plano, Y = greide).
      const local: GradePoint[] = road.centerline.map((p) => {
        v.set(p.x, p.y, p.z);
        t.worldToLocal(v);
        return { x: v.x, z: v.z, y: v.y };
      });
      deltas.push(moldHeightfield(grid, local, road.width / 2, road.talude));
    }
    terrain.setRoadMolding(mergeDeltas(deltas)); // null (sem cutfill) limpa a moldagem
  }
}

/**
 * **Vegetação instanciada** (ADR-0077): carrega o `.glb` do `model` (ou um placeholder
 * procedural se omitido), cria a {@link Vegetation} (uma {@link InstancedMesh} por
 * sub-malha) e espalha as `instances` do nó. O controlador fica em
 * `group.userData.cortexVegetation` — o pincel do editor espalha/apaga por ali.
 */
async function makeVegetation(node: Extract<SceneNode, { type: 'vegetation' }>): Promise<Object3D> {
  // Modelo `.glb` quando houver; se faltar/falhar, cai no placeholder (não quebra a cena).
  let source: Object3D;
  if (node.model) {
    try {
      source = instance(await loadGLB(node.model), { castShadow: true });
    } catch {
      debug('vegetation', 'modelo falhou, usando placeholder:', node.model);
      source = makePlaceholderVegetation(node.kind ?? 'tree');
    }
  } else {
    source = makePlaceholderVegetation(node.kind ?? 'tree');
  }
  const veg = new Vegetation(source, node.capacity ?? 8192);
  if (node.instances && node.instances.length) veg.setInstances(node.instances);
  const ud = veg.group.userData as Record<string, unknown>;
  ud['cortexVegetation'] = veg;
  ud['cortexVegetationKind'] = node.kind ?? (node.model ? 'model' : 'tree');
  // Colisão (player não atravessa os troncos). Default: liga, exceto grama.
  if (node.collide ?? node.kind !== 'grass') ud['cortexSolid'] = true;
  return veg.group;
}

function makeLight(node: Extract<SceneNode, { type: 'light' }>): Object3D {
  if (node.light === 'hemisphere') {
    return new HemisphereLight(node.color ?? 0x9fd6ee, node.groundColor ?? 0xb6e2a8, node.intensity ?? 0.6);
  }
  if (node.light === 'ambient') {
    return new AmbientLight(node.color ?? 0xffffff, node.intensity ?? 0.2);
  }
  const sun = new DirectionalLight(node.color ?? 0xfff2cc, node.intensity ?? 3);
  const p = node.position ?? [35, 55, 25];
  sun.position.set(p[0], p[1], p[2]);
  if (node.castShadow) {
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    const cam = sun.shadow.camera;
    cam.left = -60;
    cam.right = 60;
    cam.top = 60;
    cam.bottom = -60;
    cam.near = 1;
    cam.far = 240;
    cam.updateProjectionMatrix();
  }
  return sun;
}
