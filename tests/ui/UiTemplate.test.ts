import { describe, expect, it } from 'vitest';
import { parseUiTemplate } from '../../src/ui/runtime/UiTemplate.js';
import { UiButton, UiLabel, UiPanel } from '../../src/ui/runtime/widgets.js';
import { UiLayer } from '../../src/ui/runtime/UiLayer.js';
import type { UiBackend } from '../../src/ui/runtime/UiBackend.js';

const VIEWPORT = { width: 1280, height: 720 };
const backend = (): UiBackend => ({ sync: () => {}, render: () => {}, dispose: () => {} });

describe('UiTemplate — HTML que compila pra UI nativa (ADR-0102)', () => {
  it('template completo: style + fill + data + onpress', () => {
    const ui = new UiLayer(backend(), () => VIEWPORT);
    const tpl = parseUiTemplate(`
      <style>.t { color: #ffffff; font-size: 40px; }</style>
      <panel fill></panel>
      <label class="t" anchor="center" y="-100">{{titulo}}</label>
      <button onpress="jogar" width="200" height="40">Jogar</button>
    `);
    let pressed = '';
    const inst = tpl.build(ui, {
      data: { titulo: 'Meu Jogo' },
      onAction: (a) => { pressed = a; },
    });

    const [panel, label, button] = inst.widgets as [UiPanel, UiLabel, UiButton];
    expect(panel.width).toBe(1280); // fill = viewport
    expect(label.text).toBe('Meu Jogo'); // {{titulo}} substituído
    expect(label.fontSize).toBe(40); // class do <style>
    button.onPress!();
    expect(pressed).toBe('jogar');
    inst.destroy();
    expect(inst.widgets.length).toBe(0);
  });

  it('stack column centraliza os filhos (pivô acompanha a âncora)', () => {
    const ui = new UiLayer(backend(), () => VIEWPORT);
    const tpl = parseUiTemplate(`
      <stack anchor="center" gap="10">
        <button width="100" height="40">A</button>
        <button width="100" height="40">B</button>
      </stack>
    `);
    const inst = tpl.build(ui);
    const [a, b] = inst.widgets as [UiButton, UiButton];
    // total 90 → A: 0 + 40*0.5 − 90*0.5 = −25 ; B: 50 + 20 − 45 = +25
    expect(a.y).toBe(-25);
    expect(b.y).toBe(25);
    expect(a.anchor).toBe('center');
  });

  it('id permite atualizar dinamicamente (HUD)', () => {
    const ui = new UiLayer(backend(), () => VIEWPORT);
    const inst = parseUiTemplate('<label id="placar" anchor="top-left">x0</label>').build(ui);
    (inst.get('placar') as UiLabel).set({ text: 'x7' });
    expect((inst.get('placar') as UiLabel).text).toBe('x7');
  });

  it('ignora o lixo do dev server (script do vite, doctype, meta)', () => {
    const ui = new UiLayer(backend(), () => VIEWPORT);
    const inst = parseUiTemplate(`
      <!DOCTYPE html>
      <script type="module" src="/@vite/client"></script>
      <meta charset="utf-8">
      <label anchor="center">Oi</label>
    `).build(ui);
    expect(inst.widgets.length).toBe(1);
    expect((inst.widgets[0] as UiLabel).text).toBe('Oi');
  });

  it('tag fora do vocabulário = erro claro', () => {
    expect(() => parseUiTemplate('<div>oi</div>')).toThrow(/<div>/);
    expect(() => parseUiTemplate('<panel>')).toThrow(/não fechada/);
    expect(() => parseUiTemplate('<label class="x">a</label>')).not.toThrow();
    const ui = new UiLayer(backend(), () => VIEWPORT);
    expect(() =>
      parseUiTemplate('<label class="x">a</label>').build(ui),
    ).toThrow(/sem <style>/);
  });
});
