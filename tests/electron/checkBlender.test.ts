/**
 * Testes da pré-checagem de Blender (SPEC-0181 §4b).
 *
 * Blender é pré-requisito duro das skills de kit/fase: a resolução precisa achar
 * o executável nos três caminhos (BLENDER_PATH, PATH, instalação padrão) e, o mais
 * importante, **falhar** quando não houver — é o que faz a skill parar em vez de
 * entregar kit não medido ou fase não validada.
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname, sep } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
// @ts-expect-error — script .mjs do plugin, sem tipos
import { findBlender } from '../../.claude/scripts/check-blender.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'scripts', 'check-blender.mjs')
const nunca = () => false
const sempre = () => true

describe('findBlender', () => {
  it('usa BLENDER_PATH quando aponta para um arquivo existente', () => {
    const dir = mkdtempSync(join(tmpdir(), 'blender-'))
    const exe = join(dir, 'blender.exe')
    writeFileSync(exe, '')
    expect(findBlender({ BLENDER_PATH: exe }, 'win32', nunca)).toBe(exe)
  })

  it('não cai em fallback silencioso quando BLENDER_PATH aponta para o nada', () => {
    // Configuração errada tem que doer: cair no PATH esconderia o engano e faria
    // o pipeline rodar com uma versão diferente da que o usuário quis fixar.
    expect(findBlender({ BLENDER_PATH: 'C:/nao/existe/blender.exe' }, 'win32', sempre)).toBeNull()
  })

  it('aceita o executável do PATH quando não há BLENDER_PATH', () => {
    expect(findBlender({}, 'win32', (cmd: string) => cmd === 'blender.exe')).toBe('blender.exe')
  })

  it('varre a raiz de instalação e prefere a versão mais nova', () => {
    const base = mkdtempSync(join(tmpdir(), 'blender-root-'))
    // Simula duas instalações lado a lado; a resolução tem que pegar a 5.1.
    for (const v of ['Blender 4.2', 'Blender 5.1']) {
      mkdirSync(join(base, v), { recursive: true })
      writeFileSync(join(base, v, 'blender.exe'), '')
    }
    expect(findBlender({}, 'win32', nunca, [base])).toContain(`Blender 5.1${sep}blender.exe`)
  })

  it('devolve null quando não há Blender em lugar nenhum', () => {
    // Raízes injetadas: sem isso o teste passaria/falharia conforme a máquina
    // que roda a suíte tivesse ou não Blender instalado.
    expect(findBlender({}, 'win32', nunca, [])).toBeNull()
  })
})

describe('script de checagem (contrato de saída)', () => {
  it('sai com código 1 e explica como resolver quando o Blender falta', () => {
    let status = 0
    let stderr = ''
    try {
      execFileSync(process.execPath, [SCRIPT], {
        env: { ...process.env, BLENDER_PATH: 'C:/nao/existe/blender.exe', PATH: '' },
        encoding: 'utf-8',
      })
    } catch (err) {
      const e = err as { status?: number; stderr?: string }
      status = e.status ?? 0
      stderr = e.stderr ?? ''
    }
    // O `|| exit 1` das skills depende deste código de saída.
    expect(status).toBe(1)
    expect(stderr).toContain('BLENDER AUSENTE')
    expect(stderr).toContain('BLENDER_PATH')
    expect(stderr).toContain('PARE')
  })
})
