import { z } from 'zod';

/** Ponto no plano `[x, z]` em metros (top-down). A altura vem do conform do terreno. */
export type Vec2 = [number, number];

const vec2 = z.tuple([z.number(), z.number()]);
const profileName = z.enum([
  'highway', 'arterial', 'urban_primary', 'urban_secondary', 'residential', 'industrial', 'dirt', 'pedestrian_market', 'alley',
]);
const surfaceName = z.enum(['asphalt', 'concrete', 'dirt', 'brick', 'cobblestone']);

/** Uma via traçada (sobre o underlay): perfil + pontos de controle da spline. */
export const roadSpecSchema = z.object({
  id: z.string().min(1),
  profile: profileName,
  points: z.array(vec2).min(2),
  surface: surfaceName.optional(),
  elevation: z.union([z.literal('conform'), z.literal('flat'), z.number()]).optional(),
  oneway: z.boolean().optional(),
  speedKmh: z.number().positive().optional(),
  curveDensity: z.number().positive().optional(),
});
export type RoadSpec = z.infer<typeof roadSpecSchema>;

/** Cruzamento DECLARADO (fase 1): onde 2+ vias se encontram. */
export const intersectionSpecSchema = z.object({
  id: z.string().min(1),
  at: vec2,
  roads: z.array(z.string()).min(2),
  kind: z.enum(['cross', 'tee', 'roundabout']),
  radius: z.number().positive().optional(),
});
export type IntersectionSpec = z.infer<typeof intersectionSpecSchema>;

/** Distrito/zona (polígono) — orienta ProBuilder e a paleta. */
export const districtSpecSchema = z.object({
  id: z.string().min(1),
  bounds: z.array(vec2).min(3),
  zone: z.enum(['civic', 'market', 'residential', 'industrial', 'park', 'transit']),
});
export type DistrictSpec = z.infer<typeof districtSpecSchema>;

/** Marco (placeholder → hero asset depois). */
export const landmarkSpecSchema = z.object({ id: z.string().min(1), at: vec2, kind: z.string().min(1) });
export type LandmarkSpec = z.infer<typeof landmarkSpecSchema>;

/** Uma cidade (núcleo urbano) dentro da região. */
export const citySpecSchema = z.object({
  id: z.string().min(1),
  bounds: z.array(vec2).min(3),
  roads: z.array(roadSpecSchema),
  intersections: z.array(intersectionSpecSchema).default([]),
  districts: z.array(districtSpecSchema).default([]),
  landmarks: z.array(landmarkSpecSchema).default([]),
  mainFlow: z.array(z.string()).optional(),
});
export type CitySpec = z.infer<typeof citySpecSchema>;

/** A região inteira (ex.: DF 5×5 km): rodovias + cidades + interchanges. */
export const regionSpecSchema = z.object({
  name: z.string().min(1),
  size: z.object({ x: z.number().positive(), z: z.number().positive() }),
  /**
   * Posição de MUNDO do ponto de mapa `[0,0]` (canto da planta/underlay). A spec fica em
   * coords de mapa (0..size); a `compile` soma a origem. Mundo centrado de 5000m → `[-2500,-2500]`.
   */
  origin: vec2.optional(),
  underlay: z.string().optional(),
  highways: z.array(roadSpecSchema).default([]),
  interchanges: z.array(intersectionSpecSchema).default([]),
  cities: z.array(citySpecSchema),
});
export type RegionSpec = z.infer<typeof regionSpecSchema>;

/** Problemas encontrados na validação de rede (além do schema). */
export interface SpecIssue {
  level: 'error' | 'warning';
  message: string;
}

/**
 * Valida uma {@link RegionSpec}: schema (zod) + **rede** (cruzamento referenciando via
 * inexistente, via com pontos colineares degenerados, ids duplicados). Retorna `{ ok, issues }`
 * — `ok` é `false` se houver algum `error`. Use antes de `compile` (a IA pode gerar specs).
 */
export function validateRegion(input: unknown): { ok: boolean; spec?: RegionSpec; issues: SpecIssue[] } {
  const issues: SpecIssue[] = [];
  const parsed = regionSpecSchema.safeParse(input);
  if (!parsed.success) {
    for (const e of parsed.error.issues) issues.push({ level: 'error', message: `${e.path.join('.')}: ${e.message}` });
    return { ok: false, issues };
  }
  const spec = parsed.data;
  const roadIds = new Set<string>();
  const allRoads = [...spec.highways, ...spec.cities.flatMap((c) => c.roads)];
  for (const r of allRoads) {
    if (roadIds.has(r.id)) issues.push({ level: 'error', message: `via id duplicado: ${r.id}` });
    roadIds.add(r.id);
  }
  const allInter = [...spec.interchanges, ...spec.cities.flatMap((c) => c.intersections)];
  for (const x of allInter) {
    for (const rid of x.roads) {
      if (!roadIds.has(rid)) issues.push({ level: 'error', message: `cruzamento ${x.id} referencia via inexistente: ${rid}` });
    }
    if (x.kind === 'roundabout' && !x.radius) issues.push({ level: 'warning', message: `rotatória ${x.id} sem raio (usa default)` });
  }
  return { ok: !issues.some((i) => i.level === 'error'), spec, issues };
}
