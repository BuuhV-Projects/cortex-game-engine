/**
 * **Biblioteca de formas de blockout** (ProBuilder — ADR-0071).
 *
 * Funções **puras** `params → {@link EditableMesh}` (vértices + faces poligonais,
 * em quads quando dá pra editar/extrudar limpo). Sem three, sem editor — só dado,
 * testável isolado. Cada forma também declara seus **parâmetros** ({@link ShapeDef})
 * pra o Inspector renderizar os campos genericamente e regenerar.
 *
 * Básicas: cubo, plano, cilindro, esfera, cone. Arquitetura: escada, rampa, arco,
 * parede com vão (porta/janela).
 */
import type { EditableMesh, Vec3 } from './EditableMesh.js';

/** Tipos de forma disponíveis na paleta de blockout. */
export type ShapeKind =
  | 'cube'
  | 'plane'
  | 'cylinder'
  | 'sphere'
  | 'cone'
  | 'stairs'
  | 'ramp'
  | 'arch'
  | 'wallOpening';

/** Metadados de um parâmetro de forma (pro Inspector montar o campo numérico). */
export interface ShapeParamDef {
  key: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
  /** Inteiro (ex.: nº de degraus/lados) — o Inspector arredonda. */
  int?: boolean;
}

/** Descreve uma forma: rótulo, parâmetros e o builder. */
export interface ShapeDef {
  kind: ShapeKind;
  label: string;
  params: ShapeParamDef[];
  build(p: Record<string, number>): EditableMesh;
}

// ─── Helpers de composição ─────────────────────────────────────────────────────

/** Box (caixa) por cantos mín/máx, 6 faces quad CCW pra fora. */
export function boxMesh(min: Vec3, max: Vec3): EditableMesh {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const positions: Vec3[] = [
    [x0, y0, z0], // 0
    [x1, y0, z0], // 1
    [x1, y1, z0], // 2
    [x0, y1, z0], // 3
    [x0, y0, z1], // 4
    [x1, y0, z1], // 5
    [x1, y1, z1], // 6
    [x0, y1, z1], // 7
  ];
  const faces: number[][] = [
    [4, 5, 6, 7], // +Z
    [1, 0, 3, 2], // -Z
    [5, 1, 2, 6], // +X
    [0, 4, 7, 3], // -X
    [7, 6, 2, 3], // +Y
    [0, 1, 5, 4], // -Y
  ];
  return { positions, faces };
}

/** Concatena malhas reindexando as faces (offset por nº de vértices acumulado). */
export function mergeMeshes(...meshes: EditableMesh[]): EditableMesh {
  const positions: Vec3[] = [];
  const faces: number[][] = [];
  for (const m of meshes) {
    const off = positions.length;
    for (const p of m.positions) positions.push([p[0], p[1], p[2]]);
    for (const f of m.faces) faces.push(f.map((i) => i + off));
  }
  return { positions, faces };
}

// ─── Builders ───────────────────────────────────────────────────────────────────

function cube(p: Record<string, number>): EditableMesh {
  const w = p.width ?? 1,
    h = p.height ?? 1,
    d = p.depth ?? 1;
  return boxMesh([-w / 2, -h / 2, -d / 2], [w / 2, h / 2, d / 2]);
}

/** Plano horizontal (quad no XZ, centrado, y=0). */
function plane(p: Record<string, number>): EditableMesh {
  const w = (p.width ?? 1) / 2,
    d = (p.depth ?? 1) / 2;
  return {
    positions: [
      [-w, 0, d],
      [w, 0, d],
      [w, 0, -d],
      [-w, 0, -d],
    ],
    faces: [[0, 1, 2, 3]],
  };
}

function cylinder(p: Record<string, number>): EditableMesh {
  const r = (p.radius ?? 0.5),
    h = p.height ?? 1,
    sides = Math.max(3, Math.round(p.sides ?? 16));
  const positions: Vec3[] = [];
  const top: number[] = [];
  const bottom: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    bottom.push(positions.push([x, -h / 2, z]) - 1);
    top.push(positions.push([x, h / 2, z]) - 1);
  }
  const faces: number[][] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push([bottom[i]!, bottom[j]!, top[j]!, top[i]!]); // lateral
  }
  faces.push(top.slice()); // tampa +Y (CCW vista de cima)
  faces.push(bottom.slice().reverse()); // tampa -Y
  return { positions, faces };
}

function cone(p: Record<string, number>): EditableMesh {
  const r = p.radius ?? 0.5,
    h = p.height ?? 1,
    sides = Math.max(3, Math.round(p.sides ?? 16));
  const positions: Vec3[] = [];
  const ring: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    ring.push(positions.push([Math.cos(a) * r, -h / 2, Math.sin(a) * r]) - 1);
  }
  const apex = positions.push([0, h / 2, 0]) - 1;
  const faces: number[][] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push([ring[i]!, ring[j]!, apex]); // triângulo lateral
  }
  faces.push(ring.slice().reverse()); // base
  return { positions, faces };
}

function sphere(p: Record<string, number>): EditableMesh {
  const r = p.radius ?? 0.5,
    rings = Math.max(2, Math.round(p.rings ?? 8)),
    seg = Math.max(3, Math.round(p.segments ?? 12));
  const positions: Vec3[] = [];
  const grid: number[][] = [];
  for (let y = 0; y <= rings; y++) {
    const phi = (y / rings) * Math.PI; // 0..PI
    const row: number[] = [];
    for (let x = 0; x <= seg; x++) {
      const theta = (x / seg) * Math.PI * 2;
      const px = r * Math.sin(phi) * Math.cos(theta);
      const py = r * Math.cos(phi);
      const pz = r * Math.sin(phi) * Math.sin(theta);
      row.push(positions.push([px, py, pz]) - 1);
    }
    grid.push(row);
  }
  const faces: number[][] = [];
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < seg; x++) {
      const a = grid[y]![x]!;
      const b = grid[y]![x + 1]!;
      const c = grid[y + 1]![x + 1]!;
      const d = grid[y + 1]![x]!;
      if (y === 0) faces.push([a, c, d]); // polo norte (triângulos)
      else if (y === rings - 1) faces.push([a, b, d]); // polo sul
      else faces.push([a, b, c, d]);
    }
  }
  return { positions, faces };
}

function stairs(p: Record<string, number>): EditableMesh {
  const w = p.width ?? 2,
    h = p.height ?? 2,
    d = p.depth ?? 3,
    steps = Math.max(1, Math.round(p.steps ?? 6));
  const stepH = h / steps,
    stepD = d / steps;
  const boxes: EditableMesh[] = [];
  for (let i = 0; i < steps; i++) {
    // Cada degrau é sólido até o chão (degrau preenchido — bom pra colisão de blockout).
    const z0 = -d / 2 + i * stepD;
    boxes.push(boxMesh([-w / 2, -h / 2, z0], [w / 2, -h / 2 + (i + 1) * stepH, z0 + stepD]));
  }
  return mergeMeshes(...boxes);
}

/** Rampa = cunha (prisma triangular): sobe de z- pra z+. */
function ramp(p: Record<string, number>): EditableMesh {
  const w = (p.width ?? 2) / 2,
    h = p.height ?? 1,
    d = (p.depth ?? 3) / 2;
  const positions: Vec3[] = [
    [-w, -h / 2, -d], // 0 base tras esq
    [w, -h / 2, -d], // 1 base tras dir
    [w, -h / 2, d], // 2 base frente dir
    [-w, -h / 2, d], // 3 base frente esq
    [-w, h / 2, d], // 4 topo frente esq
    [w, h / 2, d], // 5 topo frente dir
  ];
  const faces: number[][] = [
    [0, 1, 2, 3], // base (-Y)
    [3, 2, 5, 4], // frente vertical (+Z)
    [0, 4, 5, 1], // rampa inclinada (topo)
    [0, 3, 4], // lado esquerdo (-X)
    [1, 5, 2], // lado direito (+X)
  ];
  return { positions, faces };
}

/** Arco (ponte/vão): blocos (aduelas) ao longo de um semicírculo. */
function arch(p: Record<string, number>): EditableMesh {
  const span = p.width ?? 4,
    depth = p.depth ?? 1,
    thickness = p.thickness ?? 0.6,
    segs = Math.max(3, Math.round(p.segments ?? 8));
  const rOuter = span / 2 + thickness;
  const rInner = span / 2;
  const boxes: EditableMesh[] = [];
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI * (i / segs);
    const a1 = Math.PI * ((i + 1) / segs);
    // Aduela como quad extrudado em Z, entre raio interno e externo.
    const ix0 = Math.cos(a0) * rInner,
      iy0 = Math.sin(a0) * rInner;
    const ox0 = Math.cos(a0) * rOuter,
      oy0 = Math.sin(a0) * rOuter;
    const ix1 = Math.cos(a1) * rInner,
      iy1 = Math.sin(a1) * rInner;
    const ox1 = Math.cos(a1) * rOuter,
      oy1 = Math.sin(a1) * rOuter;
    const z = depth / 2;
    const positions: Vec3[] = [
      [ix0, iy0, -z],
      [ox0, oy0, -z],
      [ox1, oy1, -z],
      [ix1, iy1, -z],
      [ix0, iy0, z],
      [ox0, oy0, z],
      [ox1, oy1, z],
      [ix1, iy1, z],
    ];
    const faces: number[][] = [
      [4, 5, 6, 7], // +Z
      [1, 0, 3, 2], // -Z
      [0, 1, 5, 4], // face de baixo (radial a0)
      [2, 3, 7, 6], // face de cima (radial a1)
      [1, 2, 6, 5], // externa
      [3, 0, 4, 7], // interna
    ];
    boxes.push({ positions, faces });
  }
  return mergeMeshes(...boxes);
}

/** Parede com vão retangular (porta/janela): montantes + verga + (peitoril). */
function wallOpening(p: Record<string, number>): EditableMesh {
  const w = p.width ?? 4,
    h = p.height ?? 3,
    d = p.depth ?? 0.4,
    ow = Math.min(p.openingWidth ?? 1.2, w - 0.1),
    oh = Math.min(p.openingHeight ?? 2, h - 0.05),
    sill = Math.max(0, p.sill ?? 0);
  const hw = w / 2,
    hd = d / 2,
    ohw = ow / 2;
  const top = -h / 2 + sill + oh; // topo do vão
  const boxes: EditableMesh[] = [];
  // Montante esquerdo
  boxes.push(boxMesh([-hw, -h / 2, -hd], [-ohw, h / 2, hd]));
  // Montante direito
  boxes.push(boxMesh([ohw, -h / 2, -hd], [hw, h / 2, hd]));
  // Verga (acima do vão)
  boxes.push(boxMesh([-ohw, top, -hd], [ohw, h / 2, hd]));
  // Peitoril (abaixo do vão), se houver
  if (sill > 0) boxes.push(boxMesh([-ohw, -h / 2, -hd], [ohw, -h / 2 + sill, hd]));
  return mergeMeshes(...boxes);
}

// ─── Registro ────────────────────────────────────────────────────────────────────

/** Catálogo de formas: rótulo + parâmetros + builder. Fonte da paleta e do Inspector. */
export const SHAPES: Record<ShapeKind, ShapeDef> = {
  cube: {
    kind: 'cube',
    label: 'Cubo',
    params: [
      { key: 'width', label: 'Largura', default: 1, min: 0.01 },
      { key: 'height', label: 'Altura', default: 1, min: 0.01 },
      { key: 'depth', label: 'Profundidade', default: 1, min: 0.01 },
    ],
    build: cube,
  },
  plane: {
    kind: 'plane',
    label: 'Plano',
    params: [
      { key: 'width', label: 'Largura', default: 4, min: 0.01 },
      { key: 'depth', label: 'Profundidade', default: 4, min: 0.01 },
    ],
    build: plane,
  },
  cylinder: {
    kind: 'cylinder',
    label: 'Cilindro',
    params: [
      { key: 'radius', label: 'Raio', default: 0.5, min: 0.01 },
      { key: 'height', label: 'Altura', default: 1, min: 0.01 },
      { key: 'sides', label: 'Lados', default: 16, min: 3, step: 1, int: true },
    ],
    build: cylinder,
  },
  sphere: {
    kind: 'sphere',
    label: 'Esfera',
    params: [
      { key: 'radius', label: 'Raio', default: 0.5, min: 0.01 },
      { key: 'rings', label: 'Anéis', default: 8, min: 2, step: 1, int: true },
      { key: 'segments', label: 'Segmentos', default: 12, min: 3, step: 1, int: true },
    ],
    build: sphere,
  },
  cone: {
    kind: 'cone',
    label: 'Cone',
    params: [
      { key: 'radius', label: 'Raio', default: 0.5, min: 0.01 },
      { key: 'height', label: 'Altura', default: 1, min: 0.01 },
      { key: 'sides', label: 'Lados', default: 16, min: 3, step: 1, int: true },
    ],
    build: cone,
  },
  stairs: {
    kind: 'stairs',
    label: 'Escada',
    params: [
      { key: 'width', label: 'Largura', default: 2, min: 0.01 },
      { key: 'height', label: 'Altura', default: 2, min: 0.01 },
      { key: 'depth', label: 'Profundidade', default: 3, min: 0.01 },
      { key: 'steps', label: 'Degraus', default: 6, min: 1, step: 1, int: true },
    ],
    build: stairs,
  },
  ramp: {
    kind: 'ramp',
    label: 'Rampa',
    params: [
      { key: 'width', label: 'Largura', default: 2, min: 0.01 },
      { key: 'height', label: 'Altura', default: 1, min: 0.01 },
      { key: 'depth', label: 'Profundidade', default: 3, min: 0.01 },
    ],
    build: ramp,
  },
  arch: {
    kind: 'arch',
    label: 'Arco',
    params: [
      { key: 'width', label: 'Vão', default: 4, min: 0.01 },
      { key: 'thickness', label: 'Espessura', default: 0.6, min: 0.01 },
      { key: 'depth', label: 'Profundidade', default: 1, min: 0.01 },
      { key: 'segments', label: 'Aduelas', default: 8, min: 3, step: 1, int: true },
    ],
    build: arch,
  },
  wallOpening: {
    kind: 'wallOpening',
    label: 'Parede c/ vão',
    params: [
      { key: 'width', label: 'Largura', default: 4, min: 0.01 },
      { key: 'height', label: 'Altura', default: 3, min: 0.01 },
      { key: 'depth', label: 'Espessura', default: 0.4, min: 0.01 },
      { key: 'openingWidth', label: 'Vão larg.', default: 1.2, min: 0.01 },
      { key: 'openingHeight', label: 'Vão alt.', default: 2, min: 0.01 },
      { key: 'sill', label: 'Peitoril', default: 0, min: 0 },
    ],
    build: wallOpening,
  },
};

/** Parâmetros default de uma forma (`{ [key]: default }`). */
export function defaultShapeParams(kind: ShapeKind): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pd of SHAPES[kind].params) out[pd.key] = pd.default;
  return out;
}

/** Gera a {@link EditableMesh} de uma forma. Params ausentes caem no default. */
export function buildShape(kind: ShapeKind, params?: Record<string, number>): EditableMesh {
  const def = SHAPES[kind];
  return def.build({ ...defaultShapeParams(kind), ...(params ?? {}) });
}
