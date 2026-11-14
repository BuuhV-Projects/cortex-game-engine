/**
 * Pastas soltas do export nativo declaradas pelo jogo (SPEC-0733 + ADR-0732).
 *
 * O que estes testes travam: `cortex.json.looseDirs` só aceita pasta relativa
 * DENTRO do jogo (sem `..`, sem absoluto), `languages` entra sempre, e cada
 * pasta declarada vai inteira e recursiva pro mesmo caminho no dist. Antes só
 * `languages/` ia, e o `radios/` do Port Hollow sumia do export em silêncio.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyLooseDirs, looseDirsOf } from '../../native/scripts/copy-loose-dirs.mjs';

let root: string;
let gameDir: string;
let dist: string;

/** Cria o arquivo (com os diretórios do caminho) e escreve `content`. */
function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-loose-'));
  gameDir = path.join(root, 'game');
  dist = path.join(root, 'dist-native');
  fs.mkdirSync(dist, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('looseDirsOf — validação do cortex.json', () => {
  it('sem looseDirs = só languages', () => {
    expect(looseDirsOf({})).toEqual(['languages']);
  });

  it('languages primeiro, declaradas depois, sem repetição e com / normalizada', () => {
    expect(looseDirsOf({ looseDirs: ['radios', 'languages', 'mods\\maps', './radios/'] })).toEqual([
      'languages',
      'radios',
      'mods/maps',
    ]);
  });

  it('recusa looseDirs que não é lista', () => {
    expect(() => looseDirsOf({ looseDirs: 'radios' })).toThrow(/lista/);
  });

  it.each([['../fora'], ['radios/../../x'], ['/abs'], ['C:\\abs'], ['C:rel'], [''], ['.'], [42]])(
    'recusa %j',
    (item) => {
      expect(() => looseDirsOf({ looseDirs: [item] })).toThrow(/looseDirs inválido/);
    },
  );
});

describe('copyLooseDirs — cópia pro dist', () => {
  it('copia a pasta declarada inteira, recursiva e sem filtro de extensão', () => {
    write(path.join(gameDir, 'radios', 'radios.json'), '{"radios":["rock"]}');
    write(path.join(gameDir, 'radios', 'rock', 'radio.json'), '{}');
    write(path.join(gameDir, 'radios', 'rock', 'track-1.mp3'), 'mp3');

    const copied = copyLooseDirs(gameDir, dist, looseDirsOf({ looseDirs: ['radios'] }));

    expect(copied).toEqual([{ dir: 'radios', files: 3 }]);
    expect(fs.readFileSync(path.join(dist, 'radios', 'rock', 'track-1.mp3'), 'utf8')).toBe('mp3');
  });

  it('subpasta declarada vai pro mesmo caminho no dist', () => {
    write(path.join(gameDir, 'mods', 'maps', 'a.json'), '{}');

    copyLooseDirs(gameDir, dist, looseDirsOf({ looseDirs: ['mods/maps'] }));

    expect(fs.existsSync(path.join(dist, 'mods', 'maps', 'a.json'))).toBe(true);
  });

  it('languages continua indo junto com as declaradas', () => {
    write(path.join(gameDir, 'languages', 'pt-BR.txt'), 'x');
    write(path.join(gameDir, 'radios', 'radios.json'), '{}');

    const copied = copyLooseDirs(gameDir, dist, looseDirsOf({ looseDirs: ['radios'] }));

    expect(copied.map((c) => c.dir)).toEqual(['languages', 'radios']);
  });

  it('pasta declarada ausente (ou arquivo no lugar) é pulada sem erro', () => {
    write(path.join(gameDir, 'notadir'), 'arquivo');

    expect(copyLooseDirs(gameDir, dist, looseDirsOf({ looseDirs: ['radios', 'notadir'] }))).toEqual([]);
    expect(fs.existsSync(path.join(dist, 'radios'))).toBe(false);
  });
});
