/**
 * Identidade do jogo resolvida do cortex.json (ADR-0126, game-config.mjs).
 *
 * `id` (slug estável → saves) e `name` (exibição → título/console) caem no nome
 * da PASTA quando ausentes — compat com projetos antigos que só têm `{engine}`.
 * O host nativo (core/game_config.cpp) espelha esta resolução; se ela mudar aqui,
 * mude lá também.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error — módulo .mjs sem tipos (script de build nativo)
import { readGameConfig } from '../../native/scripts/game-config.mjs';

let base: string;
/** Cria uma pasta de projeto com nome `slug` e um cortex.json opcional. */
function project(slug: string, cortex?: unknown): string {
  const dir = path.join(base, slug);
  fs.mkdirSync(dir, { recursive: true });
  if (cortex !== undefined) {
    fs.writeFileSync(path.join(dir, 'cortex.json'), JSON.stringify(cortex, null, 2));
  }
  return dir;
}

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-gc-'));
});
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

describe('readGameConfig', () => {
  it('config completa: id/name/icon fiéis', () => {
    const dir = project('teste4', {
      engine: 'cortex-game-engine',
      id: 'teste4',
      name: 'Cute Obstacle Rush',
      icon: 'branding/icon.png',
    });
    expect(readGameConfig(dir)).toMatchObject({
      id: 'teste4',
      name: 'Cute Obstacle Rush',
      icon: 'branding/icon.png',
    });
  });

  it('projeto antigo (só {engine}): id e name caem no slug da pasta', () => {
    const dir = project('meu-jogo', { engine: 'cortex-game-engine' });
    const cfg = readGameConfig(dir);
    expect(cfg.id).toBe('meu-jogo');
    expect(cfg.name).toBe('meu-jogo');
    expect(cfg.icon).toBeUndefined();
  });

  it('sem cortex.json: resolve pelo slug', () => {
    const dir = project('sem-config');
    expect(readGameConfig(dir)).toMatchObject({ id: 'sem-config', name: 'sem-config' });
  });

  it('name presente sem id: id vem do slug, name preservado', () => {
    const dir = project('slug-estavel', { name: 'Nome Bonito' });
    const cfg = readGameConfig(dir);
    expect(cfg.id).toBe('slug-estavel');
    expect(cfg.name).toBe('Nome Bonito');
  });

  it('id presente sem name: name cai no id', () => {
    const dir = project('pasta', { id: 'id-fixo' });
    const cfg = readGameConfig(dir);
    expect(cfg.id).toBe('id-fixo');
    expect(cfg.name).toBe('id-fixo');
  });

  it('strings vazias/espaço contam como ausentes', () => {
    const dir = project('vazios', { id: '  ', name: '', icon: '   ' });
    const cfg = readGameConfig(dir);
    expect(cfg.id).toBe('vazios');
    expect(cfg.name).toBe('vazios');
    expect(cfg.icon).toBeUndefined();
  });

  it('JSON inválido: não lança, cai no slug', () => {
    const dir = project('quebrado');
    fs.writeFileSync(path.join(dir, 'cortex.json'), '{ nao é json ');
    expect(readGameConfig(dir)).toMatchObject({ id: 'quebrado', name: 'quebrado' });
  });

  it('preserva campos desconhecidos do cortex.json', () => {
    const dir = project('extra', { engine: 'cortex-game-engine', id: 'extra', custom: 42 });
    expect(readGameConfig(dir)).toMatchObject({ id: 'extra', custom: 42 });
  });
});
