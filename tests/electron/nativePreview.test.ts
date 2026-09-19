/**
 * Testes do preview nativo (electron/nativePreview.ts, SPEC-0201): separação
 * entre linhas do canal e logs do host, reenvio da geometria no `ack`, e
 * encerramento sem deixar processo (a janela órfã do Stop).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { NativePreview, type IdeMessage } from '../../electron/nativePreview.js';

// ── Processo falso, no lugar do host ─────────────────────────────────────────
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { writable: true, write: vi.fn() };
  exitCode: number | null = null;
  kill = vi.fn(() => { this.exitCode = 0; return true; });
}

let child: FakeChild;

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => child),
}));
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
}));

/** Linha do canal como o host escreve (prefixada). */
function ideLine(message: IdeMessage): Buffer {
  return Buffer.from(`@cortex-ide@${JSON.stringify(message)}\n`);
}

const OPTIONS = { exportDir: 'D:/export', parentHwnd: 123456n };

beforeEach(() => {
  child = new FakeChild();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('NativePreview', () => {
  it('sobe o host e reporta que está rodando', () => {
    const preview = new NativePreview();
    expect(preview.running).toBe(false);
    preview.start(OPTIONS);
    expect(preview.running).toBe(true);
  });

  it('separa mensagem do canal de log comum do host', () => {
    const messages: IdeMessage[] = [];
    const logs: string[] = [];
    const preview = new NativePreview();
    preview.start({ ...OPTIONS, onMessage: (m) => messages.push(m), onLog: (l) => logs.push(l) });

    child.stdout.emit('data', Buffer.from('[js] carregando fase\n'));
    child.stdout.emit('data', ideLine({ type: 'state', nodes: [] }));

    expect(logs).toEqual(['[js] carregando fase']);
    expect(messages).toEqual([{ type: 'state', nodes: [] }]);
  });

  it('remonta linha partida entre dois chunks do stdout', () => {
    const messages: IdeMessage[] = [];
    const preview = new NativePreview();
    preview.start({ ...OPTIONS, onMessage: (m) => messages.push(m) });

    child.stdout.emit('data', Buffer.from('@cortex-ide@{"type":"st'));
    child.stdout.emit('data', Buffer.from('ate","nodes":[]}\n'));

    expect(messages).toEqual([{ type: 'state', nodes: [] }]);
  });

  it('linha do canal com JSON inválido é ignorada, sem derrubar', () => {
    const messages: IdeMessage[] = [];
    const preview = new NativePreview();
    preview.start({ ...OPTIONS, onMessage: (m) => messages.push(m) });

    expect(() => child.stdout.emit('data', Buffer.from('@cortex-ide@{quebrado\n'))).not.toThrow();
    expect(messages).toEqual([]);
  });

  it('envia a geometria como mensagem bounds', () => {
    const preview = new NativePreview();
    preview.start(OPTIONS);

    preview.setBounds(10, 20, 800, 600);

    expect(child.stdin.write).toHaveBeenCalledWith(
      `${JSON.stringify({ type: 'bounds', x: 10, y: 20, width: 800, height: 600 })}\n`,
    );
  });

  it('REENVIA a geometria quando o host confirma o ack', () => {
    const preview = new NativePreview();
    preview.start(OPTIONS);
    // O painel é medido antes do JS do host subir: o primeiro bounds se perde.
    preview.setBounds(10, 20, 800, 600);
    child.stdin.write.mockClear();

    child.stdout.emit('data', ideLine({ type: 'ack', protocol: 1 }));

    expect(child.stdin.write).toHaveBeenCalledTimes(1);
    expect(String(child.stdin.write.mock.calls[0]![0])).toContain('"type":"bounds"');
  });

  it('stop encerra o processo e é idempotente (sem janela órfã)', () => {
    const preview = new NativePreview();
    preview.start(OPTIONS);

    preview.stop();
    preview.stop();

    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(preview.running).toBe(false);
  });

  it('passa a fase como CORTEX_LAUNCH_QUERY (troca de fase, SPEC-0205)', async () => {
    const { spawn } = await import('node:child_process');
    const preview = new NativePreview();

    preview.start({ ...OPTIONS, launchQuery: 'level=space-1' });

    const env = vi.mocked(spawn).mock.calls[0]![2]!.env as Record<string, string>;
    expect(env['CORTEX_LAUNCH_QUERY']).toBe('level=space-1');
    expect(env['CORTEX_PARENT_HWND']).toBe('123456');
  });

  it('restart sobe de novo na fase pedida, mantendo o resto das opcoes', async () => {
    const { spawn } = await import('node:child_process');
    const preview = new NativePreview();
    preview.start({ ...OPTIONS, launchQuery: 'level=space-1' });

    child = new FakeChild(); // o processo novo do restart
    preview.restart('level=aqua-2');

    const env = vi.mocked(spawn).mock.calls[1]![2]!.env as Record<string, string>;
    expect(env['CORTEX_LAUNCH_QUERY']).toBe('level=aqua-2');
    expect(env['CORTEX_PARENT_HWND']).toBe('123456'); // mesma janela pai
  });

  it('restart sem start anterior é no-op (nada a reiniciar)', async () => {
    const { spawn } = await import('node:child_process');
    new NativePreview().restart('level=x');
    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
  });

  it('start recusa pasta sem launcher.exe', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    const preview = new NativePreview();
    expect(() => preview.start(OPTIONS)).toThrow(/launcher\.exe/);
  });
});
