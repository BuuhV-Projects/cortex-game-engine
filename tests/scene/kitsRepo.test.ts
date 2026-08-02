/**
 * Integridade dos kits versionados em `kits/` (ADR-0053). Os `kit.json` são dados
 * de produção — a IDE e o Chat IA raciocinam em cima deles, e um manifesto quebrado
 * (schema inválido, .glb/thumb faltando, role fora do vocabulário) só apareceria em
 * runtime. Aqui valida-se o conjunto inteiro de uma vez.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseKit } from '../../src/scene/Kit.js';

const KITS_DIR = 'kits';

/** Vocabulário canônico de `role` (ADR-0053 §6) — `role` é string livre no schema. */
const ROLES = new Set([
  'ground', 'platform', 'connector', 'prop', 'hazard', 'collectible', 'decoration',
  'cap', 'tile', 'player-start', 'character', 'enemy', 'rig', 'character-part', 'background',
]);

/** Função de design (ADR-0053 §6). */
const GAMEPLAY_ROLES = new Set([
  'guidance', 'reward', 'challenge', 'safe-zone', 'landmark', 'cover', 'resource',
  'path', 'hazard', 'player',
]);

const kitDirs = readdirSync(KITS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(KITS_DIR, d.name, 'kit.json')))
  .map((d) => d.name);

describe('kits/ versionados', () => {
  it('acha pelo menos um kit', () => {
    expect(kitDirs.length).toBeGreaterThan(0);
  });

  describe.each(kitDirs)('%s', (name) => {
    const dir = join(KITS_DIR, name);
    const manifest = parseKit(JSON.parse(readFileSync(join(dir, 'kit.json'), 'utf8')));

    it('passa no schema do parseKit', () => {
      expect(manifest).not.toBeNull();
    });

    it('tem `name` igual ao nome da pasta', () => {
      expect(manifest!.name).toBe(name);
    });

    it('referencia .glb e thumbnails que existem em disco', () => {
      const faltando = Object.entries(manifest!.assets).flatMap(([path, a]) => [
        ...(existsSync(join(dir, path)) ? [] : [path]),
        ...(!a.thumb || existsSync(join(dir, a.thumb)) ? [] : [a.thumb]),
      ]);
      expect(faltando).toEqual([]);
    });

    it('usa apenas roles e gameplayRoles do vocabulário canônico', () => {
      const fora = Object.entries(manifest!.assets).flatMap(([path, a]) => [
        ...(ROLES.has(a.role) ? [] : [`${path}: role=${a.role}`]),
        ...(a.gameplayRole ?? [])
          .filter((g) => !GAMEPLAY_ROLES.has(g))
          .map((g) => `${path}: gameplayRole=${g}`),
      ]);
      expect(fora).toEqual([]);
    });

    it('tem bbox positivo em todo asset dimensionável', () => {
      // Planos são assets legítimos e aparecem nas DUAS orientações: decal
      // deitado no chão (água, sombra — zera a ALTURA) e billboard em pé
      // (vórtice, mandala, brilho, grama do portals-warp — zera a PROFUNDIDADE).
      // Degenerado é ter menos de duas dimensões: aí não sobra nem superfície.
      const ruins = Object.entries(manifest!.assets)
        .filter(([, a]) => a.size)
        .filter(([, a]) => a.size!.some((n) => n < 0) || a.size!.filter((n) => n > 0).length < 2)
        .map(([path, a]) => `${path}: ${a.size!.join('x')}`);
      expect(ruins).toEqual([]);
    });
  });
});
