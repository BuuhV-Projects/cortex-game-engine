/**
 * Testes da ponte de seleção observável do editor (src/editor/EditorSelection.ts).
 * Cobre: requestSelect→onSelectRequest, setCurrent→onChange (dedupe), emitTransform
 * →onTransform (só com seleção), e unsubscribe. Ver ADR-0041/0042.
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
    expect(cb).toHaveBeenCalledWith(obj);
    sel.requestSelect(null);
    expect(cb).toHaveBeenCalledWith(null);
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
});
