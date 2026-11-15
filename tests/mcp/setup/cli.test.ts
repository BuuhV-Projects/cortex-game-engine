/**
 * CLI `cortex-setup` (SPEC-0738): flags, códigos de saída e o relatório.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultResources,
  EXIT_MISSING,
  EXIT_OK,
  EXIT_SETUP_ERROR,
  main,
  parseArgs,
  writeReportFile,
  type CliDeps,
} from '../../../mcp/setup/cli.js'
import { addArgs, removeArgs } from '../../../mcp/setup/registerMcp.js'
import { formatReport, registerLaterCommand } from '../../../mcp/setup/report.js'
import { fail, fakeMachine, type FakeSpec } from './fakeMachine.mjs'

const EXE = 'C:\\Studio\\TS Cortex Studio.exe'
const RESOURCES = 'C:\\Studio\\resources'
const CLAUDE = 'C:\\bin\\claude.exe'
const key = (cmd: string, args: readonly string[]) => [cmd, ...args].join(' ')

const CLAUDE_OK = { 'where claude': CLAUDE, [`${CLAUDE} --version`]: '2.0.5 (Claude Code)' }

function cli(spec: FakeSpec = {}) {
  const out: string[] = []
  const err: string[] = []
  const reports: Record<string, string> = {}
  const deps: CliDeps = {
    ...fakeMachine(spec),
    exe: EXE,
    resources: RESOURCES,
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    writeReport: (p, t) => (reports[p] = t),
  }
  return { deps, out, err, reports }
}

describe('parseArgs', () => {
  it('sem ação = --check; flags combinam', () => {
    expect(parseArgs([])).toMatchObject({ check: true, register: false })
    expect(parseArgs(['--check', '--register', '--report', 'r.txt'])).toMatchObject({ check: true, register: true, report: 'r.txt' })
  })

  it('erros de uso', () => {
    expect(() => parseArgs(['--report'])).toThrow()
    expect(() => parseArgs(['--register', '--unregister'])).toThrow()
    expect(() => parseArgs(['--nope'])).toThrow()
  })
})

describe('main: códigos de saída', () => {
  it('0: Claude Code ok e MCP registrado, mesmo sem Blender/Git', () => {
    const { deps, out } = cli({ commands: { ...CLAUDE_OK, [key(CLAUDE, addArgs({ exe: EXE, resources: RESOURCES }))]: 'Added' } })
    expect(main(['--check', '--register'], deps)).toBe(EXIT_OK)
    expect(out.join('')).toContain('✓ MCP cortex registrado')
    expect(out.join('')).toContain('✗ Blender')
  })

  it('1: sem Claude Code, registro pendente com o comando para depois', () => {
    const { deps, out } = cli({ commands: { 'where claude': fail() } })
    expect(main(['--check', '--register'], deps)).toBe(EXIT_MISSING)
    const text = out.join('')
    expect(text).toContain('falta o Claude Code')
    expect(text).toContain(`"${EXE}"`)
    expect(text).toContain('--register')
  })

  it('1: registro falhou', () => {
    const { deps } = cli({ commands: CLAUDE_OK })
    expect(main(['--register'], deps)).toBe(EXIT_MISSING)
  })

  it('--unregister é best-effort: 0 mesmo sem Claude Code', () => {
    expect(main(['--unregister'], cli().deps)).toBe(EXIT_OK)
    const { deps, out } = cli({ commands: { 'where claude': CLAUDE, [key(CLAUDE, removeArgs())]: 'Removed' } })
    expect(main(['--unregister'], deps)).toBe(EXIT_OK)
    expect(out.join('')).toContain('removido')
  })

  it('2: erro do próprio setup (flag inválida ou exceção)', () => {
    const bad = cli()
    expect(main(['--nope'], bad.deps)).toBe(EXIT_SETUP_ERROR)
    expect(bad.err.join('')).toContain('flag desconhecida')
    const boom = cli()
    boom.deps.run = () => {
      throw new Error('spawn quebrou')
    }
    expect(main(['--check'], boom.deps)).toBe(EXIT_SETUP_ERROR)
  })
})

describe('main: saída e relatório', () => {
  it('--report grava o mesmo texto do stdout', () => {
    const { deps, out, reports } = cli({ commands: CLAUDE_OK })
    main(['--check', '--report', 'C:\\Studio\\requisitos.txt'], deps)
    expect(reports['C:\\Studio\\requisitos.txt']).toBe(out.join(''))
  })

  it('--json traz os itens e o código', () => {
    const { deps, out } = cli({ commands: CLAUDE_OK })
    main(['--check', '--json'], deps)
    const json = JSON.parse(out.join(''))
    expect(json.exitCode).toBe(EXIT_OK)
    expect(json.requirements.map((r: { id: string }) => r.id)).toEqual(['claude-code', 'blender', 'git'])
  })

  it('relatório: ✓/✗, link só de quem falta, caminho de quem achou', () => {
    const { deps, out } = cli({ commands: CLAUDE_OK })
    main(['--check'], deps)
    const text = out.join('')
    expect(text).toContain('✓ Claude Code (obrigatório para IA): Claude Code 2.0.5 ok.')
    expect(text).toContain(`caminho: ${CLAUDE}`)
    expect(text).toContain('instalar: https://www.blender.org/download/')
    expect(text).toContain('instalar: https://git-scm.com/downloads')
    expect(text).not.toContain('instalar: https://docs.claude.com')
  })

  it('comando para registrar depois, por plataforma', () => {
    expect(registerLaterCommand('win32', EXE, 's.mjs')).toBe(`set ELECTRON_RUN_AS_NODE=1 && "${EXE}" "s.mjs" --register`)
    expect(registerLaterCommand('linux', '/opt/studio', 's.mjs')).toBe('ELECTRON_RUN_AS_NODE=1 "/opt/studio" "s.mjs" --register')
    expect(formatReport({ requirements: null, registration: null, unregistration: null, registerLaterCommand: '' })).toBe('\n')
  })
})

describe('sistema', () => {
  let dir: string | null = null
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('relatório em UTF-16LE com BOM e CRLF (o que o NSIS lê)', () => {
    dir = mkdtempSync(join(tmpdir(), 'cortex-setup-'))
    const file = join(dir, 'requisitos.txt')
    writeReportFile(file, '✓ ação\nok\n')
    const bytes = readFileSync(file)
    expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xfe])
    expect(bytes.subarray(2).toString('utf16le')).toBe('✓ ação\r\nok\r\n')
  })

  it('resources: CORTEX_RESOURCES ou a pasta acima de resources/mcp', () => {
    expect(defaultResources({ CORTEX_RESOURCES: 'X:\\res' }, 'C:\\a\\resources\\mcp\\cortex-setup.mjs')).toBe('X:\\res')
    expect(defaultResources({}, join('C:\\a', 'resources', 'mcp', 'cortex-setup.mjs'))).toBe(join('C:\\a', 'resources'))
  })
})
