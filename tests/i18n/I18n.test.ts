/**
 * Testes unitários do i18n (src/i18n/I18n.ts) — SPEC-0124.
 * Cobre: parse do arquivo de idioma (CHAVE="VALOR"), t() com params e
 * fallback, load/setLanguage/onChange e loadAuto (detecção do idioma do SO).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { I18n, parseLanguageFile, detectSystemLanguage } from '../../src/i18n/I18n.js';

/** Finge o fetch servindo `arquivos` (url → conteúdo); resto vira 404. */
function mockFiles(files: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const text = files[url];
      if (text === undefined) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => text };
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>)['__cortexLocale'];
});

describe('parseLanguageFile', () => {
  it('parseia CHAVE="VALOR", ignora comentários e linhas vazias', () => {
    const dict = parseLanguageFile(
      '# comentário\n; outro\n\nmenu.play="Jogar"\nmenu.quit = "Sair" \n',
    );
    expect(dict).toEqual({ 'menu.play': 'Jogar', 'menu.quit': 'Sair' });
  });

  it('divide no PRIMEIRO = (o valor pode conter =)', () => {
    const dict = parseLanguageFile('hint.formula="2 + 2 = 4"');
    expect(dict['hint.formula']).toBe('2 + 2 = 4');
  });

  it('converte \\n em quebra de linha, \\" em aspas e remove BOM', () => {
    const dict = parseLanguageFile('﻿dialog.intro="ela disse \\"oi\\"\\ntchau"');
    expect(dict['dialog.intro']).toBe('ela disse "oi"\ntchau');
  });

  it('tolera valor sem aspas (tradução automática pode removê-las)', () => {
    expect(parseLanguageFile('menu.play=Jogar')).toEqual({ 'menu.play': 'Jogar' });
  });

  it('ignora linha sem = ou sem chave', () => {
    expect(parseLanguageFile('sem-igual\n="sem-chave"\nok="1"')).toEqual({ ok: '1' });
  });
});

describe('I18n.t', () => {
  it('traduz, interpola {params} e preserva placeholder sem valor', async () => {
    mockFiles({
      'languages/pt-BR.txt': 'hud.coins="Moedas: {count}"\nhud.who="{a} e {b}"',
    });
    const i = new I18n();
    await i.load('pt-BR');
    expect(i.t('hud.coins', { count: 12 })).toBe('Moedas: 12');
    expect(i.t('hud.who', { a: 'Ana' })).toBe('Ana e {b}');
  });

  it('chave ausente cai pro fallback; sem fallback devolve a chave', async () => {
    mockFiles({
      'languages/pt-BR.txt': 'menu.play="Jogar"',
      'languages/en.txt': 'menu.play="Play"\nmenu.quit="Quit"',
    });
    const i = new I18n();
    await i.load('pt-BR', { fallback: 'en' });
    expect(i.t('menu.play')).toBe('Jogar');
    expect(i.t('menu.quit')).toBe('Quit'); // só existe no fallback
    expect(i.t('menu.nada')).toBe('menu.nada');
    expect(i.has('menu.quit')).toBe(true);
    expect(i.has('menu.nada')).toBe(false);
  });
});

describe('I18n.load / setLanguage', () => {
  it('arquivo ausente retorna false e t() devolve as chaves', async () => {
    mockFiles({});
    const i = new I18n();
    expect(await i.load('xx')).toBe(false);
    expect(i.language).toBe('xx');
    expect(i.t('menu.play')).toBe('menu.play');
  });

  it('resposta HTML (SPA fallback do vite dev) conta como ausente', async () => {
    mockFiles({ 'languages/xx.txt': '<!doctype html><html></html>' });
    const i = new I18n();
    expect(await i.load('xx')).toBe(false);
  });

  it('setLanguage troca ao vivo, mantém o fallback e notifica onChange', async () => {
    mockFiles({
      'languages/pt-BR.txt': 'menu.play="Jogar"',
      'languages/en.txt': 'menu.play="Play"\nmenu.quit="Quit"',
    });
    const i = new I18n();
    await i.load('en', { fallback: 'en' });
    const seen: string[] = [];
    const off = i.onChange((code) => seen.push(code));
    await i.setLanguage('pt-BR');
    expect(i.t('menu.play')).toBe('Jogar');
    expect(i.t('menu.quit')).toBe('Quit'); // fallback en preservado
    expect(seen).toEqual(['pt-BR']);
    off();
    await i.setLanguage('en');
    expect(seen).toEqual(['pt-BR']); // listener removido
  });

  it('path customizado é respeitado', async () => {
    mockFiles({ 'i18n/en.txt': 'a="b"' });
    const i = new I18n();
    await i.load('en', { path: 'i18n' });
    expect(i.t('a')).toBe('b');
  });
});

describe('detectSystemLanguage', () => {
  it('usa __cortexLocale (host nativo) e normaliza pt_br → pt-BR', () => {
    (globalThis as Record<string, unknown>)['__cortexLocale'] = 'pt_br';
    expect(detectSystemLanguage()).toBe('pt-BR');
  });

  it('sem fonte de locale devolve vazio', () => {
    vi.stubGlobal('navigator', undefined);
    expect(detectSystemLanguage()).toBe('');
  });
});

describe('I18n.loadAuto (primeira abertura)', () => {
  it('idioma do SO disponível → seleciona ele', async () => {
    (globalThis as Record<string, unknown>)['__cortexLocale'] = 'pt-BR';
    mockFiles({
      'languages/pt-BR.txt': 'menu.play="Jogar"',
      'languages/en.txt': 'menu.play="Play"',
    });
    const i = new I18n();
    expect(await i.loadAuto({ default: 'en' })).toBe('pt-BR');
    expect(i.t('menu.play')).toBe('Jogar');
  });

  it('sem o regional exato, tenta a língua base (pt-BR → pt)', async () => {
    (globalThis as Record<string, unknown>)['__cortexLocale'] = 'pt-BR';
    mockFiles({
      'languages/pt.txt': 'menu.play="Jogar"',
      'languages/en.txt': 'menu.play="Play"',
    });
    const i = new I18n();
    expect(await i.loadAuto({ default: 'en' })).toBe('pt');
  });

  it('idioma do SO indisponível → cai pro default', async () => {
    (globalThis as Record<string, unknown>)['__cortexLocale'] = 'ja-JP';
    mockFiles({ 'languages/en.txt': 'menu.play="Play"' });
    const i = new I18n();
    expect(await i.loadAuto({ default: 'en' })).toBe('en');
    expect(i.t('menu.play')).toBe('Play');
  });

  it('SO já no default (en-US com default en) resolve pro default', async () => {
    (globalThis as Record<string, unknown>)['__cortexLocale'] = 'en-US';
    mockFiles({ 'languages/en.txt': 'menu.play="Play"' });
    const i = new I18n();
    expect(await i.loadAuto({ default: 'en' })).toBe('en');
  });
});
