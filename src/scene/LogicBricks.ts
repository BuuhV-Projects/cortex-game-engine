import { z } from 'zod';

/**
 * **Logic Bricks** (estilo UPBGE/BGE): comportamento de um objeto como DADO —
 * **sensores** (eventos) → **controllers** (lógica and/or) → **actuators** (ações).
 * Cada um tem `id`; controllers ligam sensores a actuators por id (N sensores,
 * N actuators). Autorado no nó (`logic`) ou na overlay do editor; interpretado
 * pelo {@link LogicBricksSystem}. Começo mínimo — cresce com novos tipos.
 */

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

/** Sensor: dispara um sinal. `always` (todo frame) ou `key` (tecla). */
const sensorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('always'), id: z.string().min(1) }),
  z.object({
    type: z.literal('key'),
    id: z.string().min(1),
    /** Tecla (ex.: `'ArrowRight'`, `'Space'`). */
    key: z.string().min(1),
    /** `true` = só no frame em que aperta (edge); `false` = enquanto segura. Default false. */
    edge: z.boolean().optional(),
  }),
]);

/** Actuator: a ação executada quando o controller ativa. */
const actuatorSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('motion'),
    id: z.string().min(1),
    /** Deslocamento `[x,y,z]` (por segundo se `perSecond`, senão por ativação). */
    loc: vec3.optional(),
    /** Rotação `[x,y,z]` em radianos (idem). */
    rot: vec3.optional(),
    /** Aplica por segundo (movimento contínuo) em vez de por frame. Default true. */
    perSecond: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('animation'),
    id: z.string().min(1),
    clip: z.string().min(1),
    loop: z.boolean().optional(),
  }),
]);

/** Controller: liga sensores a actuators com um gate `and`/`or`. */
const controllerSchema = z.object({
  id: z.string().min(1),
  op: z.enum(['and', 'or']).optional(),
  sensors: z.array(z.string()).default([]),
  actuators: z.array(z.string()).default([]),
});

/** Conjunto de bricks de um objeto. */
const logicSchema = z.object({
  sensors: z.array(sensorSchema).default([]),
  controllers: z.array(controllerSchema).default([]),
  actuators: z.array(actuatorSchema).default([]),
});

export type LogicSensor = z.infer<typeof sensorSchema>;
export type LogicActuator = z.infer<typeof actuatorSchema>;
export type LogicController = z.infer<typeof controllerSchema>;
export type LogicDefinition = z.infer<typeof logicSchema>;

/** Valida/parseia um objeto desconhecido numa {@link LogicDefinition} (ou `null`). */
export function parseLogic(raw: unknown): LogicDefinition | null {
  const r = logicSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Schema exportado pro `SceneDefinition` reusar o campo `logic`. */
export const logicNodeSchema = logicSchema.optional();
