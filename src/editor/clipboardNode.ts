/**
 * **Clipboard de nós do editor** (CTRL+C/CTRL+V, ADR-0095) — a parte PURA:
 * dado o def copiado + o transform ATUAL do objeto (pode ter sido movido no
 * gizmo), monta o `SceneNode` da cópia, pronto pro `addSceneNode` + `data.added`.
 */
import type { SceneNode } from '../scene/SceneDefinition.js';

export interface NodeClipboard {
  /** Def do nó de origem (clonado no CTRL+C — não muta a cena). */
  def: SceneNode;
  /** Transform do Object3D no momento da cópia (fonte da verdade, não o def). */
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

/** Deslocamento do colado em relação ao original (X/Z), pra cópia não nascer
 * escondida DENTRO dele. */
export const PASTE_OFFSET = 1;

/**
 * Monta o nó da cópia: `id` novo, `transform` explícito (posição deslocada
 * {@link PASTE_OFFSET} em X/Z + rotação/escala do original), sem `place`
 * (o transform já é exato). Campos de gameplay **singleton** (`player`,
 * `character`) são removidos — duplicar o controller do player quebraria o
 * jogo; o resto (scripts, collider, animation…) vai junto.
 */
export function buildPastedNode(clip: NodeClipboard, id: string): SceneNode {
  const def = JSON.parse(JSON.stringify(clip.def)) as Record<string, unknown>;
  def['id'] = id;
  delete def['place'];
  delete def['player'];
  delete def['character'];
  def['transform'] = {
    position: [clip.position[0] + PASTE_OFFSET, clip.position[1], clip.position[2] + PASTE_OFFSET],
    rotation: clip.rotation,
    scale: clip.scale,
  };
  return def as unknown as SceneNode;
}
