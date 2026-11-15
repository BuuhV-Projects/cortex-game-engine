/**
 * Requisitos do `cortex-setup` (SPEC-0738): Claude Code ≥ 2.0, Blender ≥ 4.0 e Git.
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkBlender,
  checkClaude,
  checkGit,
  checkRequirements,
  meetsMinimum,
  parseVersion,
  requiredOk,
} from '../../../mcp/setup/requirements.js'
import { fail, fakeMachine, PROGRAM_FILES } from './fakeMachine.mjs'

const CLAUDE_EXE = 'C:\\Users\\dev\\.local\\bin\\claude.exe'
const GIT_EXE = 'C:\\Program Files\\Git\\cmd\\git.exe'
const FOUNDATION = join(PROGRAM_FILES, 'Blender Foundation')
const BLENDER_45 = join(FOUNDATION, 'Blender 4.5', 'blender.exe')
const BLENDER_36 = join(FOUNDATION, 'Blender 3.6', 'blender.exe')

describe('parseVersion / meetsMinimum', () => {
  it('lê a versão das saídas reais', () => {
    expect(parseVersion('2.0.14 (Claude Code)')).toBe('2.0.14')
    expect(parseVersion('Blender 4.2.0\n\tbuild date: 2024')).toBe('4.2.0')
    expect(parseVersion('git version 2.45.1.windows.1')).toBe('2.45.1')
    expect(parseVersion('sem versão')).toBeNull()
  })

  it('compara parte a parte', () => {
    expect(meetsMinimum('2.0', [2, 0])).toBe(true)
    expect(meetsMinimum('10.1.0', [4, 0])).toBe(true)
    expect(meetsMinimum('1.9.99', [2, 0])).toBe(false)
  })
})

describe('Claude Code', () => {
  it('encontrado e na versão', () => {
    const m = fakeMachine({ commands: { 'where claude': CLAUDE_EXE, [`${CLAUDE_EXE} --version`]: '2.1.3 (Claude Code)' } })
    const r = checkClaude(m)
    expect(r).toMatchObject({ found: true, ok: true, version: '2.1.3', path: CLAUDE_EXE, level: 'required-for-ai' })
  })

  it('ausente: link de instalação e não ok', () => {
    const r = checkClaude(fakeMachine({ commands: { 'where claude': fail() } }))
    expect(r).toMatchObject({ found: false, ok: false, path: null, version: null })
    expect(r.installUrl).toMatch(/^https:\/\//)
    expect(r.message).toContain('não encontrado')
  })

  it('versão velha: encontrado mas não ok', () => {
    const m = fakeMachine({ commands: { 'where claude': CLAUDE_EXE, [`${CLAUDE_EXE} --version`]: '1.0.120 (Claude Code)' } })
    const r = checkClaude(m)
    expect(r).toMatchObject({ found: true, ok: false, version: '1.0.120', minVersion: '2.0' })
    expect(r.message).toContain('antigo')
  })

  it('.cmd do npm roda pelo shell', () => {
    const cmd = 'C:\\Users\\dev\\AppData\\Roaming\\npm\\claude.cmd'
    const m = fakeMachine({
      commands: { 'where claude': `C:\\Users\\dev\\AppData\\Roaming\\npm\\claude\r\n${cmd}`, [`${cmd} --version`]: '2.0.0' },
    })
    expect(checkClaude(m)).toMatchObject({ ok: true, path: cmd })
    expect(m.calls.at(-1)).toMatchObject({ shell: true })
  })
})

describe('Blender', () => {
  it('achado pelo blenderLocate (maior versão instalada)', () => {
    const m = fakeMachine({
      files: [BLENDER_45, BLENDER_36],
      dirs: { [FOUNDATION]: ['Blender 3.6', 'Blender 4.5'] },
      commands: { [`${BLENDER_45} --version`]: 'Blender 4.5.1 LTS' },
    })
    expect(checkBlender(m)).toMatchObject({ found: true, ok: true, version: '4.5.1', path: BLENDER_45, level: 'recommended' })
  })

  it('BLENDER_PATH do ambiente tem vez', () => {
    const custom = 'D:\\tools\\blender\\blender.exe'
    const m = fakeMachine({
      env: { ProgramFiles: PROGRAM_FILES, BLENDER_PATH: custom },
      files: [custom],
      commands: { [`${custom} --version`]: 'Blender 4.0.0' },
    })
    expect(checkBlender(m)).toMatchObject({ ok: true, path: custom })
  })

  it('ausente no Windows', () => {
    const r = checkBlender(fakeMachine())
    expect(r).toMatchObject({ found: false, ok: false })
    expect(r.installUrl).toContain('blender.org')
  })

  it('versão velha', () => {
    const m = fakeMachine({
      files: [BLENDER_36],
      dirs: { [FOUNDATION]: ['Blender 3.6'] },
      commands: { [`${BLENDER_36} --version`]: 'Blender 3.6.5' },
    })
    expect(checkBlender(m)).toMatchObject({ found: true, ok: false, version: '3.6.5' })
  })

  it('Linux: blender do PATH que não abre = ausente', () => {
    expect(checkBlender(fakeMachine({ platform: 'linux', env: {} }))).toMatchObject({ found: false, path: null })
  })

  it('exe instalado que não responde = encontrado, não ok', () => {
    const m = fakeMachine({ files: [BLENDER_45], dirs: { [FOUNDATION]: ['Blender 4.5'] } })
    expect(checkBlender(m)).toMatchObject({ found: true, ok: false, path: BLENDER_45 })
  })
})

describe('Git', () => {
  it('encontrado', () => {
    const m = fakeMachine({ commands: { 'where git': GIT_EXE, [`${GIT_EXE} --version`]: 'git version 2.45.1.windows.1' } })
    expect(checkGit(m)).toMatchObject({ ok: true, version: '2.45.1', minVersion: null })
  })

  it('ausente', () => {
    expect(checkGit(fakeMachine())).toMatchObject({ found: false, ok: false })
  })

  it('macOS usa which', () => {
    const m = fakeMachine({ platform: 'darwin', env: {}, commands: { 'which git': '/usr/bin/git\n', '/usr/bin/git --version': 'git version 2.39.3' } })
    expect(checkGit(m)).toMatchObject({ ok: true, path: '/usr/bin/git' })
  })
})

describe('requiredOk', () => {
  it('só o Claude Code decide; recomendados ausentes não reprovam', () => {
    const withClaude = fakeMachine({ commands: { 'where claude': CLAUDE_EXE, [`${CLAUDE_EXE} --version`]: '2.0.0' } })
    expect(requiredOk(checkRequirements(withClaude))).toBe(true)
    expect(requiredOk(checkRequirements(fakeMachine()))).toBe(false)
  })
})
