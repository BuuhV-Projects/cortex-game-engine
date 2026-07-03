/**
 * Cobre a lógica pura do arrastar-asset-pra-cena (ADR-0090): extração da URL do
 * DataTransfer (MIME próprio vs text/plain do move-arquivo da IDE), NDC do clique
 * e o ponto-mundo do drop (raycast na geometria → plano do chão → frente da câmera).
 */

import { describe, it, expect } from 'vitest';
import { BoxGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import {
  ASSET_DRAG_MIME,
  assetUrlFromDataTransfer,
  isAssetDrag,
  isEditorInternalHit,
  ndcFromClient,
  worldDropPoint,
  type DataTransferLike,
} from '../../src/editor/assetDrop.js';

const dt = (data: Record<string, string>): DataTransferLike => ({
  getData: (type) => data[type] ?? '',
  types: Object.keys(data),
});

describe('assetUrlFromDataTransfer', () => {
  it('prioriza o MIME próprio', () => {
    const d = dt({ [ASSET_DRAG_MIME]: 'assets/kit/tree_001.glb', 'text/plain': 'D:\\proj\\assets\\kit\\tree_001.glb' });
    expect(assetUrlFromDataTransfer(d)).toBe('assets/kit/tree_001.glb');
  });

  it('aceita text/plain relativo .glb (normaliza \\ → /)', () => {
    expect(assetUrlFromDataTransfer(dt({ 'text/plain': 'assets\\kit\\coin_001.glb' }))).toBe('assets/kit/coin_001.glb');
  });

  it('caminho absoluto com segmento assets/ → recorta a URL relativa', () => {
    expect(assetUrlFromDataTransfer(dt({ 'text/plain': 'D:\\jogos\\teste4\\assets\\kit\\bomb_001.glb' }))).toBe(
      'assets/kit/bomb_001.glb',
    );
    expect(assetUrlFromDataTransfer(dt({ 'text/plain': '/home/x/proj/assets/a.glb' }))).toBe('assets/a.glb');
  });

  it('rejeita caminho absoluto SEM assets/ (não servível)', () => {
    expect(assetUrlFromDataTransfer(dt({ 'text/plain': 'D:\\downloads\\a.glb' }))).toBeNull();
    expect(assetUrlFromDataTransfer(dt({ 'text/plain': '\\\\server\\share\\a.glb' }))).toBeNull();
  });

  it('rejeita não-modelo e DataTransfer nulo', () => {
    expect(assetUrlFromDataTransfer(dt({ 'text/plain': 'assets/foto.png' }))).toBeNull();
    expect(assetUrlFromDataTransfer(null)).toBeNull();
  });
});

describe('isAssetDrag', () => {
  it('aceita o MIME próprio e text/plain (validação real fica pro drop)', () => {
    expect(isAssetDrag([ASSET_DRAG_MIME, 'text/plain'])).toBe(true);
    expect(isAssetDrag(['text/plain'])).toBe(true);
    expect(isAssetDrag(['Files'])).toBe(false);
    expect(isAssetDrag(undefined)).toBe(false);
  });
});

describe('ndcFromClient', () => {
  const rect = { left: 100, top: 50, width: 800, height: 600 };
  it('centro do canvas → (0, 0)', () => {
    const [x, y] = ndcFromClient(500, 350, rect);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });
  it('canto superior-esquerdo → (-1, +1); inferior-direito → (+1, -1)', () => {
    expect(ndcFromClient(100, 50, rect)).toEqual([-1, 1]);
    expect(ndcFromClient(900, 650, rect)).toEqual([1, -1]);
  });
});

describe('worldDropPoint', () => {
  // Câmera olhando pra baixo de (0, 10, 0) — o centro da tela mira a origem.
  const downCam = (): PerspectiveCamera => {
    const cam = new PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 10, 0);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    return cam;
  };

  it('pousa NA geometria sob o cursor (topo da caixa)', () => {
    const box = new Mesh(new BoxGeometry(4, 2, 4)); // topo em y=1
    box.updateMatrixWorld();
    const p = worldDropPoint(downCam(), 0, 0, [box]);
    expect(p.y).toBeCloseTo(1);
  });

  it('sem geometria → plano do chão (y=0)', () => {
    const p = worldDropPoint(downCam(), 0, 0, []);
    expect(p.y).toBeCloseTo(0);
  });

  it('ignora hits reprovados pelo filtro (ex.: chrome do editor)', () => {
    const gizmo = new Mesh(new BoxGeometry(4, 2, 4));
    gizmo.userData['editorInternal'] = true;
    gizmo.updateMatrixWorld();
    const p = worldDropPoint(downCam(), 0, 0, [gizmo], (h) => !isEditorInternalHit(h));
    expect(p.y).toBeCloseTo(0); // caiu pro plano do chão, não no gizmo
  });

  it('olhando pro céu → fallback à frente da câmera com y ≥ 0', () => {
    const cam = new PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 5, 0);
    cam.lookAt(0, 20, -1); // mirando pra cima
    cam.updateMatrixWorld();
    const p = worldDropPoint(cam, 0, 0, []);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.distanceTo(cam.position)).toBeGreaterThan(0);
  });
});

describe('isEditorInternalHit', () => {
  it('detecta a flag em qualquer ancestral', () => {
    const root = new Group();
    root.userData['editorInternal'] = true;
    const child = new Mesh(new BoxGeometry(1, 1, 1));
    root.add(child);
    expect(isEditorInternalHit({ object: child } as never)).toBe(true);
    const solto = new Mesh(new BoxGeometry(1, 1, 1));
    expect(isEditorInternalHit({ object: solto } as never)).toBe(false);
  });
});
