/**
 * Regressão do "save não grava física": o attachEditor SUBSTITUI `overlay.data`
 * ao semear o arquivo (async no boot). O OverlayStore (ctx.record) tem que ler
 * `overlay.data` DINAMICAMENTE — se capturasse por referência na criação, a autoria
 * escreveria no objeto antigo (órfão) e o persist salvaria o novo (perdendo a edição).
 */
import { describe, it, expect } from 'vitest';
import { Object3D } from 'three';
import { createAuthoringContext } from '../../src/editor/authoring/AuthoringContext.js';
import type { Game } from '../../src/core/Game.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

describe('AuthoringContext (OverlayStore)', () => {
  it('record() escreve no overlay.data ATUAL mesmo após ele ser SUBSTITUÍDO', () => {
    const overlay = { version: 1, objects: {}, data: {} } as unknown as SceneFileV1;
    const ctx = createAuthoringContext({} as unknown as Game, new Object3D(), overlay, () => {});

    // attachEditor semeia o arquivo: TROCA o objeto data (não muta in place).
    overlay.data = { material: { algo: { type: 'toon' } } } as unknown as SceneFileV1['data'];

    // a autoria grava DEPOIS do seed:
    ctx.record<{ type: string }>('physics')['caixa_03'] = { type: 'none' };

    // tem que estar no overlay.data ATUAL (o que o persist vai salvar), não no órfão:
    expect((overlay.data as Record<string, unknown>)['physics']).toEqual({ caixa_03: { type: 'none' } });
    // e não apagou o que já tinha sido semeado:
    expect((overlay.data as Record<string, unknown>)['material']).toEqual({ algo: { type: 'toon' } });
  });
});
