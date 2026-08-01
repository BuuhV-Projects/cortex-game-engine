/**
 * Watcher de versão do Steamworks SDK (ADR-0176).
 *
 * O download do SDK é manual (login de parceiro), então o que automatizamos é a
 * DETECÇÃO, lendo o feed público de anúncios da Valve. Estes testes cobrem o
 * parsing e, principalmente, a comparação de versões — o ponto onde um erro
 * silencioso faria o bot anunciar um downgrade ou nunca avisar.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseAnnouncedVersion,
  parseSdkReadmeVersion,
  compareVersions,
  expectedVersion,
  // @ts-expect-error — módulo .mjs sem tipos (script de build nativo)
} from '../../native/scripts/steam-sdk-version.mjs';

let base: string;
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-sdkver-'));
});
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

describe('parseAnnouncedVersion (feed RSS da Valve)', () => {
  it('extrai a versão do título do anúncio', () => {
    const xml = '<title>Steamworks SDK 1.65 has been released</title>';
    expect(parseAnnouncedVersion(xml)).toBe('1.65');
  });

  it('pega a MAIOR versão, não a primeira do feed', () => {
    // A ordem do feed não é garantida, e um anúncio antigo republicado faria o
    // watcher achar que a versão regrediu.
    const xml = `
      <title>Steamworks SDK 1.64 has been released</title>
      <title>Steamworks SDK 1.65 has been released</title>
      <title>Steamworks SDK 1.62 has been released</title>`;
    expect(parseAnnouncedVersion(xml)).toBe('1.65');
  });

  it('tolera o "v" opcional', () => {
    expect(parseAnnouncedVersion('<title>Steamworks SDK v1.66 released</title>')).toBe('1.66');
  });

  it('feed sem anúncio de SDK → null (não inventa versão)', () => {
    const xml = '<title>Steam Next Fest Developer Q&amp;A Session</title>';
    expect(parseAnnouncedVersion(xml)).toBeNull();
  });

  it('entrada vazia/inválida → null', () => {
    expect(parseAnnouncedVersion('')).toBeNull();
    expect(parseAnnouncedVersion(null)).toBeNull();
    expect(parseAnnouncedVersion(undefined)).toBeNull();
  });
});

describe('parseSdkReadmeVersion (Readme.txt do SDK)', () => {
  it('lê a primeira entrada do changelog (a mais recente)', () => {
    const readme = [
      '----------------------------------------------------------------',
      'v1.65\t23th July 2026',
      '----------------------------------------------------------------',
      'Steam Machine e coisas...',
      'v1.64\t11th March 2026',
    ].join('\n');
    expect(parseSdkReadmeVersion(readme)).toBe('1.65');
  });

  it('sem entrada de versão → null', () => {
    expect(parseSdkReadmeVersion('Welcome to the Steamworks SDK.')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('compara o minor como NÚMERO, não como texto', () => {
    // Como string, "1.9" > "1.65" — e o watcher anunciaria um downgrade.
    expect(compareVersions('1.65', '1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.9', '1.65')).toBeLessThan(0);
  });

  it('iguais dão 0', () => {
    expect(compareVersions('1.65', '1.65')).toBe(0);
  });

  it('major manda sobre minor', () => {
    expect(compareVersions('2.0', '1.99')).toBeGreaterThan(0);
  });
});

describe('expectedVersion (sdk-version.txt do engine)', () => {
  it('lê a versão registrada, ignorando espaços em volta', () => {
    const file = path.join(base, 'sdk-version.txt');
    fs.writeFileSync(file, '  1.65 \n');
    expect(expectedVersion(file)).toBe('1.65');
  });

  it('tolera BOM (arquivo salvo por editor do Windows)', () => {
    const file = path.join(base, 'sdk-version.txt');
    const bom = String.fromCharCode(0xfeff); // literal seria invisível no fonte
    fs.writeFileSync(file, `${bom}1.65\n`);
    expect(expectedVersion(file)).toBe('1.65');
  });

  it('conteúdo que não é versão → null', () => {
    const file = path.join(base, 'sdk-version.txt');
    fs.writeFileSync(file, 'latest\n');
    expect(expectedVersion(file)).toBeNull();
  });

  it('arquivo ausente → null (não lança)', () => {
    expect(expectedVersion(path.join(base, 'nao-existe.txt'))).toBeNull();
  });
});
