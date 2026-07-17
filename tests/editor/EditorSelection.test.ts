/**
 * Testes da ponte de seleção observável do editor (src/editor/EditorSelection.ts).
 * Cobre: requestSelect→onSelectRequest (com a flag additive da multi-seleção),
 * setCurrent→onChange (dedupe, conjunto `items`), emitTransform→onTransform (só
 * com seleção), e unsubscribe. Ver ADR-0041/0042.
 */
import { describe, it, expect, vi } from 'vitest';
import { Object3D } from 'three';
import { createEditorSelection } from '../../src/editor/EditorSelection.js';

describe('EditorSelection', () => {
  it('começa sem seleção', () => {
    const sel = createEditorSelection();
    expect(sel.current).toBeNull();
  });

  it('requestSelect dispara onSelectRequest com o objeto pedido', () => {
    const sel = createEditorSelection();
    const obj = new Object3D();
    const cb = vi.fn();
    sel.onSelectRequest(cb);
    sel.requestSelect(obj);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(obj, undefined);
    sel.requestSelect(null);
    expect(cb).toHaveBeenCalledWith(null, undefined);
  });

  it('setCurrent atualiza current e dispara onChange', () => {
    const sel = createEditorSelection();
    const obj = new Object3D();
    const cb = vi.fn();
    sel.onChange(cb);
    sel.setCurrent(obj);
    expect(sel.current).toBe(obj);
    expect(cb).toHaveBeenCalledWith(obj);
  });

  it('setCurrent não dispara onChange se o objeto for o mesmo (dedupe)', () => {
    const sel = createEditorSelection();
    const obj = new Object3D();
    sel.setCurrent(obj);
    const cb = vi.fn();
    sel.onChange(cb);
    sel.setCurrent(obj); // mesmo objeto
    expect(cb).not.toHaveBeenCalled();
  });

  it('emitTransform dispara onTransform só quando há seleção', () => {
    const sel = createEditorSelection();
    const cb = vi.fn();
    sel.onTransform(cb);

    sel.emitTransform(); // sem seleção → no-op
    expect(cb).not.toHaveBeenCalled();

    const obj = new Object3D();
    sel.setCurrent(obj);
    sel.emitTransform();
    expect(cb).toHaveBeenCalledWith(obj);
  });

  it('unsubscribe para de receber eventos', () => {
    const sel = createEditorSelection();
    const cb = vi.fn();
    const unsub = sel.onChange(cb);
    unsub();
    sel.setCurrent(new Object3D());
    expect(cb).not.toHaveBeenCalled();
  });

  it('requestSelect repassa a flag additive (Ctrl+click) ao onSelectRequest', () => {
    const sel = createEditorSelection();
    const obj = new Object3D();
    const cb = vi.fn();
    sel.onSelectRequest(cb);
    sel.requestSelect(obj, { additive: true });
    expect(cb).toHaveBeenCalledWith(obj, { additive: true });
    sel.requestSelect(obj); // sem opts = seleção normal
    expect(cb).toHaveBeenLastCalledWith(obj, undefined);
  });

  it('setCurrent com conjunto: items guarda todos, current é o primário', () => {
    const sel = createEditorSelection();
    const a = new Object3D();
    const b = new Object3D();
    sel.setCurrent(b, [a, b]);
    expect(sel.current).toBe(b);
    expect(sel.items).toEqual([a, b]);
    expect(sel.isSelected(a)).toBe(true);
    expect(sel.isSelected(b)).toBe(true);
    expect(sel.isSelected(new Object3D())).toBe(false);
  });

  it('setCurrent sem items default pra [obj] (retrocompatível) e [] com null', () => {
    const sel = createEditorSelection();
    const obj = new Object3D();
    sel.setCurrent(obj);
    expect(sel.items).toEqual([obj]);
    sel.setCurrent(null);
    expect(sel.items).toEqual([]);
  });

  it('onChange dispara quando o CONJUNTO muda mesmo com o mesmo primário', () => {
    const sel = createEditorSelection();
    const a = new Object3D();
    const b = new Object3D();
    sel.setCurrent(a);
    const cb = vi.fn();
    sel.onChange(cb);
    sel.setCurrent(a, [b, a]); // mesmo primário, conjunto maior → notifica
    expect(cb).toHaveBeenCalledTimes(1);
    sel.setCurrent(a, [b, a]); // idêntico → dedupe
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
