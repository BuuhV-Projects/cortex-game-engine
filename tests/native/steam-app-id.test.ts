/**
 * App id da Steam como DADO do projeto (ADR-0174).
 *
 * Duas garantias: `steamAppIdOf` normaliza o campo do cortex.json, e o export
 * `--steam` RECUSA build sem app id — o portão que impede um artefato subir pro
 * app errado. O host (core/game_config.cpp) espelha a mesma normalização; se ela
 * mudar aqui, mude lá também.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — módulo .mjs sem tipos (script de build nativo)
import { steamAppIdOf } from '../../native/scripts/game-config.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const exportScript = path.join(repoRoot, 'native', 'scripts', 'export-game.mjs');

let base: string;
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-steam-'));
});
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

/** Projeto mínimo que o export aceita como entrada (precisa de main.ts). */
function project(slug: string, cortex?: unknown): string {
  const dir = path.join(base, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'main.ts'), '// vazio\n');
  if (cortex !== undefined) {
    fs.writeFileSync(path.join(dir, 'cortex.json'), JSON.stringify(cortex, null, 2));
  }
  return dir;
}

/** Roda o export e devolve status + stderr (nunca lança). */
function runExport(gameDir: string, args: string[]): { status: number; stderr: string } {
  try {
    execFileSync(process.execPath, [exportScript, gameDir, ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stderr?: string };
    return { status: e.status ?? -1, stderr: e.stderr ?? '' };
  }
}

describe('steamAppIdOf', () => {
  it('número inteiro positivo passa', () => {
    expect(steamAppIdOf({ steamAppId: 480 })).toBe(480);
  });

  it('string de dígitos passa como número (id digitado entre aspas no Studio)', () => {
    expect(steamAppIdOf({ steamAppId: '480' })).toBe(480);
  });

  it('string com espaços em volta é tolerada', () => {
    expect(steamAppIdOf({ steamAppId: '  480  ' })).toBe(480);
  });

  it('ausente/vazio/nulo → null', () => {
    expect(steamAppIdOf({})).toBeNull();
    expect(steamAppIdOf({ steamAppId: '' })).toBeNull();
    expect(steamAppIdOf({ steamAppId: '   ' })).toBeNull();
    expect(steamAppIdOf({ steamAppId: null })).toBeNull();
    expect(steamAppIdOf(undefined)).toBeNull();
  });

  it('zero é o sentinela de "não declarado" no host — nunca vale como id', () => {
    expect(steamAppIdOf({ steamAppId: 0 })).toBeNull();
    expect(steamAppIdOf({ steamAppId: '0' })).toBeNull();
  });

  it('negativo, decimal e notação científica → null', () => {
    expect(steamAppIdOf({ steamAppId: -480 })).toBeNull();
    expect(steamAppIdOf({ steamAppId: 480.5 })).toBeNull();
    expect(steamAppIdOf({ steamAppId: '1e5' })).toBeNull();
  });

  it('texto que não é número → null', () => {
    expect(steamAppIdOf({ steamAppId: 'meu-jogo' })).toBeNull();
    expect(steamAppIdOf({ steamAppId: '480abc' })).toBeNull();
    expect(steamAppIdOf({ steamAppId: true })).toBeNull();
  });
});

describe('export --steam: portão do app id', () => {
  it('projeto SEM steamAppId falha, apontando onde configurar', () => {
    const dir = project('sem-steam', { engine: 'cortex-game-engine', id: 'sem-steam' });
    const { status, stderr } = runExport(dir, ['--steam']);
    expect(status).toBe(1);
    expect(stderr).toContain('App ID da Steam');
    expect(stderr).toContain('Configurações do jogo');
  });

  it('app id inválido falha igual (não é tratado como ausente silencioso)', () => {
    const dir = project('id-ruim', { id: 'id-ruim', steamAppId: 'abc' });
    expect(runExport(dir, ['--steam']).status).toBe(1);
  });

  it('sem --steam o campo é ignorado — export PC não exige app id', () => {
    const dir = project('so-pc', { engine: 'cortex-game-engine', id: 'so-pc' });
    // Passa do portão e morre adiante (host não buildado): o que importa é que a
    // mensagem NÃO é a do app id.
    const { stderr } = runExport(dir, []);
    expect(stderr).not.toContain('App ID da Steam');
  });

  // O caminho FELIZ (app id válido → portão libera) não é testado por aqui de
  // propósito: liberado o portão, o export segue e faz o trabalho pesado, então
  // o teste passaria a depender de haver um host buildado na máquina. A garantia
  // equivalente está em `steamAppIdOf` ("número inteiro positivo passa").
});
