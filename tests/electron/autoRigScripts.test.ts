/**
 * Scripts do Blender do auto-rig do Studio (SPEC-0724): o autoteste da derivação dos marcadores (Python puro) e o
 * que a engine pública não pode levar (ADR-0723: nada do GTA nem de dados de terceiros).
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(__dirname, '../../native/scripts/autorig')
const SCRIPTS = readdirSync(DIR).filter((f) => f.endsWith('.py'))
const MAX_LINES = 500

/** O primeiro Python do sistema que responde (`python3` no CI, `python` no Windows). */
function systemPython(): string | null {
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8', windowsHide: true })
    if (r.status === 0) return cmd
  }
  return null
}

describe('scripts do auto-rig', () => {
  it('traz as etapas skin e preview e os módulos delas', () => {
    expect(SCRIPTS.sort()).toEqual([
      'autorig_common.py',
      'autorig_markers.py',
      'autorig_offsets.py',
      'autorig_preview.py',
      'autorig_retarget.py',
      'autorig_skeleton.py',
      'autorig_skin.py',
      'autorig_weights.py',
    ])
  })

  it('nada do GTA, de dados de jogo nem caminho de máquina; até 500 linhas', () => {
    for (const f of SCRIPTS) {
      const text = readFileSync(join(DIR, f), 'utf8')
      expect(text, f).not.toMatch(/\bgta\b|San Andreas|ped\.ifp|catalog\(|[A-Z]:[\\/](jogos|Codex|ai-scripts)/i)
      expect(text.split('\n').length, f).toBeLessThanOrEqual(MAX_LINES)
    }
  })

  it.runIf(systemPython())('autoteste dos marcadores (as frações do LUC-01)', () => {
    const r = spawnSync(systemPython()!, ['-I', join(DIR, 'autorig_markers.py'), '--selftest'], { encoding: 'utf8', windowsHide: true })
    expect(r.stderr).toBe('')
    expect(r.stdout).toMatch(/autoteste ok/)
  })
})
