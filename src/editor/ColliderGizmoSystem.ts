import {
  Mesh,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  DoubleSide,
  Group,
  type Object3D,
} from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { Collider2DComponent, type ColliderShape2D } from '../components/Collider2DComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import type { EditorState } from './EditorState.js';

// Cores do contorno por tipo de collider (RGB hex). **Azul = sólido** (chão/parede
// — o caso comum, alto contraste contra cenários verdes), âmbar = one-way
// (atravessável por baixo), ciano = não-sólido (player/gatilho).
const COLOR_SOLID = 0x2a9dff;
const COLOR_ONEWAY = 0xf5a623;
const COLOR_TRIGGER = 0x28e0e0;
const COLOR_TERRAIN = 0x5ad17a; // heightfield (perfil de chão)

function colorFor(col: Collider2DComponent): number {
  if (col.shape === 'heightfield') return COLOR_TERRAIN;
  if (col.oneWay) return COLOR_ONEWAY;
  if (!col.solid) return COLOR_TRIGGER;
  return COLOR_SOLID;
}

/** Espessura da borda do frame, proporcional ao collider (visível em qq escala). */
function borderThickness(hw: number, hh: number): number {
  return Math.min(Math.max(Math.min(hw, hh) * 0.08, 0.03), 0.25);
}

interface Gizmo {
  mesh: Mesh;
  hw: number;
  hh: number;
  shape: ColliderShape2D;
  /** Nº de pontos do heightfield — pra rebuildar a poli-linha ao desenhar. */
  nPoints: number;
}

/**
 * Desenha o **contorno (AABB) de cada `Collider2DComponent`** como um **frame
 * retangular** no plano XY — visível só no **modo editor** (F2). Mostra a hitbox
 * REAL usada pela física (`Transform + offset`, as meias-extensões do componente,
 * **não** a escala do mesh), então dá pra ver o formato do collider e se ele
 * casa ou não com o mesh.
 *
 * É um **mesh** (não linha): renderiza de forma robusta no WebGPU e tem espessura
 * de borda controlável (linhas finas somem em cenário cheio). Cores: azul =
 * sólido, âmbar = one-way, ciano = não-sólido. Ignora profundidade
 * (`depthTest: false`) + `renderOrder` alto → aparece por cima da geometria. Vive
 * só no bundle de dev; registrado pelo `attachEditor`.
 */
export class ColliderGizmoSystem extends System {
  static override requiredComponents = [Collider2DComponent, TransformComponent];
  // Depois da física/sync (priority baixa deles), pra ler a posição já atualizada.
  override priority = 200;

  private readonly group = new Group();
  private readonly gizmos = new Map<Entity, Gizmo>();

  constructor(
    private readonly state: EditorState,
    parent: Object3D,
  ) {
    super();
    this.group.name = '__editor_collider_gizmos';
    parent.add(this.group);
  }

  override update(entities: Entity[]): void {
    const active = this.state.active;
    this.group.visible = active;
    if (!active) return;

    const seen = new Set<Entity>();
    for (const e of entities) {
      seen.add(e);
      const col = e.getComponent(Collider2DComponent)!;
      let g = this.gizmos.get(e);
      if (!g) {
        g = this.makeGizmo(col);
        this.gizmos.set(e, g);
        this.group.add(g.mesh);
      } else if (
        g.hw !== col.halfWidth ||
        g.hh !== col.halfHeight ||
        g.shape !== col.shape ||
        g.nPoints !== (col.points?.length ?? 0)
      ) {
        // Tamanho/forma/pontos mudaram — reconstrói a geometria do frame.
        this.setShape(g, col);
      }

      // Centro do collider = Transform + offset (é o que a física usa). Vale pro
      // collider acoplado E pro desacoplado; o offset deixa o frame na sub-região
      // real (deck/pivô), não no centro do objeto.
      const t = e.getComponent(TransformComponent)!;
      g.mesh.position.set(t.x + col.offsetX, t.y + col.offsetY, t.z);

      (g.mesh.material as MeshBasicMaterial).color.setHex(colorFor(col));
    }

    // Remove gizmos de entidades que sumiram (delete no editor, etc.).
    for (const [e, g] of this.gizmos) {
      if (seen.has(e)) continue;
      this.group.remove(g.mesh);
      g.mesh.geometry.dispose();
      (g.mesh.material as MeshBasicMaterial).dispose();
      this.gizmos.delete(e);
    }
  }

  private makeGizmo(col: Collider2DComponent): Gizmo {
    const material = new MeshBasicMaterial({
      color: colorFor(col),
      depthTest: false,
      transparent: true,
      opacity: 0.95,
      side: DoubleSide,
    });
    const mesh = new Mesh(new BufferGeometry(), material);
    mesh.renderOrder = 999; // por cima da cena
    const g: Gizmo = { mesh, hw: 0, hh: 0, shape: 'box', nPoints: 0 };
    this.setShape(g, col);
    return g;
  }

  /** (Re)constrói a geometria do frame conforme a forma do collider. */
  private setShape(g: Gizmo, col: Collider2DComponent): void {
    const { shape, halfWidth: hw, halfHeight: hh } = col;
    if (shape === 'heightfield') this.setPolyline(g, col.points ?? []);
    else if (shape === 'box') this.setBoxFrame(g, hw, hh);
    else this.setRingFrame(g, outlineOf(shape, hw, hh));
    g.mesh.geometry.computeBoundingSphere();
    g.hw = hw;
    g.hh = hh;
    g.shape = shape;
    g.nPoints = col.points?.length ?? 0;
  }

  /**
   * Faixa fina seguindo a poli-linha do heightfield + **um quadradinho (handle)
   * em cada ponto**, pra ver/agarrar os vértices (arrastar no modo de edição).
   */
  private setPolyline(g: Gizmo, points: readonly (readonly [number, number])[]): void {
    const t = 0.05; // meia-espessura da faixa
    const hs = 0.1; // meio-lado do handle
    const verts: number[] = [];
    const idx: number[] = [];
    // Faixa (ribbon) entre pontos consecutivos.
    for (const p of points) {
      verts.push(p[0], p[1] + t, 0); // topo
      verts.push(p[0], p[1] - t, 0); // base
    }
    for (let i = 0; i < points.length - 1; i++) {
      const a = 2 * i;
      const b = 2 * i + 1;
      const c = 2 * (i + 1);
      const d = 2 * (i + 1) + 1;
      idx.push(a, b, d, a, d, c);
    }
    // Handles: um quadrado por ponto (4 verts, 2 tris), após os verts da faixa.
    for (const p of points) {
      const base = verts.length / 3;
      verts.push(p[0] - hs, p[1] - hs, 0, p[0] + hs, p[1] - hs, 0, p[0] + hs, p[1] + hs, 0, p[0] - hs, p[1] + hs, 0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    g.mesh.geometry.setIndex(idx.length ? idx : [0, 0, 0]);
    g.mesh.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(verts.length ? verts : [0, 0, 0], 3),
    );
  }

  /** Frame retangular: anel entre o retângulo externo (hw,hh) e o interno. */
  private setBoxFrame(g: Gizmo, hw: number, hh: number): void {
    const t = borderThickness(hw, hh);
    const ix = Math.max(hw - t, 0);
    const iy = Math.max(hh - t, 0);
    // prettier-ignore
    const verts = [
      -hw, -hh, 0,   hw, -hh, 0,   hw, hh, 0,   -hw, hh, 0,
      -ix, -iy, 0,   ix, -iy, 0,   ix, iy, 0,   -ix, iy, 0,
    ];
    // prettier-ignore
    const idx = [0,1,5, 0,5,4,  1,2,6, 1,6,5,  2,3,7, 2,7,6,  3,0,4, 3,4,7];
    g.mesh.geometry.setIndex(idx);
    g.mesh.geometry.setAttribute('position', new Float32BufferAttribute(verts, 3));
  }

  /** Frame de anel a partir de um contorno (pontos + normais internas). */
  private setRingFrame(g: Gizmo, o: Outline): void {
    const t = borderThickness(o.hw, o.hh);
    const n = o.x.length;
    const verts: number[] = [];
    for (let i = 0; i < n; i++) {
      verts.push(o.x[i]!, o.y[i]!, 0); // externo
      verts.push(o.x[i]! + o.nx[i]! * t, o.y[i]! + o.ny[i]! * t, 0); // interno
    }
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = 2 * i;
      const b = 2 * i + 1;
      const c = 2 * ((i + 1) % n);
      const d = 2 * ((i + 1) % n) + 1;
      idx.push(a, b, d, a, d, c);
    }
    g.mesh.geometry.setIndex(idx);
    g.mesh.geometry.setAttribute('position', new Float32BufferAttribute(verts, 3));
  }
}

/** Contorno fechado de uma forma: pontos (x,y) + normais internas (nx,ny). */
interface Outline {
  x: number[];
  y: number[];
  nx: number[];
  ny: number[];
  hw: number;
  hh: number;
}

/** Gera o contorno de um círculo ou cápsula vertical (CCW, normais pra dentro). */
function outlineOf(shape: ColliderShape2D, hw: number, hh: number): Outline {
  const x: number[] = [];
  const y: number[] = [];
  const nx: number[] = [];
  const ny: number[] = [];
  const push = (px: number, py: number, inx: number, iny: number): void => {
    x.push(px);
    y.push(py);
    nx.push(inx);
    ny.push(iny);
  };
  const r = hw;
  if (shape === 'circle') {
    const N = 40;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      push(r * c, r * s, -c, -s);
    }
  } else {
    // cápsula vertical: tampa de cima (em +sh) e de baixo (em -sh); os pontos a
    // ±r com normal horizontal formam as laterais retas via o strip do anel.
    const sh = Math.max(hh - r, 0);
    const cap = 16;
    for (let i = 0; i <= cap; i++) {
      const a = (i / cap) * Math.PI; // 0..π (direita→esquerda, por cima)
      const c = Math.cos(a);
      const s = Math.sin(a);
      push(r * c, sh + r * s, -c, -s);
    }
    for (let i = 0; i <= cap; i++) {
      const a = Math.PI + (i / cap) * Math.PI; // π..2π (por baixo)
      const c = Math.cos(a);
      const s = Math.sin(a);
      push(r * c, -sh + r * s, -c, -s);
    }
  }
  return { x, y, nx, ny, hw, hh };
}
