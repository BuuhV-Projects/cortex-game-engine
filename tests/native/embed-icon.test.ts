/**
 * Ícone + identidade no launcher.exe (ADR-0127, embed-icon.mjs).
 *
 * Cobre: (1) fallback gracioso quando o PNG não existe; (2) — no Windows, com o
 * host buildado e o toolchain instalado — o pipeline REAL: PNG → .ico
 * multi-tamanho → embute no exe, e o Windows lê de volta o ProductName. Sem host
 * buildado / fora do Windows, o teste real é pulado.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// @ts-expect-error — módulo .mjs sem tipos (script de build nativo)
import { embedIcon } from '../../native/scripts/embed-icon.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hostExe = path.join(repoRoot, 'native', 'build', 'cortex_host.exe');
const toolchainNm = path.join(repoRoot, 'native', 'export-toolchain', 'node_modules');
const canReal =
  process.platform === 'win32' &&
  fs.existsSync(hostExe) &&
  fs.existsSync(path.join(toolchainNm, 'png-to-ico')) &&
  fs.existsSync(path.join(toolchainNm, 'rcedit'));

/** PNG quadrado sólido via pngjs (do toolchain) — evita depender de fixture. */
async function makePng(dest: string, size: number): Promise<void> {
  const mod = (await import(pathToFileURL(path.join(toolchainNm, 'pngjs', 'lib', 'png.js')).href)) as any
  const PNG = mod.PNG
  const png = new PNG({ width: size, height: size })
  for (let i = 0; i < size * size; i++) {
    const o = i << 2
    png.data[o] = 90
    png.data[o + 1] = 130
    png.data[o + 2] = 200
    png.data[o + 3] = 255
  }
  fs.writeFileSync(dest, PNG.sync.write(png))
}

describe('embedIcon', () => {
  it('PNG inexistente → ok:false com motivo (não lança)', async () => {
    const r = await embedIcon('qualquer.exe', path.join(os.tmpdir(), 'nao-existe.png'), {
      productName: 'X',
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/não encontrado|encontrado/i)
  })

  it.runIf(canReal)(
    'embute ícone + ProductName e o Windows lê de volta',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-embed-'))
      try {
        const png = path.join(dir, 'icon.png')
        await makePng(png, 256)
        const exe = path.join(dir, 'launcher.exe')
        fs.copyFileSync(hostExe, exe)

        const r = await embedIcon(exe, png, { productName: 'Cute Obstacle Rush' })
        expect(r.ok).toBe(true)

        // Windows lê o version resource → prova que o rcedit gravou de verdade.
        const ps = execFileSync(
          'powershell',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `[System.Diagnostics.FileVersionInfo]::GetVersionInfo('${exe}').ProductName`,
          ],
          { encoding: 'utf8' },
        ).trim()
        expect(ps).toBe('Cute Obstacle Rush')
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    },
    30000,
  )
})
