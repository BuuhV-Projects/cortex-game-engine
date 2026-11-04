/**
 * O perfil por sistema (SPEC-0236) usa o `profileLabel` do sistema antes do nome
 * da classe: no bundle minificado o `constructor.name` vira `fx`, `DBe`… e o
 * perfil não dizia QUAL sistema come o `world` (SPEC-0671).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { System } from '../../src/ecs/System.js';

class Rotulado extends System {
  override readonly profileLabel = 'NomeLegivel';
  update(): void {}
}
/** Simula a classe minificada: só o nome da classe muda, o rótulo não. */
const Minificado = class fx extends Rotulado {};
class SemRotulo extends System {
  update(): void {}
}

describe('perfil por sistema: profileLabel', () => {
  it('acumula pelo profileLabel, não pelo nome da classe', () => {
    const world = new World();
    world.addSystem(new Minificado());
    const perfil = world.enableSystemProfile();
    world.tick(16);
    expect([...perfil.keys()]).toEqual(['NomeLegivel']);
  });

  it('sem profileLabel, cai no nome da classe', () => {
    const world = new World();
    world.addSystem(new SemRotulo());
    const perfil = world.enableSystemProfile();
    world.tick(16);
    expect([...perfil.keys()]).toEqual(['SemRotulo']);
  });

  it('todo sistema da engine em src/systems declara o profileLabel com o nome da classe', () => {
    const dir = join(__dirname, '../../src/systems');
    const semRotulo: string[] = [];
    for (const arquivo of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const texto = readFileSync(join(dir, arquivo), 'utf8');
      const classe = /^export class (\w+) extends System \{/m.exec(texto)?.[1];
      if (!classe) continue;
      if (!texto.includes(`override readonly profileLabel = '${classe}';`)) semRotulo.push(classe);
    }
    expect(semRotulo).toEqual([]);
  });
});
