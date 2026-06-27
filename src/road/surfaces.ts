/**
 * **Catálogo de superfícies de pista** (ADR-0072). Mapeia um nome amigável
 * (`asphalt`/`concrete`/…) → texturas diffuse/normal (do Road Architect, MIT) e o
 * tile ao longo do comprimento. As texturas são **assets do projeto**
 * (`assets/roads/…`) — o nó `road` referencia por nome ou por URLs explícitas.
 */

/** Diretório padrão das texturas de estrada dentro do projeto. */
export const ROAD_TEXTURE_DIR = 'assets/roads/';

/** Superfície resolvida: caminhos das texturas + cor de fallback + tile. */
export interface RoadSurfaceDef {
  /** Cor base (hex number ou string — three aceita ambos). Usada sem textura. */
  color: number | string;
  /** Caminho do diffuse (relativo ao projeto), ou `undefined` p/ cor sólida. */
  diffuse?: string;
  /** Caminho do normal map (opcional). */
  normal?: string;
  /** Unidades de mundo por tile no comprimento (default 8 m). */
  repeat: number;
}

/** Nomes de superfície embutidos. */
export type RoadSurfaceName = 'asphalt' | 'concrete' | 'dirt' | 'brick' | 'cobblestone';

const tex = (name: string): string => `${ROAD_TEXTURE_DIR}${name}`;

/** Catálogo embutido (texturas do Road Architect — MIT MicroGSD). */
export const ROAD_SURFACES: Record<RoadSurfaceName, RoadSurfaceDef> = {
  asphalt: { color: 0x3a3d42, diffuse: tex('Road1Diffuse.png'), normal: tex('Road1Normal.png'), repeat: 8 },
  concrete: { color: 0x9a9a93, diffuse: tex('Concrete1Diffuse.png'), normal: tex('Concrete1Normal.png'), repeat: 8 },
  dirt: { color: 0x6e5a42, diffuse: tex('DirtRoadDiffuse.png'), normal: tex('DirtRoadNormal.png'), repeat: 6 },
  brick: { color: 0x8a4a3a, diffuse: tex('BrickRoadDiffuse.png'), normal: tex('BrickRoadNormal.png'), repeat: 4 },
  cobblestone: { color: 0x6f6f6f, diffuse: tex('CobblestoneRoadDiffuse.png'), normal: tex('CobblestoneRoadNormal.png'), repeat: 4 },
};

/** Config de superfície aceita no nó `road`: nome embutido OU URLs explícitas. */
export type RoadSurface =
  | RoadSurfaceName
  | { color?: number | string; diffuse?: string; normal?: string; repeat?: number };

/** Resolve a {@link RoadSurface} do nó numa {@link RoadSurfaceDef} concreta. */
export function resolveSurface(surface: RoadSurface | undefined): RoadSurfaceDef {
  if (surface === undefined) return ROAD_SURFACES.asphalt;
  if (typeof surface === 'string') return ROAD_SURFACES[surface] ?? ROAD_SURFACES.asphalt;
  return {
    color: surface.color ?? 0x3a3d42,
    diffuse: surface.diffuse,
    normal: surface.normal,
    repeat: surface.repeat ?? 8,
  };
}

// ── Marcação de pista (overlay — ADR-0076) ──────────────────────────────────────

/** Diretório das texturas de marcação (overlays RGBA do Road Architect). */
export const ROAD_MARKINGS_DIR = `${ROAD_TEXTURE_DIR}Markers/`;

/** Marcação resolvida: textura overlay (transparente) + tile no comprimento. */
export interface RoadMarkingDef {
  /** Caminho do overlay RGBA (linhas opacas sobre fundo transparente). */
  url: string;
  /** Unidades de mundo por tile no comprimento (ciclo do tracejado). */
  repeat: number;
}

/** Nomes de marcação embutidos (layout de 2 faixas — o padrão do nó `road`). */
export type RoadMarkingName = 'dashed' | 'single-yellow' | 'double-yellow' | 'passing' | 'lane';

const mk = (name: string): string => `${ROAD_MARKINGS_DIR}${name}`;

/**
 * Catálogo de marcações (texturas `Markers/` do Road Architect — MIT MicroGSD). São
 * **overlays RGBA** desenhados pra atravessar a largura (U 0..1) com as linhas já na
 * posição certa de uma pista de 2 faixas; tilam ao longo do comprimento (V).
 */
export const ROAD_MARKINGS: Record<RoadMarkingName, RoadMarkingDef> = {
  dashed: { url: mk('WhiteSingleDotted_Diffuse.png'), repeat: 12 }, // eixo tracejado branco
  'single-yellow': { url: mk('WhiteYellowSingle_Diffuse.png'), repeat: 12 }, // eixo amarelo + bordas
  'double-yellow': { url: mk('WhiteYellowDouble_Diffuse.png'), repeat: 12 }, // eixo amarelo duplo
  passing: { url: mk('WhiteYellowPassBoth_Diffuse.png'), repeat: 12 }, // zona de ultrapassagem
  lane: { url: mk('OneLane-BothWhite.png'), repeat: 12 }, // faixa única, bordas brancas
};

/** Config de marcação aceita no nó `road`: nome embutido OU URL explícita. */
export type RoadMarking = RoadMarkingName | { url: string; repeat?: number };

/** Resolve a {@link RoadMarking} do nó numa {@link RoadMarkingDef}, ou `null` (sem marcação). */
export function resolveMarking(marking: RoadMarking | undefined): RoadMarkingDef | null {
  if (marking === undefined) return null;
  if (typeof marking === 'string') return ROAD_MARKINGS[marking] ?? null;
  return { url: marking.url, repeat: marking.repeat ?? 12 };
}
