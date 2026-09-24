/**
 * Turno do modo Modelagem (SPEC-0266 / SPEC-0267): preâmbulo, guarda de código
 * e portão de modelo com volta à MESMA sessão — com rodadas do Codex falsas,
 * num projeto temporário em disco.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runModelingTurn, type ModelingDeps } from '../../electron/agent/codex/modelagemTurn.js'
import { MAX_MODEL_ATTEMPTS } from '../../src/ai/modelGate.js'
import type { ValidateResult } from '../../src/ai/validateGeneratedModel.js'

let root: string
const put = (rel: string, content: string) => {
  mkdirSync(join(root, rel, '..'), { recursive: true })
  writeFileSync(join(root, rel), content)
}

function validation(materials: number): ValidateResult {
  const stats = { nodes: 1, meshes: 1, primitives: materials, materials, textures: 0, triangles: 500 }
  return {
    refino: { antes: stats, depois: stats, avisos: [], protegidos: [] },
    inspecao: { size: { largura: 4, altura: 1.4, profundidade: 2 }, triangulos: 500, materiais: [], malhas: 1 },
    previewPath: null,
    problemas: [],
  }
}

/** Rodadas falsas: cada uma executa uma ação no disco e devolve um thread. */
function fakeDeps(rounds: Array<() => void>, validate: (path: string) => ValidateResult | null) {
  const prompts: string[] = []
  const resumes: Array<string | null> = []
  const notes: string[] = []
  const deps: ModelingDeps = {
    runRound: async (prompt, resumeId) => {
      prompts.push(prompt)
      resumes.push(resumeId)
      rounds.shift()?.()
      return { threadId: 'thread-1', stats: null }
    },
    validate: async (path) => validate(path),
    notify: (text) => notes.push(text),
  }
  return { deps, prompts, resumes, notes }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'turno-modelagem-'))
  put('main.ts', 'original')
})

describe('runModelingTurn', () => {
  it('manda fronteira, regras de performance e o pedido', async () => {
    const { deps, prompts } = fakeDeps([], () => null)
    await runModelingTurn(root, 'monte uma praça', 'ask', null, deps)
    expect(prompts[0]).toContain('modo Modelagem')
    expect(prompts[0]).toContain('Você NÃO escreve código')
    expect(prompts[0]).toContain('Regras de performance')
    expect(prompts[0]).toContain('Antes de encerrar')
    expect(prompts[0]!.endsWith('monte uma praça')).toBe(true)
  })

  it('desfaz código que o Astra mexeu e avisa no chat', async () => {
    const { deps, notes } = fakeDeps([() => put('main.ts', 'MEXIDO')], () => null)
    await runModelingTurn(root, 'x', 'ask', null, deps)
    expect(readFileSync(join(root, 'main.ts'), 'utf-8')).toBe('original')
    expect(notes.join()).toMatch(/desfiz: main\.ts.*modo Codificar/)
  })

  it('modelo reprovado volta à mesma sessão com os motivos e aprova na correção', async () => {
    let materials = 20
    const { deps, prompts, resumes, notes } = fakeDeps(
      [() => put('assets/carro.glb', 'v1'), () => { materials = 6; put('assets/carro.glb', 'v2 corrigido') }],
      () => validation(materials),
    )
    await runModelingTurn(root, 'modele um carro', 'ask', 'thread-0', deps)
    expect(prompts).toHaveLength(2)
    expect(resumes).toEqual(['thread-0', 'thread-1'])
    expect(prompts[1]).toMatch(/REPROVOU[\s\S]*assets\/carro\.glb[\s\S]*20 materiais/)
    expect(notes.join('\n')).toMatch(/1 modelo\(s\) aprovado/)
  })

  it('para no limite de tentativas e lista o que segue reprovado', async () => {
    const rounds = Array.from({ length: MAX_MODEL_ATTEMPTS }, (_, i) => () => put('assets/carro.glb', `v${i}`))
    const { deps, prompts, notes } = fakeDeps(rounds, () => validation(20))
    await runModelingTurn(root, 'modele um carro', 'ask', null, deps)
    expect(prompts).toHaveLength(MAX_MODEL_ATTEMPTS)
    expect(notes.at(-1)).toMatch(/seguem reprovados depois de 3 tentativas[\s\S]*assets\/carro\.glb/)
  })

  it('não valida nada se nenhum modelo mudou', async () => {
    put('assets/pedra.glb', 'antiga')
    let validated = 0
    const { deps, prompts } = fakeDeps([() => put('scenes/level.json', '{}')], () => { validated++; return null })
    await runModelingTurn(root, 'x', 'ask', null, deps)
    expect(validated).toBe(0)
    expect(prompts).toHaveLength(1)
  })

  it('no modo plano não julga modelos (sandbox só leitura)', async () => {
    let validated = 0
    const { deps, prompts } = fakeDeps([], () => { validated++; return validation(20) })
    await runModelingTurn(root, 'planeje', 'plan', null, deps)
    expect(validated).toBe(0)
    expect(prompts[0]).toContain('MODO PLANO')
  })
})
