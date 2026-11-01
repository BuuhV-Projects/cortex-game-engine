/**
 * SPEC-0643 / SPEC-0652 — hook de contrato do export nativo do template: loader do three direto no código do jogo
 * (fora do cache por URL da engine) é ERRO.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve('templates/new-project/.claude/hooks/native-contract.mjs');
const MAIN = "import { Game } from 'cortex-game-engine';\nnew Game({ canvas, nativeRenderer: true });\n";
let dir = '';

function run(files: Record<string, string>): { status: number | null; out: string } {
  dir = mkdtempSync(join(tmpdir(), 'native-contract-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const r = spawnSync(process.execPath, [HOOK, dir], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('hook de contrato do nativo: loader fora do cache (SPEC-0652)', () => {
  it('new TextureLoader() no código do jogo é ERRO', () => {
    const r = run({ 'main.ts': MAIN, 'chao.ts': "import { TextureLoader } from 'three';\nconst t = new TextureLoader().load('a.png');\n" });
    expect(r.status).toBe(1);
    expect(r.out).toContain('new TextureLoader()');
    expect(r.out).toContain('SPEC-0652');
  });

  it('carga pelo loadTexture da engine passa', () => {
    const r = run({ 'main.ts': MAIN, 'chao.ts': "import { loadTexture } from 'cortex-game-engine';\nawait loadTexture('a.png');\n" });
    expect(r.status).toBe(0);
    expect(r.out).toContain('ERROS: nenhum');
  });

  it('loader guardado num cache por URL e marcado com native-contract: cached-loader passa', () => {
    const cached = [
      '// native-contract: cached-loader',
      "import { TextureLoader } from 'three';",
      'const cache = new Map();',
      'export const tex = (u: string) => cache.get(u) ?? cache.set(u, new TextureLoader().load(u)).get(u);',
    ].join('\n');
    const r = run({ 'main.ts': MAIN, 'chao.ts': cached });
    expect(r.status).toBe(0);
    expect(r.out).toContain('ERROS: nenhum');
  });
});
