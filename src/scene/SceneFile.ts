import { z } from 'zod';

/**
 * Formato persistido da cena (estado editável: transforms de objetos por nome +
 * dados arbitrários do jogo). Vai junto no build (versionável no git), ao
 * contrário do localStorage. Ver ADR.
 *
 * `data` é deliberadamente **opaco** — cada projeto guarda o que quiser (spawn,
 * checkpoints, hora do dia…) sem o engine precisar conhecer. O acesso tipado
 * fica no projeto: `const spawn = file.data.spawn as SavedSpawn`.
 */
export interface SceneFileV1 {
  version: 1;
  /** Transform (pos/rot[euler]/scale) por `Object3D.name`. */
  objects: Record<
    string,
    {
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
    }
  >;
  /** Slots arbitrários do projeto. Opaco pro engine. */
  data: Record<string, unknown>;
}

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

const sceneFileV1Schema = z.object({
  version: z.literal(1),
  objects: z.record(
    z.string(),
    z.object({ position: vec3, rotation: vec3, scale: vec3 }),
  ),
  data: z.record(z.string(), z.unknown()),
});

/**
 * Valida e parseia um objeto desconhecido (ex.: JSON.parse de um fetch) num
 * `SceneFileV1`. Retorna `null` se o formato for inválido — o chamador faz
 * fallback para os defaults do código.
 */
export function parseSceneFile(raw: unknown): SceneFileV1 | null {
  const result = sceneFileV1Schema.safeParse(raw);
  return result.success ? (result.data as SceneFileV1) : null;
}

/** Cria um SceneFile vazio (version 1). */
export function emptySceneFile(): SceneFileV1 {
  return { version: 1, objects: {}, data: {} };
}
