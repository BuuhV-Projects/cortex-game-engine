/**
 * Diagnóstico de lock do export (ADR-0101, who-locks.mjs).
 *
 * Quando a limpeza de dist-native falha por lock, o export pergunta ao Windows
 * Restart Manager QUEM segura o arquivo (nome + PID) em vez de chutar o jogo.
 * Aqui travamos: (1) o parse da saída do .ps1, (2) a expansão pasta→arquivos
 * (registrar a PASTA na RM zera o resultado — medido), e (3) um lock EXCLUSIVO
 * real é reportado com o PID certo (só no Windows).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error — módulo .mjs sem tipos (script de build nativo)
import { parseRmOutput, toFiles, whoLocks } from '../../native/scripts/who-locks.mjs';

const isWin = process.platform === 'win32';

describe('parseRmOutput', () => {
  it('parseia "PID\\tNome\\tTipo" com rótulo de tipo', () => {
    const out = '13748\tWindows PowerShell\t5\r\n4096\tteste4.exe\t1\r\n';
    expect(parseRmOutput(out)).toEqual([
      { pid: 13748, name: 'Windows PowerShell', kind: 'console/terminal' },
      { pid: 4096, name: 'teste4.exe', kind: 'janela' },
    ]);
  });

  it('vazio/whitespace → []', () => {
    expect(parseRmOutput('')).toEqual([]);
    expect(parseRmOutput('\r\n  \r\n')).toEqual([]);
  });

  it('tipo desconhecido cai em "app" e linha sem PID numérico é descartada', () => {
    const out = 'lixo\tsem pid\t9\r\n7\tExplorer\t99\r\n';
    expect(parseRmOutput(out)).toEqual([{ pid: 7, name: 'Explorer', kind: 'app' }]);
  });
});

describe('toFiles', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-tofiles-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('expande uma pasta nos arquivos do 1º nível (não na pasta em si)', () => {
    fs.writeFileSync(path.join(dir, 'game.exe'), 'x');
    fs.writeFileSync(path.join(dir, 'a.dll'), 'y');
    fs.mkdirSync(path.join(dir, 'assets'));

    const files = toFiles([dir]).sort();
    expect(files).toEqual([path.join(dir, 'a.dll'), path.join(dir, 'game.exe')]);
    // a própria pasta e a subpasta NUNCA entram (RM as rejeita)
    expect(files).not.toContain(dir);
    expect(files).not.toContain(path.join(dir, 'assets'));
  });

  it('mantém arquivo avulso e ignora caminho inexistente', () => {
    const f = path.join(dir, 'boot.hbc');
    fs.writeFileSync(f, 'z');
    expect(toFiles([f, path.join(dir, 'nao-existe')])).toEqual([f]);
  });
});

describe('whoLocks (Restart Manager)', () => {
  it('sem arquivos resolvíveis → [] (não chama o powershell)', () => {
    let called = false;
    const exec = (() => {
      called = true;
      return '';
    }) as unknown as typeof import('node:child_process').execFileSync;
    expect(whoLocks([path.join(os.tmpdir(), 'inexistente-xyz')], { exec })).toEqual([]);
    expect(called).toBe(false);
  });

  it.runIf(isWin)(
    'reporta o PID de quem segura o arquivo com lock EXCLUSIVO',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-lock-'));
      const file = path.join(dir, 'game.exe');
      fs.writeFileSync(file, 'x');
      // holder: abre o arquivo com FileShare.None e segura por alguns segundos
      const holder = spawn(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `$f=[System.IO.File]::Open('${file}','Open','ReadWrite','None'); Start-Sleep -Seconds 20; $f.Close()`,
        ],
        { stdio: 'ignore' },
      );
      try {
        await new Promise((r) => setTimeout(r, 2500)); // deixa o handle abrir
        const holders = whoLocks([dir]);
        expect(holders.map((h: { pid: number }) => h.pid)).toContain(holder.pid);
      } finally {
        holder.kill();
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 });
        } catch {
          /* o SO limpa o temp depois */
        }
      }
    },
    20000,
  );
});
