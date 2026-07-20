/**
 * **Malha poligonal editável** (ProBuilder / blockout — SPEC-0071).
 *
 * O dado de uma malha de blockout: **vértices lógicos** (`positions`) + **faces**
 * poligonais (`faces`, índices em `positions`, geralmente quads). É a topologia
 * compartilhada que a edição por vértice/aresta/face manipula — diferente da
 * `BufferGeometry` de render (triangulada, flat-shaded, com vértices duplicados
 * por face pro look facetado de blockout).
 *
 * Tudo aqui é **puro** (não toca o editor/ECS) — só depende de classes de
 * geometria do three. Testável isolado (topologia/normais/extrusão).
 */
import { BufferGeometry, Float32BufferAttribute } from 'three';

/** `[x, y, z]`. */
export type Vec3 = [number, number, number];

/** Uma malha poligonal editável: vértices + faces (cada face = lista ordenada de índices). */
export interface EditableMesh {
  positions: Vec3[];
  /** Cada face é um polígono: índices em `positions`, em ordem (CCW = frente). */
  faces: number[][];
}

/**
 * Mapas que ligam a geometria de **render** (triangulada/flat) de volta à
 * topologia **lógica** — usados pelo editor pra resolver clique → face/vértice.
 */
export interface MeshPickMaps {
  /** Por triângulo de render (índice): a face lógica de origem. */
  triToFace: number[];
  /** Por vértice de render (índice): o vértice lógico de origem. */
  renderVertToVert: number[];
  /** Arestas únicas da malha: pares `[a, b]` de índices lógicos com `a < b`. */
  edges: [number, number][];
}

/** Resultado de {@link toBufferGeometry}: a geometria de render + os mapas de picking. */
export interface RenderMesh {
  geometry: BufferGeometry;
  maps: MeshPickMaps;
}

/** Cópia profunda de uma {@link EditableMesh} (edição não-destrutiva). */
export function cloneMesh(mesh: EditableMesh): EditableMesh {
  return {
    positions: mesh.positions.map((p) => [p[0], p[1], p[2]] as Vec3),
    faces: mesh.faces.map((f) => f.slice()),
  };
}

/** Centróide (média dos vértices) de uma face — útil pra ancorar o gizmo de elemento. */
export function faceCentroid(mesh: EditableMesh, faceIndex: number): Vec3 {
  const face = mesh.faces[faceIndex];
  if (!face || face.length === 0) return [0, 0, 0];
  let x = 0,
    y = 0,
    z = 0;
  for (const i of face) {
    const p = mesh.positions[i]!;
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = face.length;
  return [x / n, y / n, z / n];
}

/**
 * Normal (unitária) de uma face poligonal pelo método de Newell — robusto a
 * faces não-planas e independe de triangulação. Frente = ordem CCW dos vértices.
 */
export function faceNormal(mesh: EditableMesh, faceIndex: number): Vec3 {
  const face = mesh.faces[faceIndex];
  if (!face || face.length < 3) return [0, 1, 0];
  let nx = 0,
    ny = 0,
    nz = 0;
  for (let i = 0; i < face.length; i++) {
    const cur = mesh.positions[face[i]!]!;
    const nxt = mesh.positions[face[(i + 1) % face.length]!]!;
    nx += (cur[1] - nxt[1]) * (cur[2] + nxt[2]);
    ny += (cur[2] - nxt[2]) * (cur[0] + nxt[0]);
    nz += (cur[0] - nxt[0]) * (cur[1] + nxt[1]);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/** Arestas únicas da malha (`[a, b]` com `a < b`), derivadas das faces. */
export function meshEdges(mesh: EditableMesh): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const face of mesh.faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i]!;
      const b = face[(i + 1) % face.length]!;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}_${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([lo, hi]);
    }
  }
  return out;
}

/**
 * Converte a malha lógica numa {@link BufferGeometry} de render **flat-shaded**:
 * fan-triangula cada face (assume face **convexa**) e duplica os vértices por
 * face com a **normal da face** — dá o look facetado certo de blockout. Devolve
 * também os mapas de picking (triângulo→face, vértice de render→vértice lógico).
 */
export function toBufferGeometry(mesh: EditableMesh): RenderMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const triToFace: number[] = [];
  const renderVertToVert: number[] = [];

  for (let f = 0; f < mesh.faces.length; f++) {
    const face = mesh.faces[f]!;
    if (face.length < 3) continue;
    const n = faceNormal(mesh, f);
    // Fan: (0,1,2), (0,2,3), … — válido pra polígono convexo.
    for (let t = 1; t < face.length - 1; t++) {
      const tri = [face[0]!, face[t]!, face[t + 1]!];
      for (const vi of tri) {
        const p = mesh.positions[vi]!;
        positions.push(p[0], p[1], p[2]);
        normals.push(n[0], n[1], n[2]);
        renderVertToVert.push(vi);
      }
      triToFace.push(f);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { geometry, maps: { triToFace, renderVertToVert, edges: meshEdges(mesh) } };
}

/** Elemento selecionado na edição de malha (vértice/aresta/face — SPEC-0071). */
export type MeshElement =
  | { mode: 'vertex'; index: number }
  | { mode: 'edge'; a: number; b: number }
  | { mode: 'face'; faceIndex: number };

/** Índices dos vértices lógicos que um elemento move (vértice=1, aresta=2, face=N). */
export function verticesOfElement(mesh: EditableMesh, el: MeshElement): number[] {
  if (el.mode === 'vertex') return [el.index];
  if (el.mode === 'edge') return [el.a, el.b];
  return (mesh.faces[el.faceIndex] ?? []).slice();
}

/** Centróide (média) de um conjunto de vértices lógicos. */
export function centroidOf(mesh: EditableMesh, indices: number[]): Vec3 {
  if (indices.length === 0) return [0, 0, 0];
  let x = 0,
    y = 0,
    z = 0;
  for (const i of indices) {
    const p = mesh.positions[i]!;
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = indices.length;
  return [x / n, y / n, z / n];
}

/**
 * Move os vértices `indices` por `delta` (não-destrutivo) — base do "mover
 * elemento" do gizmo. Use a malha-base capturada no início do drag + o delta
 * acumulado pra evitar deriva.
 */
export function translateVertices(mesh: EditableMesh, indices: number[], delta: Vec3): EditableMesh {
  const out = cloneMesh(mesh);
  const set = new Set(indices);
  for (const i of set) {
    const p = out.positions[i];
    if (!p) continue;
    out.positions[i] = [p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]];
  }
  return out;
}

/**
 * **Extruda uma face** ao longo da sua normal por `distance` (op-chave de
 * blockout). Cria vértices novos (a face deslocada) + paredes laterais ligando o
 * anel antigo ao novo; a face original passa a apontar pros vértices novos.
 * Retorna uma malha nova (não-destrutivo) e o índice da face extrudada (a mesma
 * posição `faceIndex`, agora no topo). Convém entrar em "mover" logo depois.
 */
export function extrudeFace(
  mesh: EditableMesh,
  faceIndex: number,
  distance: number,
): { mesh: EditableMesh; faceIndex: number } {
  const src = cloneMesh(mesh);
  const face = src.faces[faceIndex];
  if (!face || face.length < 3) return { mesh: src, faceIndex };

  const n = faceNormal(src, faceIndex);
  const base = src.positions.length;
  // Vértices novos = anel da face deslocado pela normal.
  const newRing: number[] = [];
  for (const vi of face) {
    const p = src.positions[vi]!;
    src.positions.push([p[0] + n[0] * distance, p[1] + n[1] * distance, p[2] + n[2] * distance]);
    newRing.push(base + (newRing.length));
  }
  // Paredes laterais (quads) ligando aresta antiga → nova, CCW pra fora.
  for (let i = 0; i < face.length; i++) {
    const a = face[i]!;
    const b = face[(i + 1) % face.length]!;
    const an = newRing[i]!;
    const bn = newRing[(i + 1) % face.length]!;
    src.faces.push([a, b, bn, an]);
  }
  // A face original vira a "tampa" usando os vértices novos.
  src.faces[faceIndex] = newRing;
  return { mesh: src, faceIndex };
}
