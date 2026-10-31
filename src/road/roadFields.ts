/**
 * **Campos do nó `road`** (contrato da SPEC-0631 §1). Ficam aqui (e não no
 * `SceneDefinition`) porque o overlay do editor reusa o mesmo schema, parcial
 * (`data.road[id]`, SPEC-0631 §5).
 */
import { z } from 'zod/v3';

/** Largura default da pista (m). */
export const ROAD_DEFAULT_WIDTH = 8;
/** Largura default do talude por lado (m). */
export const ROAD_DEFAULT_TALUDE = 6;
/** Faixa default (m) além da borda da pista sem vegetação. */
export const ROAD_DEFAULT_CLEARANCE = 2;

const point = z.tuple([z.number(), z.number(), z.number()]);
const color = z.union([z.number(), z.string()]);

/** Campos editáveis da estrada (todos opcionais, exceto `points` no nó). */
export const roadFieldsSchema = z.object({
  /** Pontos da curva (≥2), `[x, y, z]` em metros, coordenadas de mundo. */
  points: z.array(point).min(2),
  /** Largura total da pista (m). Default {@link ROAD_DEFAULT_WIDTH}. */
  width: z.number().positive().optional(),
  /** Talude por lado (m): rampa do platô até o terreno original. Default {@link ROAD_DEFAULT_TALUDE}. */
  talude: z.number().nonnegative().optional(),
  /** Inclinação máxima do greide (Δy/Δhorizontal; 0.25 = 25%). Default 0.25. */
  maxSlope: z.number().nonnegative().optional(),
  /** De onde vem o greide: base do terreno (default) ou o Y dos pontos. */
  grade: z.enum(['terrain', 'points']).optional(),
  /** Janela da média móvel do greide (m). Default 12. */
  smooth: z.number().nonnegative().optional(),
  /** Textura tileável da pista (caminho do projeto). Ausente = só cor. */
  texture: z.string().optional(),
  /** Metros de pista por repetição da textura. Default 8. */
  tile: z.number().positive().optional(),
  /** Cor da pista (sem textura). Com textura, o default é branco. */
  color: color.optional(),
  /** Chão do carro (`userData.cortexRoad`). Default true. */
  drivable: z.boolean().optional(),
  /** Faixa (m) além da borda da pista sem vegetação (SPEC-0631 §3b). Default {@link ROAD_DEFAULT_CLEARANCE}. */
  clearance: z.number().nonnegative().optional(),
  /** Amostras por 90° de curva. Default 16. */
  steps: z.number().int().positive().optional(),
});

/** Campos da estrada (nó sem `type`/`id`). */
export type RoadFields = z.infer<typeof roadFieldsSchema>;

/** Edição do overlay (`data.road[id]`): qualquer subconjunto dos campos. */
export const roadOverlaySchema = roadFieldsSchema.partial();
export type RoadOverlay = z.infer<typeof roadOverlaySchema>;
