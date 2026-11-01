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

/** Peças da ponte (SPEC-0631 §3d): modelos do jogo distribuídos ao longo de cada vão. */
const bridgePartsSchema = z.object({
  /** Peça de pista (topo em y = 0, comprimento em Z), repetida e esticada para fechar o vão. */
  deck: z.string().optional(),
  /** Pilar (topo em y = 0, cresce para baixo), esticado até o chão nas juntas. */
  pillar: z.string().optional(),
  /** Guarda-corpo (base em y = 0), repetido nas duas bordas. */
  rail: z.string().optional(),
  /** Escala de pista e pilar. Default 1. */
  scale: z.number().positive().optional(),
  /** Pilar a cada N peças de pista. Default 2. */
  pillarEvery: z.number().int().positive().optional(),
});
export type RoadBridgeParts = z.infer<typeof bridgePartsSchema>;
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
  /** Trechos de ponte `[i0, i1]` por índice de `points`: sem corte/aterro, greide reto (SPEC-0631 §3c). */
  bridge: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])).optional(),
  /** Peças da ponte nos vãos `bridge` (SPEC-0631 §3d, ADR-0649). Sem isto, o vão é só a fita. */
  bridgeParts: bridgePartsSchema.optional(),
  /** Amostras por 90° de curva. Default 16. */
  steps: z.number().int().positive().optional(),
});

/** Campos da estrada (nó sem `type`/`id`). */
export type RoadFields = z.infer<typeof roadFieldsSchema>;

/** Edição do overlay (`data.road[id]`): qualquer subconjunto dos campos. */
export const roadOverlaySchema = roadFieldsSchema.partial();
export type RoadOverlay = z.infer<typeof roadOverlaySchema>;
