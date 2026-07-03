/**
 * Cobre o renomear-objeto do Inspector (ADR-0091): validação do nome
 * (alfanumérico + hífen), a migração de TODAS as chaves do overlay e as regras
 * da api (só nós adicionados no editor; unicidade; undo hook).
 */

import { describe, it, expect, vi } from 'vitest';
import { Group } from 'three';
import {
  validateObjectName,
  migrateOverlayName,
  createRenameApi,
} from '../../src/editor/authoring/RenameAuthoring.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';
import type { EditorAuthoringContext } from '../../src/editor/authoring/AuthoringContext.js';

const makeOverlay = (): SceneFileV1 =>
  ({
    version: 1,
    objects: { 'add-abc': { position: [1, 2, 3] } },
    data: {
      physics: { 'add-abc': { type: 'static' } },
      scripts: { 'add-abc': [{ type: 'Moeda' }] },
      matte: { 'add-abc': true },
      added: [{ type: 'model', id: 'add-abc', url: 'assets/kit/coin_001.glb' }],
      deleted: ['add-abc'],
    },
  }) as unknown as SceneFileV1;

const makeCtx = (overlay: SceneFileV1, three: Group): EditorAuthoringContext =>
  ({
    overlay,
    three,
    persist: vi.fn(),
    record: () => ({}),
    game: {} as never,
  }) as unknown as EditorAuthoringContext;

describe('validateObjectName', () => {
  it('aceita alfanumérico, hífen e underline', () => {
    expect(validateObjectName('boss-1')).toBeNull();
    expect(validateObjectName('Coin2')).toBeNull();
    expect(validateObjectName('coisa_1')).toBeNull();
    expect(validateObjectName('meu_objeto-2')).toBeNull();
  });
  it('rejeita vazio, espaço e caracteres especiais', () => {
    expect(validateObjectName('')).not.toBeNull();
    expect(validateObjectName('meu objeto')).not.toBeNull();
    expect(validateObjectName('açaí')).not.toBeNull();
    expect(validateObjectName('obj.1')).not.toBeNull();
  });
});

describe('migrateOverlayName', () => {
  it('migra objects, data.* por nome, id em added e deleted', () => {
    const overlay = makeOverlay();
    migrateOverlayName(overlay, 'add-abc', 'moeda-boss');
    const data = overlay.data as Record<string, never>;
    expect((overlay.objects as Record<string, unknown>)['moeda-boss']).toEqual({ position: [1, 2, 3] });
    expect((overlay.objects as Record<string, unknown>)['add-abc']).toBeUndefined();
    expect((data['physics'] as Record<string, unknown>)['moeda-boss']).toEqual({ type: 'static' });
    expect((data['scripts'] as Record<string, unknown>)['moeda-boss']).toEqual([{ type: 'Moeda' }]);
    expect((data['matte'] as Record<string, unknown>)['moeda-boss']).toBe(true);
    expect((data['added'] as { id: string }[])[0]!.id).toBe('moeda-boss');
    expect(data['deleted']).toEqual(['moeda-boss']);
  });

  it('não cria chaves que não existiam', () => {
    const overlay = { version: 1, objects: {}, data: {} } as unknown as SceneFileV1;
    migrateOverlayName(overlay, 'x', 'y');
    expect(Object.keys(overlay.data as object)).toEqual([]);
  });
});

describe('createRenameApi', () => {
  const setup = () => {
    const overlay = makeOverlay();
    const three = new Group();
    const obj = new Group();
    obj.name = 'add-abc';
    three.add(obj);
    const notify = vi.fn();
    const onRenamed = vi.fn();
    const ctx = makeCtx(overlay, three);
    const api = createRenameApi(ctx, {
      isAdded: (name) => name === 'add-abc',
      notify,
      onRenamed,
    });
    return { overlay, three, obj, api, notify, onRenamed, ctx };
  };

  it('renomeia nó adicionado: obj.name + overlay + persist + undo hook', () => {
    const { obj, api, overlay, onRenamed, ctx } = setup();
    expect(api.isRenamable(obj)).toBe(true);
    expect(api.rename(obj, 'moeda-boss')).toBeNull();
    expect(obj.name).toBe('moeda-boss');
    expect((overlay.objects as Record<string, unknown>)['moeda-boss']).toBeDefined();
    expect(ctx.persist).toHaveBeenCalled();
    expect(onRenamed).toHaveBeenCalledWith(obj, 'add-abc', 'moeda-boss');
  });

  it('rejeita nome inválido e duplicado (sem mudar nada)', () => {
    const { obj, api, three } = setup();
    expect(api.rename(obj, 'nome com espaço')).not.toBeNull();
    const outro = new Group();
    outro.name = 'ocupado';
    three.add(outro);
    expect(api.rename(obj, 'ocupado')).not.toBeNull();
    expect(obj.name).toBe('add-abc');
  });

  it('rejeita objeto que não é nó adicionado', () => {
    const { api, three } = setup();
    const codeObj = new Group();
    codeObj.name = 'player';
    three.add(codeObj);
    expect(api.isRenamable(codeObj)).toBe(false);
    expect(api.rename(codeObj, 'player-2')).not.toBeNull();
    expect(codeObj.name).toBe('player');
  });

  it('applyRename desfaz sem validação (caminho do undo)', () => {
    const { obj, api, overlay } = setup();
    api.rename(obj, 'moeda-boss');
    api.applyRename(obj, 'moeda-boss', 'add-abc');
    expect(obj.name).toBe('add-abc');
    expect((overlay.objects as Record<string, unknown>)['add-abc']).toBeDefined();
    expect((overlay.objects as Record<string, unknown>)['moeda-boss']).toBeUndefined();
  });
});
