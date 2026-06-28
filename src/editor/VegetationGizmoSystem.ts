import {
  LineSegments,
  LineBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Box3,
  Vector3,
  Euler,
  Quaternion,
  Matrix4,
  type Object3D,
} from 'three';
import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { EditorState } from './EditorState.js';
import type { Vegetation } from '../scene/Vegetation.js';

/** Verde (mesma cor dos outros gizmos de seleção do editor). */
const COLOR = 0x46d160;
/** 8 cantos de uma caixa (bit: x, y, z = 0=min/1=max) e as 12 arestas. */
const CORNERS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
  [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1],
];
const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7],
];

const _box = new Box3();
const _e = new Euler();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _inst = new Matrix4();
const _m = new Matrix4();
const _corners = Array.from({ length: 8 }, () => new Vector3());

/**
 * Desenha o **contorno (caixa de linhas) das instâncias de vegetação** selecionadas —
 * UMA árvore (seleção individual por clique) ou TODAS (grupo selecionado). Como a
 * vegetação é `InstancedMesh` (instâncias não são objetos da cena), este gizmo dá o
 * feedback visual da seleção por instância (ADR-0077, fase 3). Visível só no editor
 * (F2); puramente visual (`raycast` off, `editorInternal`). Bundle de dev.
 */
export class VegetationGizmoSystem extends System {
  static override requiredComponents = [];
  override priority = 201;

  private readonly group = new Group();
  private readonly mesh: LineSegments;
  /** Seleção atual; `index < 0` = grupo inteiro. */
  private sel: { veg: Vegetation; obj: Object3D; index: number } | null = null;
  private dirty = false;

  constructor(
    private readonly state: EditorState,
    parent: Object3D,
  ) {
    super();
    this.group.name = '__editor_vegetation_gizmos';
    this.group.userData['editorInternal'] = true;
    const mat = new LineBasicMaterial({ color: COLOR, depthTest: false, transparent: true, opacity: 0.9 });
    this.mesh = new LineSegments(new BufferGeometry(), mat);
    this.mesh.renderOrder = 998;
    this.mesh.raycast = () => {};
    this.mesh.userData['editorInternal'] = true;
    this.group.add(this.mesh);
    parent.add(this.group);
  }

  /** Marca UMA árvore (`index >= 0`) ou o GRUPO inteiro (`index < 0`). */
  show(veg: Vegetation, obj: Object3D, index: number): void {
    this.sel = { veg, obj, index };
    this.dirty = true;
  }

  /** Limpa o gizmo (nada selecionado / outra coisa selecionada). */
  hide(): void {
    if (this.sel) {
      this.sel = null;
      this.dirty = true;
    }
  }

  override update(_entities: Entity[]): void {
    this.group.visible = this.state.active && this.sel !== null;
    if (!this.state.active || !this.sel) return;
    if (this.dirty) {
      this.rebuild();
      this.dirty = false;
    }
  }

  private rebuild(): void {
    const { veg, obj, index } = this.sel!;
    obj.updateWorldMatrix(true, false);
    const box = veg.modelBounds(_box);
    const verts: number[] = [];

    const pushInstance = (i: number): void => {
      const t = veg.instanceAt(i);
      if (!t) return;
      _e.set(0, t.rotY, 0);
      _q.setFromEuler(_e);
      _inst.compose(_p.set(t.x, t.y, t.z), _q, _s.set(t.scale, t.scale, t.scale));
      _m.multiplyMatrices(obj.matrixWorld, _inst); // instância → mundo
      for (let k = 0; k < 8; k++) {
        const b = CORNERS[k]!;
        _corners[k]!
          .set(b[0] ? box.max.x : box.min.x, b[1] ? box.max.y : box.min.y, b[2] ? box.max.z : box.min.z)
          .applyMatrix4(_m);
      }
      for (const [a, c] of EDGES) {
        const pa = _corners[a]!;
        const pc = _corners[c]!;
        verts.push(pa.x, pa.y, pa.z, pc.x, pc.y, pc.z);
      }
    };

    if (index >= 0) pushInstance(index);
    else for (let i = 0; i < veg.count; i++) pushInstance(i);

    this.mesh.geometry.dispose();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(verts.length ? verts : [0, 0, 0], 3));
    this.mesh.geometry = geo;
  }
}
