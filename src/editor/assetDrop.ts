import { type Camera, type Intersection, type Object3D, Plane, Raycaster, Vector2, Vector3 } from 'three';

/**
 * **Drop de asset no viewport** (arrastar-pra-adicionar): lógica pura do fluxo
 * "arrasto um `.glb` (do painel Add, da árvore de arquivos da IDE, …) e solto
 * sobre a cena". Separada do `attachEditor` pra ser testável: identificar a URL
 * do asset no `DataTransfer` e resolver o **ponto-mundo** onde o modelo deve
 * nascer (raycast na geometria; fallback no plano do chão; fallback à frente da
 * câmera).
 */

/**
 * MIME próprio do drag de asset. A IDE (FileTree) e o painel Add do editor
 * escrevem a URL relativa ao projeto (ex.: `assets/kit/tree_001.glb`) sob este
 * tipo — o drop lê este primeiro e só cai pro `text/plain` se parecer um `.glb`
 * (o FileTree usa `text/plain` pro caminho ABSOLUTO do move-arquivo, que não
 * serve de URL).
 */
export const ASSET_DRAG_MIME = 'application/x-cortex-asset';

/** Leitura mínima de um `DataTransfer` (interface p/ teste sem DOM). */
export interface DataTransferLike {
  getData(type: string): string;
  types?: readonly string[];
}

/**
 * Extrai a URL de asset de um drop. Prioriza {@link ASSET_DRAG_MIME}; aceita
 * `text/plain` `.glb`/`.gltf` se for caminho relativo (URL servível) OU absoluto
 * com um segmento `assets/` — o drag da árvore da IDE (e do Explorer) carrega o
 * caminho absoluto; como o Vite serve a raiz do projeto, recortar do `assets/`
 * em diante devolve a URL certa. Absoluto SEM `assets/` não é servível → null.
 */
export function assetUrlFromDataTransfer(dt: DataTransferLike | null): string | null {
  if (!dt) return null;
  const own = dt.getData(ASSET_DRAG_MIME).trim();
  if (own) return own;
  const plain = dt.getData('text/plain').trim().replace(/\\/g, '/');
  if (!/\.(glb|gltf)$/i.test(plain)) return null;
  if (/^([a-zA-Z]:\/|\/\/|\/)/.test(plain)) {
    const i = plain.lastIndexOf('/assets/');
    return i >= 0 ? plain.slice(i + 1) : null;
  }
  return plain;
}

/**
 * `true` se o drag em andamento PODE carregar um asset (decide o preventDefault
 * do dragover — os dados só são legíveis no drop). Aceita o MIME próprio e
 * `text/plain` (drag da árvore da IDE); o drop valida de verdade.
 */
export function isAssetDrag(types: readonly string[] | undefined): boolean {
  return !!types && (types.includes(ASSET_DRAG_MIME) || types.includes('text/plain'));
}

/** Converte coords de clique (client) na NDC do canvas. */
export function ndcFromClient(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): [number, number] {
  return [
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  ];
}

const _ray = new Raycaster();
const _ndc = new Vector2();
const _groundPlane = new Plane(new Vector3(0, 1, 0), 0);
const _hit = new Vector3();
const _forward = new Vector3();

/**
 * Ponto-mundo onde o asset solto deve nascer: **1)** primeiro hit do raycast da
 * câmera do editor através do ponto do mouse contra `roots` (pousa NA geometria —
 * plataforma, terreno, mesa…), ignorando objetos reprovados por `pickable`;
 * **2)** senão, interseção com o plano do chão (y=0); **3)** senão (olhando pro
 * céu), 12 unidades à frente da câmera com y clampado em 0.
 */
export function worldDropPoint(
  camera: Camera,
  ndcX: number,
  ndcY: number,
  roots: Object3D[],
  pickable: (hit: Intersection) => boolean = () => true,
): Vector3 {
  _ndc.set(ndcX, ndcY);
  _ray.setFromCamera(_ndc, camera);
  const hits = _ray.intersectObjects(roots, true);
  for (const h of hits) {
    if (pickable(h)) return h.point.clone();
  }
  if (_ray.ray.intersectPlane(_groundPlane, _hit)) return _hit.clone();
  camera.getWorldDirection(_forward);
  const p = new Vector3().copy(camera.position).addScaledVector(_forward, 12);
  p.y = Math.max(p.y, 0);
  return p;
}

/**
 * `true` se o hit pertence a chrome do editor (gizmo, helpers, anel de pincel…)
 * — qualquer ancestral com `userData.editorInternal` — e deve ser ignorado no
 * raycast do drop.
 */
export function isEditorInternalHit(hit: Intersection): boolean {
  let o: Object3D | null = hit.object;
  while (o) {
    if ((o.userData as Record<string, unknown>)['editorInternal']) return true;
    o = o.parent;
  }
  return false;
}
