/**
 * Registro do MCP `cortex` pelo `claude mcp` (SPEC-0738) e a resolução `.exe`/`.cmd` do Windows.
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { quoteForCmd, resolveCommand } from '../../../mcp/setup/commands.js'
import { addArgs, mcpScriptPath, registerMcp, removeArgs, unregisterMcp } from '../../../mcp/setup/registerMcp.js'
import { fail, fakeMachine } from './fakeMachine.mjs'

const EXE = 'C:\\Program Files\\TS Cortex Studio\\TS Cortex Studio.exe'
const RESOURCES = 'C:\\Program Files\\TS Cortex Studio\\resources'
const TARGET = { exe: EXE, resources: RESOURCES }
const CLAUDE_EXE = 'C:\\Users\\dev\\.local\\bin\\claude.exe'
const CLAUDE_CMD = 'C:\\Users\\dev\\AppData\\Roaming\\npm\\claude.cmd'

const key = (cmd: string, args: readonly string[]) => [cmd, ...args].join(' ')

describe('resolveCommand', () => {
  it('prefere .exe a .cmd e ignora o shim sem extensão', () => {
    const m = fakeMachine({ commands: { 'where claude': `C:\\npm\\claude\r\n${CLAUDE_CMD}\r\n${CLAUDE_EXE}\r\n` } })
    expect(resolveCommand(m, 'claude')).toEqual({ path: CLAUDE_EXE, shell: false })
  })

  it('só .cmd: precisa de shell', () => {
    const m = fakeMachine({ commands: { 'where claude': CLAUDE_CMD } })
    expect(resolveCommand(m, 'claude')).toEqual({ path: CLAUDE_CMD, shell: true })
  })

  it('where falhou = null', () => {
    expect(resolveCommand(fakeMachine({ commands: { 'where claude': fail() } }), 'claude')).toBeNull()
  })

  it('aspas para o cmd.exe só quando precisa', () => {
    expect(quoteForCmd('mcp')).toBe('mcp')
    expect(quoteForCmd(EXE)).toBe(`"${EXE}"`)
    expect(quoteForCmd('ELECTRON_RUN_AS_NODE=1')).toBe('"ELECTRON_RUN_AS_NODE=1"')
  })
})

describe('registerMcp', () => {
  it('monta o add da SPEC: scope user, env do modo Node, exe e o bundle', () => {
    expect(addArgs(TARGET)).toEqual([
      'mcp', 'add', '--scope', 'user', 'cortex', '-e', 'ELECTRON_RUN_AS_NODE=1', '--', EXE, join(RESOURCES, 'mcp', 'cortex-mcp.mjs'),
    ])
    expect(mcpScriptPath(RESOURCES)).toBe(join(RESOURCES, 'mcp', 'cortex-mcp.mjs'))
  })

  it('.exe: remove (falha ignorada) e add, sem shell', () => {
    const m = fakeMachine({
      commands: { 'where claude': CLAUDE_EXE, [key(CLAUDE_EXE, removeArgs())]: fail('not found'), [key(CLAUDE_EXE, addArgs(TARGET))]: 'Added' },
    })
    const r = registerMcp(m, TARGET)
    expect(r).toMatchObject({ status: 'registered', claudePath: CLAUDE_EXE })
    const claudeCalls = m.calls.filter((c) => c.cmd === CLAUDE_EXE)
    expect(claudeCalls.map((c) => c.args[1])).toEqual(['remove', 'add'])
    expect(claudeCalls.every((c) => !c.shell)).toBe(true)
  })

  it('.cmd: roda pelo shell com o caminho do exe entre aspas', () => {
    const quoted = (args: string[]) => args.map(quoteForCmd)
    const m = fakeMachine({
      commands: { 'where claude': CLAUDE_CMD, [key(quoteForCmd(CLAUDE_CMD), quoted(addArgs(TARGET)))]: 'Added' },
    })
    expect(registerMcp(m, TARGET).status).toBe('registered')
    const add = m.calls.at(-1)!
    expect(add.shell).toBe(true)
    expect(add.args).toContain(`"${EXE}"`)
  })

  it('sem Claude Code: pendente, com o comando para depois', () => {
    const m = fakeMachine({ commands: { 'where claude': fail() } })
    const r = registerMcp(m, TARGET)
    expect(r).toMatchObject({ status: 'pending-claude-missing', claudePath: null })
    expect(r.command).toContain('claude mcp add --scope user cortex')
    expect(m.calls).toHaveLength(1)
  })

  it('add falhou: failed com o detalhe', () => {
    const m = fakeMachine({ commands: { 'where claude': CLAUDE_EXE, [key(CLAUDE_EXE, addArgs(TARGET))]: fail('boom') } })
    expect(registerMcp(m, TARGET)).toMatchObject({ status: 'failed', detail: 'boom' })
  })

  it('add falhou com o erro no stderr: o detalhe é o stderr, não o código de saída', () => {
    const failed = { status: 1, stdout: '', stderr: 'MCP server cortex already exists\n' }
    const m = fakeMachine({ commands: { 'where claude': CLAUDE_EXE, [key(CLAUDE_EXE, addArgs(TARGET))]: failed } })
    expect(registerMcp(m, TARGET)).toMatchObject({ status: 'failed', detail: 'MCP server cortex already exists' })
  })
})

describe('unregisterMcp', () => {
  it('remove quando registrado', () => {
    const m = fakeMachine({ commands: { 'where claude': CLAUDE_EXE, [key(CLAUDE_EXE, removeArgs())]: 'Removed' } })
    expect(unregisterMcp(m)).toEqual({ status: 'removed', claudePath: CLAUDE_EXE })
  })

  it('não registrado ou sem Claude Code: best-effort', () => {
    expect(unregisterMcp(fakeMachine({ commands: { 'where claude': CLAUDE_EXE } })).status).toBe('not-registered')
    expect(unregisterMcp(fakeMachine()).status).toBe('claude-missing')
  })
})
