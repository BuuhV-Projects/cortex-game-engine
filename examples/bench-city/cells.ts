/**
 * **Células + LOD do bench** (M-perf-4 / ADR-0138/0139). Particiona os prédios
 * numa grade de células e monta cada célula como um `THREE.LOD`:
 * - nível 0 (perto): a célula COMPLETA (buildScene com merge + render bundle);
 * - nível 1 (longe): um PROXY low-poly (caixas do bounding de cada prédio, uma
 *   malha fundida barata) — o "longe mas visível vira low-poly" do open-world.
 *
 * O {@link CellStreamingSystem} adiciona/remove os LODs da cena por distância
 * (carrega por raio); o three troca o nível do LOD por distância (auto); e o
 * frustum culling do three não desenha o que está fora da tela. Os três juntos.
 */
import { Scene, buildScene, type SceneDefinition, type Renderer } from '../../src/index-runtime.js';
import {
  Group,
  LOD,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Matrix4,
  Vector3,
  Quaternion,
  Euler,
  type Object3D,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StreamingCell } from '../../src/scene/Streaming.js';

/** Bounding (m) de cada modelo do kit — pra montar o proxy de caixa. */
const MODEL_BOUNDS: Record<string, [number, number, number]> = {
  'assets/models/Building_Large_2.glb': [20.6, 28.0, 16.6],
  'assets/models/Building_Medium_2_001.glb': [15.1, 25.0, 13.1],
  'assets/models/Building_Small_1.glb': [12.5, 17.0, 14.5],
};
const FALLBACK_BOUNDS: [number, number, number] = [14, 20, 14];
const PROXY_COLOR = 0x8a8f98;

/** Nó de prédio (subconjunto do que o gerador emite). */
export interface BuildingNode {
  url: string;
  transform: { position: [number, number, number]; rotation?: [number, number, number] };
}

export interface BuildCellsOptions {
  cellSize: number;
  lodDistance: number;
  mergeStatic: boolean;
  renderBundles: boolean;
  renderer: Renderer;
}

export interface BuildCellsResult {
  cells: StreamingCell[];
  lods: Map<string, LOD>;
}

/** Proxy low-poly de uma célula: caixas do bounding de cada prédio, fundidas. */
function makeProxy(nodes: BuildingNode[]): Mesh {
  const parts: BufferGeometry[] = [];
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  for (const n of nodes) {
    const [w, h, d] = MODEL_BOUNDS[n.url] ?? FALLBACK_BOUNDS;
    const geo = new BoxGeometry(w, h, d);
    const rotY = n.transform.rotation?.[1] ?? 0;
    e.set(0, rotY, 0);
    m.compose(new Vector3(n.transform.position[0], h / 2, n.transform.position[2]), q.setFromEuler(e), new Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    parts.push(geo);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  const mesh = new Mesh(merged, new MeshStandardMaterial({ color: PROXY_COLOR, roughness: 1, metalness: 0 }));
  mesh.receiveShadow = true; // proxy não projeta sombra (barato)
  return mesh;
}

/** Chave da célula pra uma posição XZ. */
function cellKey(x: number, z: number, cellSize: number): string {
  return `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
}

/**
 * Particiona os prédios em células e monta um `LOD` por célula (full + proxy).
 * Os LODs saem DESTACADOS (não na cena) — o streaming os adiciona por distância.
 */
export async function buildCells(nodes: BuildingNode[], opts: BuildCellsOptions): Promise<BuildCellsResult> {
  const groups = new Map<string, BuildingNode[]>();
  for (const n of nodes) {
    const key = cellKey(n.transform.position[0], n.transform.position[2], opts.cellSize);
    let list = groups.get(key);
    if (!list) {
      list = [];
      groups.set(key, list);
    }
    list.push(n);
  }

  const cells: StreamingCell[] = [];
  const lods = new Map<string, LOD>();
  for (const [key, cellNodes] of groups) {
    // Full: monta os prédios da célula numa Scene temporária (merge + bundle).
    const cellScene = new Scene();
    await buildScene(cellScene, [{ version: 1, nodes: cellNodes } as unknown as SceneDefinition], {
      renderer: opts.renderer,
      mergeStatic: opts.mergeStatic,
      renderBundles: opts.renderBundles,
    });
    const full = new Group();
    for (const child of [...cellScene.getThreeScene().children] as Object3D[]) full.attach(child);

    const proxy = makeProxy(cellNodes);

    // Centro da célula (média das posições) — o LOD mede a distância daqui.
    let sx = 0;
    let sz = 0;
    for (const n of cellNodes) {
      sx += n.transform.position[0];
      sz += n.transform.position[2];
    }
    const cx = sx / cellNodes.length;
    const cz = sz / cellNodes.length;

    // LOD no centro; os filhos ficam em coord de MUNDO (compensa o offset do LOD),
    // pra a geometria (baked em world pelo merge) renderizar no lugar certo.
    const lod = new LOD();
    lod.position.set(cx, 0, cz);
    full.position.set(-cx, 0, -cz);
    proxy.position.set(-cx, 0, -cz);
    lod.addLevel(full, 0);
    lod.addLevel(proxy, opts.lodDistance);

    lods.set(key, lod);
    cells.push({ key, x: cx, z: cz });
  }
  return { cells, lods };
}
