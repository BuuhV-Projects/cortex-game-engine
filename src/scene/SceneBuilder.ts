import {
  Color,
  Fog,
  Mesh,
  BoxGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  DirectionalLight,
  HemisphereLight,
  AmbientLight,
  PCFSoftShadowMap,
  type Object3D,
} from 'three';
import { Scene } from '../core/Scene.js';
import type { Renderer } from '../core/Renderer.js';
import type { World } from '../ecs/World.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { Collider2DComponent } from '../components/Collider2DComponent.js';
import { PlatformerBodyComponent } from '../components/PlatformerBodyComponent.js';
import { FollowCameraTargetComponent } from '../components/FollowCameraTargetComponent.js';
import { loadGLB, instance, placeOnGround, getWorldBounds, setMatte } from './SceneAssets.js';
import { Water } from './Water.js';
import { setupOutdoorLighting } from './OutdoorLighting.js';
import {
  parseSceneNode,
  type SceneDefinition,
  type SceneNode,
  type ColliderConfig,
  type AttachConfig,
} from './SceneDefinition.js';
import {
  kitAssetFor,
  kitAnchor,
  resolveAttachPosition,
  attachResolveOrder,
  type KitAnchor,
  type KitDefinition,
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
  const overlay = options.overlay ?? null;
  const deleted = new Set<string>(overlayDeleted(overlay));
  const overrides = overlay?.objects ?? {};
  const editorColliders = overlayColliders(overlay);

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
    if (outdoor) setupOutdoorLighting(options.renderer, scene, outdoor);
  }

  // ── Nós: base (arquivos) + adicionados (overlay) ─────────────────────────────
  const allNodes: SceneNode[] = [...list.flatMap((d) => d.nodes), ...overlayAdded(overlay)];
  const kit = options.kit;

  // 1) Instancia todos os nós (sem criar entidades ainda — `attach` pode mover a
  //    pose depois, e a entidade ECS copia a posição final).
  const placed: SceneNode[] = [];
  for (const node of allNodes) {
    if (deleted.has(node.id) || byId.has(node.id)) continue;
    const obj = await instantiate(node, scene, three, waters);
    if (!obj) continue;
    // Override do editor (transform exata salva) tem precedência sobre place/transform/attach.
    const ov = overrides[node.id];
    if (ov) {
      obj.position.set(ov.position[0], ov.position[1], ov.position[2]);
      obj.rotation.set(ov.rotation[0], ov.rotation[1], ov.rotation[2]);
      obj.scale.set(ov.scale[0], ov.scale[1], ov.scale[2]);
    }
    byId.set(node.id, obj);
    placed.push(node);

    // Look fosco/cartoon: por nó (`matte`) com fallback pro global (`options.matte`).
    if (node.type === 'model' || node.type === 'primitive') {
      if (node.matte ?? options.matte) setMatte(obj);
    }
  }

  // 2) Resolve `attach` (placement por socket) — após todos posicionados, em ordem
  //    topológica; falha alto em ciclo/alvo ausente. Nós com override do editor
  //    ficam "pinados" (a edição manual vence o attach).
  resolveAttachments(placed, byId, kit, new Set(Object.keys(overrides)));

  // 3) Plataforma 2.5D: nós com collider/player viram entidades ECS acopladas
  //    (posições já finais). Precedência do collider: código (`node.collider`) >
  //    overlay do editor (`data.colliders[id]`) > preset do `role` no kit.
  if (options.world) {
    for (const node of placed) {
      if (node.type !== 'model' && node.type !== 'primitive') continue;
      const kitCol =
        node.type === 'model' ? (kitAssetFor(kit, node.url)?.collider as ColliderConfig | undefined) : undefined;
      const colliderCfg = node.collider ?? editorColliders[node.id] ?? kitCol;
      if (colliderCfg || node.player) {
        createPlatformerEntity(options.world, byId.get(node.id)!, node, colliderCfg);
      }
    }
  }

  return {
    byId,
    update(dt: number): void {
      for (const w of waters) w.update(dt);
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
 * Cria a entidade ECS de um nó de plataforma — **acoplada à mesh** (Object3D +
 * Transform + Collider2D), então o collider e o objeto movem juntos. `col` é a
 * config de collider resolvida (código `node.collider` tem precedência sobre o
 * overlay do editor; ver {@link overlayColliders}).
 */
function createPlatformerEntity(
  world: World,
  obj: Object3D,
  node: Extract<SceneNode, { type: 'model' | 'primitive' }>,
  col: ColliderConfig | undefined,
): void {
  const e = world.createEntity();
  e.addComponent(new TransformComponent(obj.position.x, obj.position.y, obj.position.z));
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
  } else if (col) {
    e.addComponent(
      new Collider2DComponent(halfW, halfH, col.solid ?? true, col.oneWay ?? false, offX, offY, shape, points),
    );
  }
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
    case 'light':
      obj = makeLight(node);
      three.add(obj);
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
  }
  obj.name = node.id;
  return obj;
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
