/**
 * Limpeza da pasta de export (ADR-0101, fs-clean.mjs).
 *
 * O bug original: no Windows o export apagava dist-native inteira e recriava —
 * o SO deixava o NOME em "delete pending" enquanto um handle não soltava, e o
 * mkdir seguinte estourava EPERM (crash cru no usuário). O fix é ESVAZIAR o
 * conteúdo e manter o diretório-raiz vivo. Estes testes travam esse contrato:
 * (1) cria se falta, (2) esvazia o conteúdo SEM apagar a raiz, (3) recursivo,
 * (4) um lock de verdade propaga (pro guardLocks traduzir).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error — módulo .mjs sem tipos (script de build nativo)
import { prepareDist } from '../../native/scripts/fs-clean.mjs';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-fsclean-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('prepareDist', () => {
  it('cria a pasta quando ela não existe', () => {
    const dist = path.join(tmp, 'dist-native');
    expect(fs.existsSync(dist)).toBe(false);
    prepareDist(dist);
    expect(fs.existsSync(dist)).toBe(true);
    expect(fs.readdirSync(dist)).toEqual([]);
  });

  it('esvazia o conteúdo mas MANTÉM o diretório-raiz (sem delete-pending)', () => {
    const dist = path.join(tmp, 'dist-native');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'game.exe'), 'x');
    fs.writeFileSync(path.join(dist, 'boot.hbc'), 'y');

    prepareDist(dist);

    // a raiz continua existindo — nunca entra em delete-pending
    expect(fs.existsSync(dist)).toBe(true);
    expect(fs.readdirSync(dist)).toEqual([]);
  });

  it('remove subpastas recursivamente', () => {
    const dist = path.join(tmp, 'dist-native');
    fs.mkdirSync(path.join(dist, 'assets', 'kits'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'assets', 'kits', 'a.glb'), 'z');

    prepareDist(dist);

    expect(fs.existsSync(dist)).toBe(true);
    expect(fs.readdirSync(dist)).toEqual([]);
  });

  it('propaga o lock quando uma entrada está TRAVADA (pro guardLocks tratar)', () => {
    const dist = path.join(tmp, 'dist-native');
    // io fake: lista uma entrada e simula o exe do jogo aberto segurando o arquivo
    const io = {
      existsSync: () => true,
      readdirSync: () => ['game.exe'],
      rmSync: () => {
        const err: NodeJS.ErrnoException = new Error('EPERM: operation not permitted');
        err.code = 'EPERM';
        throw err;
      },
    } as unknown as typeof fs;

    expect(() => prepareDist(dist, io)).toThrow(/EPERM/);
  });
});
