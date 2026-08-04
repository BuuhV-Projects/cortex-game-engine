/**
 * Cópia da pasta `languages/` no export nativo (SPEC-0124 + ADR-0187).
 *
 * O que estes testes travam: a pasta vai INTEIRA e RECURSIVA pro dist. A versão
 * antiga filtrava por `.txt` na raiz, então as subpastas de assets localizados
 * (placas dos portais, dublagem por idioma) sumiam em silêncio — funcionava no
 * Studio, onde o Vite serve da raiz do projeto, e faltava no `dist-native/`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyLanguages } from '../../native/scripts/copy-languages.mjs';

let root: string;
let gameDir: string;
let dist: string;

/** Cria o arquivo (com os diretórios do caminho) e escreve `content`. */
function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-languages-'));
  gameDir = path.join(root, 'game');
  dist = path.join(root, 'dist-native');
  fs.mkdirSync(dist, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('export nativo — languages/ (ADR-0187)', () => {
  it('copia os .txt da raiz (comportamento da SPEC-0124)', () => {
    write(path.join(gameDir, 'languages', 'pt-BR.txt'), 'menu.play="Jogar"');
    write(path.join(gameDir, 'languages', 'en.txt'), 'menu.play="Play"');

    const copied = copyLanguages(gameDir, dist);

    expect(copied).toBe(2);
    expect(fs.readFileSync(path.join(dist, 'languages', 'pt-BR.txt'), 'utf8')).toBe(
      'menu.play="Jogar"',
    );
    expect(fs.existsSync(path.join(dist, 'languages', 'en.txt'))).toBe(true);
  });

  it('copia assets localizados em subpasta — o furo que este ADR fecha', () => {
    write(path.join(gameDir, 'languages', 'pt-BR.txt'), 'menu.play="Jogar"');
    // Placas dos portais: PNG por idioma, gerado pelo `yarn signs` do jogo.
    write(path.join(gameDir, 'languages', 'signs', 'pt-BR', 'fase-1.png'), 'png-pt');
    write(path.join(gameDir, 'languages', 'signs', 'en', 'fase-1.png'), 'png-en');
    // Dublagem: a voz do locutor é gravada por idioma.
    write(path.join(gameDir, 'languages', 'voice', 'pt-BR', 'vo_title.mp3'), 'mp3-pt');

    const copied = copyLanguages(gameDir, dist);

    expect(copied).toBe(4);
    expect(fs.readFileSync(path.join(dist, 'languages', 'signs', 'pt-BR', 'fase-1.png'), 'utf8')).toBe(
      'png-pt',
    );
    expect(fs.existsSync(path.join(dist, 'languages', 'signs', 'en', 'fase-1.png'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'languages', 'voice', 'pt-BR', 'vo_title.mp3'))).toBe(true);
  });

  it('não filtra por extensão — o critério é a pasta', () => {
    write(path.join(gameDir, 'languages', 'credits.md'), '# créditos');

    expect(copyLanguages(gameDir, dist)).toBe(1);
    expect(fs.existsSync(path.join(dist, 'languages', 'credits.md'))).toBe(true);
  });

  it('preserva a árvore de origem no destino (aninhamento profundo)', () => {
    const deep = path.join('voice', 'pt-BR', 'player', 'jump');
    write(path.join(gameDir, 'languages', deep, 'vo_jump_1.mp3'), 'som');

    copyLanguages(gameDir, dist);

    expect(fs.existsSync(path.join(dist, 'languages', deep, 'vo_jump_1.mp3'))).toBe(true);
  });

  it('jogo sem pasta de idiomas não quebra o export', () => {
    expect(copyLanguages(gameDir, dist)).toBe(0);
    expect(fs.existsSync(path.join(dist, 'languages'))).toBe(false);
  });

  it('sobrescreve o destino num re-export (dist reaproveitado)', () => {
    write(path.join(gameDir, 'languages', 'pt-BR.txt'), 'novo');
    write(path.join(dist, 'languages', 'pt-BR.txt'), 'antigo');

    copyLanguages(gameDir, dist);

    expect(fs.readFileSync(path.join(dist, 'languages', 'pt-BR.txt'), 'utf8')).toBe('novo');
  });
});
