import type { Object3D } from 'three';
import type { SceneFileV1 } from '../../scene/SceneFile.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';

/**
 * **Renomear objeto no Inspector** (ADR-0091). O nome do `Object3D` é o
 * identificador estável de um nó da cena (o `buildScene` nomeia pelo `id`), e o
 * overlay do editor é TODO chaveado por ele (`objects`, `data.physics`,
 * `data.scripts`, …) — então renomear é: validar → migrar TODAS as chaves do
 * overlay → trocar `obj.name` → persistir.
 *
 * **Só objetos adicionados no editor** (`data.added`) são renomeáveis: o id
 * deles vive no próprio overlay, então o rename sobrevive ao reload. Um nó
 * declarado no código renasceria com o id antigo no próximo boot e as chaves
 * migradas ficariam órfãs — pra esses, o Inspector mostra o nome como nota.
 */

/** Regra de nome de objeto: alfanumérico, hífen e underline — sem espaço. */
export const OBJECT_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Valida um nome proposto. Retorna a mensagem de erro, ou `null` se ok. */
export function validateObjectName(name: string): string | null {
  if (!name) return 'Nome vazio';
  if (!OBJECT_NAME_RE.test(name)) return 'Nome inválido: use só letras, números, hífen e underline (sem espaço)';
  return null;
}

/**
 * Chaves de `overlay.data` indexadas por **nome/id de nó** — todas migram no
 * rename. Manter em sincronia com os leitores `overlay*` do SceneBuilder.
 */
const NAME_KEYED_DATA = [
  'colliders',
  'physics',
  'matte',
  'shadow',
  'material',
  'animation',
  'playerAnimations',
  'vehicle',
  'geometry',
  'terrain',
  'terrainPaint',
  'scripts',
  'underlay',
] as const;

/**
 * Migra TODAS as entradas de `oldName` pra `newName` no overlay: transform
 * override (`objects`), os records por nome de `data.*`, o `id` do nó em
 * `data.added` e ocorrências em `data.deleted`. Muta o overlay (chame `persist`
 * depois). Pura em relação ao DOM/cena — testável.
 */
export function migrateOverlayName(overlay: SceneFileV1, oldName: string, newName: string): void {
  const objects = overlay.objects as Record<string, unknown> | undefined;
  if (objects && oldName in objects) {
    objects[newName] = objects[oldName];
    delete objects[oldName];
  }
  const data = overlay.data as Record<string, unknown>;
  for (const key of NAME_KEYED_DATA) {
    const rec = data[key];
    if (rec && typeof rec === 'object' && !Array.isArray(rec) && oldName in (rec as Record<string, unknown>)) {
      const r = rec as Record<string, unknown>;
      r[newName] = r[oldName];
      delete r[oldName];
    }
  }
  const added = data['added'];
  if (Array.isArray(added)) {
    for (const node of added) {
      if (node && typeof node === 'object' && (node as { id?: unknown }).id === oldName) {
        (node as { id: string }).id = newName;
      }
    }
  }
  const deleted = data['deleted'];
  if (Array.isArray(deleted)) {
    for (let i = 0; i < deleted.length; i++) {
      if (deleted[i] === oldName) deleted[i] = newName;
    }
  }
}

/** API de rename usada pelo Inspector (via {@link InspectorContext}). */
export interface RenameApi {
  /** `true` se o objeto pode ser renomeado (nó adicionado no editor). */
  isRenamable(obj: Object3D): boolean;
  /**
   * Renomeia com validação (formato, unicidade, renomeável). Retorna a mensagem
   * de erro, ou `null` no sucesso (aplica, persiste, notifica e registra no undo).
   */
  rename(obj: Object3D, newName: string): string | null;
  /** Aplica o rename SEM validação/undo (usado pelo próprio undo/redo). */
  applyRename(obj: Object3D, fromName: string, toName: string): void;
}

export interface RenameApiOptions {
  /** `true` se `name` é o id de um nó adicionado no editor (`data.added`). */
  isAdded(name: string): boolean;
  /** Feedback pro usuário (toast do HUD). */
  notify?(msg: string): void;
  /** Chamado no sucesso — o attachEditor registra o comando de undo aqui. */
  onRenamed?(obj: Object3D, oldName: string, newName: string): void;
}

/** Cria a {@link RenameApi} (padrão das autorias — ADR-0060). */
export function createRenameApi(ctx: EditorAuthoringContext, options: RenameApiOptions): RenameApi {
  const { isAdded, notify, onRenamed } = options;

  const applyRename = (obj: Object3D, fromName: string, toName: string): void => {
    migrateOverlayName(ctx.overlay, fromName, toName);
    obj.name = toName;
    ctx.persist();
  };

  return {
    isRenamable: (obj) => !!obj.name && isAdded(obj.name),
    applyRename,
    rename(obj, newName) {
      const oldName = obj.name;
      const name = newName.trim();
      if (name === oldName) return null; // nada a fazer
      const invalid = validateObjectName(name);
      if (invalid) {
        notify?.(invalid);
        return invalid;
      }
      if (!oldName || !isAdded(oldName)) {
        const msg = 'Só objetos adicionados no editor podem ser renomeados (os demais vêm do código)';
        notify?.(msg);
        return msg;
      }
      const clash = ctx.three.getObjectByName(name);
      if (clash && clash !== obj) {
        const msg = `Já existe um objeto chamado "${name}"`;
        notify?.(msg);
        return msg;
      }
      applyRename(obj, oldName, name);
      notify?.(`Renomeado: ${oldName} → ${name}`);
      onRenamed?.(obj, oldName, name);
      return null;
    },
  };
}
