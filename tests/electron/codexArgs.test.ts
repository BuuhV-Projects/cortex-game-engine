/**
 * Argumentos do Codex CLI (SPEC-0273): o subcomando `resume` não aceita
 * `--sandbox` nem `-C` — com eles, toda retomada de sessão morria antes de
 * começar ("unexpected argument '--sandbox' found").
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getAppPath: () => '' } }))

import { buildArgs } from '../../electron/agent/codex/CodexAgentRunner.js'
import { CODEX_MODEL } from '../../src/ai/CodexClient.js'

describe('buildArgs', () => {
  it('turno novo: sandbox e pasta como opções do exec', () => {
    expect(buildArgs('/proj', 'ask', null)).toEqual([
      'exec', '--model', CODEX_MODEL, '--sandbox', 'workspace-write',
      '--skip-git-repo-check', '-C', '/proj', '--json', '-',
    ])
  })

  it('retomada: sandbox via -c, sem --sandbox nem -C, sessão antes do prompt', () => {
    expect(buildArgs('/proj', 'auto', 'thread-1')).toEqual([
      'exec', 'resume', '--model', CODEX_MODEL, '-c', 'sandbox_mode="workspace-write"',
      '--skip-git-repo-check', '--json', 'thread-1', '-',
    ])
  })

  it('modo plano retomado continua somente leitura', () => {
    const args = buildArgs('/proj', 'plan', 'thread-1')
    expect(args).toContain('sandbox_mode="read-only"')
    expect(args).not.toContain('--sandbox')
    expect(args).not.toContain('-C')
  })
})
