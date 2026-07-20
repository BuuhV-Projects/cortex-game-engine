/**
 * Testes do overlay de cena POR FASE (SPEC-0094):
 * - `sanitizeScenePath` (plugin de save): aceita caminho relativo .json e
 *   rejeita traversal/absoluto/extensão errada (segurança do endpoint).
 * - `HttpSceneFileWriter` com `path`: POST vai pro endpoint com `?path=`.
 * - `autoDetectSceneFileWriter({ path })`: propaga o caminho pro writer HTTP.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sanitizeScenePath } from '../../src/vite/sceneSavePlugin.js';
import { HttpSceneFileWriter } from '../../src/io/HttpSceneFileWriter.js';
import { autoDetectSceneFileWriter } from '../../src/io/autoDetectSceneFileWriter.js';
import { emptySceneFile } from '../../src/scene/SceneFile.js';

const FALLBACK = 'assets/scene-data.json';

describe('sanitizeScenePath', () => {
  it('sem path → fallback (target do plugin)', () => {
    expect(sanitizeScenePath(null, FALLBACK)).toBe(FALLBACK);
    expect(sanitizeScenePath(undefined, FALLBACK)).toBe(FALLBACK);
    expect(sanitizeScenePath('', FALLBACK)).toBe(FALLBACK);
  });

  it('aceita caminho relativo .json (overlay por fase)', () => {
    expect(sanitizeScenePath('assets/scene-data-fase2.json', FALLBACK)).toBe(
      'assets/scene-data-fase2.json',
    );
    expect(sanitizeScenePath('scene-data.json', FALLBACK)).toBe('scene-data.json');
    expect(sanitizeScenePath('assets/fases/fase 2.json', FALLBACK)).toBe('assets/fases/fase 2.json');
  });

  it('normaliza \\ pra /', () => {
    expect(sanitizeScenePath('assets\\scene-data-fase2.json', FALLBACK)).toBe(
      'assets/scene-data-fase2.json',
    );
  });

  it('rejeita path traversal', () => {
    expect(sanitizeScenePath('../fora.json', FALLBACK)).toBeNull();
    expect(sanitizeScenePath('assets/../../fora.json', FALLBACK)).toBeNull();
    expect(sanitizeScenePath('assets\\..\\fora.json', FALLBACK)).toBeNull();
  });

  it('rejeita absoluto/drive/extensão errada', () => {
    expect(sanitizeScenePath('/etc/passwd.json', FALLBACK)).toBeNull();
    expect(sanitizeScenePath('C:/tmp/x.json', FALLBACK)).toBeNull();
    expect(sanitizeScenePath('assets/scene.txt', FALLBACK)).toBeNull();
    expect(sanitizeScenePath('assets/scene.json?x=1', FALLBACK)).toBeNull();
  });
});

describe('HttpSceneFileWriter com path', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST com ?path= codificado quando path é passado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await new HttpSceneFileWriter(undefined, 'assets/scene-data-fase2.json').save(emptySceneFile());
    expect(fetchMock).toHaveBeenCalledWith(
      '/__save-scene-data?path=assets%2Fscene-data-fase2.json',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('POST sem query quando path não é passado (target do plugin decide)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await new HttpSceneFileWriter().save(emptySceneFile());
    expect(fetchMock).toHaveBeenCalledWith('/__save-scene-data', expect.anything());
  });
});

describe('autoDetectSceneFileWriter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('propaga o path pro writer HTTP (fora do Tauri)', async () => {
    vi.stubGlobal('window', {}); // browser "puro" (sem __TAURI__)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const writer = autoDetectSceneFileWriter({ path: 'assets/scene-data-fase2.json' });
    expect(writer).toBeInstanceOf(HttpSceneFileWriter);
    await writer!.save(emptySceneFile());
    expect(fetchMock.mock.calls[0]![0]).toContain('path=assets%2Fscene-data-fase2.json');
  });
});
