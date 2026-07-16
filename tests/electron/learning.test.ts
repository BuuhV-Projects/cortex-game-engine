/**
 * Testes do ciclo de aprendizado (electron/agent/learning.ts): baseline →
 * correções do dev no overlay → diff semântico → baseline atualizado → diff
 * vazio. Projeto sintético em diretório temporário.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  saveBaseline,
  diffCorrections,
  detectPendingCorrections,
  baselineOverlay,
  checkRuleAgainstBaseline,
  type Baseline,
} from '../../electron/agent/learning.js'

let root: string

const scene = {
  version: 1,
  nodes: [
    { type: 'model', id: 'hazard_1', url: 'assets/k/bomba.glb', place: { x: 2, y: 0 } },
    { type: 'model', id: 'arvore_1', url: 'assets/k/arvore.glb', place: { x: 8, y: 0 } },
    { type: 'primitive', id: 'chao', shape: 'box', size: [20, 1, 4], transform: { position: [0, -0.5, 0] } },
  ],
}
const kit = {
  version: 1,
  name: 'k',
  assets: {
    'assets/k/bomba.glb': { role: 'hazard', size: [1, 1, 1] },
    'assets/k/arvore.glb': { role: 'decoration', size: [2, 4, 2] },
  },
}

const writeOverlay = (objects: object, data: object = {}) =>
  writeFileSync(join(root, 'assets/scene-data.json'), JSON.stringify({ version: 1, objects, data }))

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cortex-learning-'))
  mkdirSync(join(root, 'scenes'), { recursive: true })
  mkdirSync(join(root, 'assets/k'), { recursive: true })
  writeFileSync(join(root, 'scenes/level.json'), JSON.stringify(scene))
  writeFileSync(join(root, 'assets/k/kit.json'), JSON.stringify(kit))
  writeOverlay({})
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('learning (baseline + diff de correções)', () => {
  it('sem edição do dev: diff vazio e nada pendente', async () => {
    await saveBaseline(root, 'fase1', 'assets/scene-data.json')
    expect(await detectPendingCorrections(root)).toEqual([])
    const diff = await diffCorrections(root, 'fase1', 'assets/scene-data.json')
    expect(diff!.changes).toEqual([])
    expect(diff!.summary).toMatch(/Nenhuma correção/)
  })

  it('dev move hazard e roda decoração: diff agrupa por role, e detecta pendência', async () => {
    await saveBaseline(root, 'fase1', 'assets/scene-data.json')
    writeOverlay({
      hazard_1: { position: [3.5, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      arvore_1: { position: [8, 0, 0], rotation: [0, 1.2, 0], scale: [1, 1, 1] },
    })
    expect(await detectPendingCorrections(root)).toEqual(['fase1'])
    const diff = await diffCorrections(root, 'fase1', 'assets/scene-data.json')
    const moved = diff!.changes.find((c) => c.kind === 'moved')
    expect(moved).toMatchObject({ id: 'hazard_1', role: 'hazard' })
    expect(moved!.value).toBeCloseTo(1.5, 3)
    expect(diff!.changes.some((c) => c.kind === 'rotated' && c.id === 'arvore_1' && c.role === 'decoration')).toBe(true)
    expect(diff!.summary).toMatch(/hazard: 1× moved/)
  })

  it('dev deleta e adiciona nós pelo editor: diff reporta added/deleted', async () => {
    await saveBaseline(root, 'fase1', 'assets/scene-data.json')
    writeOverlay(
      {},
      {
        deleted: ['arvore_1'],
        added: [{ type: 'model', id: 'nova_bomba', url: 'assets/k/bomba.glb', place: { x: 12, y: 0 } }],
      },
    )
    const diff = await diffCorrections(root, 'fase1', 'assets/scene-data.json')
    expect(diff!.changes.some((c) => c.kind === 'deleted' && c.id === 'arvore_1')).toBe(true)
    expect(diff!.changes.some((c) => c.kind === 'added' && c.id === 'nova_bomba' && c.role === 'hazard')).toBe(true)
  })

  it('após re-salvar o baseline, o mesmo estado não gera diff nem pendência (ciclo fecha)', async () => {
    await saveBaseline(root, 'fase1', 'assets/scene-data.json')
    writeOverlay({ hazard_1: { position: [5, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } })
    expect((await diffCorrections(root, 'fase1', 'assets/scene-data.json'))!.changes.length).toBe(1)
    await saveBaseline(root, 'fase1', 'assets/scene-data.json') // aprendeu (ou vetou) → avança o marco
    expect(await detectPendingCorrections(root)).toEqual([])
    expect((await diffCorrections(root, 'fase1', 'assets/scene-data.json'))!.changes).toEqual([])
  })

  it('diff sem baseline retorna null (tool orienta criar)', async () => {
    expect(await diffCorrections(root, 'inexistente', 'assets/scene-data.json')).toBeNull()
  })
})

describe('baselineOverlay (replay do estado antigo)', () => {
  const base: Baseline = {
    version: 1,
    savedAt: '2026-07-16T00:00:00Z',
    overlay: 'assets/scene-data.json',
    overlayHash: 'x',
    scenes: ['scenes/level.json'],
    nodes: {
      keep: { p: [1, 2, 3], rotY: 0.5, s: [1, 1, 1], type: 'model', url: 'assets/k/bomba.glb', physics: 'none' },
      gone: { p: [9, 0, 0], rotY: 0, s: [2, 2, 2], type: 'model', url: 'assets/k/arvore.glb', physics: 'static', collider: '{"shape":"box"}' },
      semUrl: { p: [0, 0, 0], rotY: 0, s: [1, 1, 1], type: 'model', physics: 'none' },
    },
  }

  it('pose do baseline vira override; nó deletado pelo dev é re-adicionado; nó novo é excluído do replay', () => {
    const { overlay, unreconstructed } = baselineOverlay(base, new Set(['keep', 'novo_do_dev']))
    expect(overlay.objects!['keep']).toEqual({ position: [1, 2, 3], rotation: [0, 0.5, 0], scale: [1, 1, 1] })
    const added = overlay.data!['added'] as Array<{ id: string; collider?: object }>
    expect(added.map((n) => n.id)).toEqual(['gone'])
    expect(added[0]!.collider).toEqual({ shape: 'box' })
    expect(overlay.data!['deleted']).toEqual(['novo_do_dev'])
    // model deletado SEM url não tem como voltar — reportado, nunca silencioso.
    expect(unreconstructed).toEqual(['semUrl'])
  })
})

describe('checkRuleAgainstBaseline (regressão de regra aprendida)', () => {
  // Duas plataformas com vão de 2u; player presente (regra "gap" só roda com player).
  const gapScene = {
    version: 1,
    nodes: [
      { type: 'primitive', id: 'a', shape: 'box', size: [4, 1, 4], transform: { position: [0, 0.5, 0] }, collider: { shape: 'box' } },
      { type: 'primitive', id: 'b', shape: 'box', size: [4, 1, 4], transform: { position: [6, 0.5, 0] }, collider: { shape: 'box' } },
      { type: 'model', id: 'p', url: 'assets/k/bomba.glb', place: { x: 0, y: 1 }, player: true },
    ],
  }

  it('regra que captura a correção discrimina: reprova o antes, aprova o depois', async () => {
    writeFileSync(join(root, 'scenes/level.json'), JSON.stringify(gapScene))
    await saveBaseline(root, 'fase1', 'assets/scene-data.json') // IA entregou vão de 2u
    // Dev encurtou o vão pra 1u (pulo deste jogo é curto) → lição: maxGap 1.5.
    writeOverlay({ b: { position: [5, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } })
    const check = (await checkRuleAgainstBaseline(root, 'fase1', 'assets/scene-data.json', { maxGap: 1.5 }))!
    expect(check.before['gap']).toBe(1) // estado antigo reprova
    expect(check.after['gap'] ?? 0).toBe(0) // corrigido passa
  })

  it('regra frouxa não discrimina (antes e depois passam) — não captura a correção', async () => {
    writeFileSync(join(root, 'scenes/level.json'), JSON.stringify(gapScene))
    await saveBaseline(root, 'fase1', 'assets/scene-data.json')
    writeOverlay({ b: { position: [5, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } })
    const check = (await checkRuleAgainstBaseline(root, 'fase1', 'assets/scene-data.json', { maxGap: 5 }))!
    expect(check.before['gap'] ?? 0).toBe(0)
    expect(check.after['gap'] ?? 0).toBe(0)
  })

  it('sem baseline retorna null', async () => {
    expect(await checkRuleAgainstBaseline(root, 'nada', 'assets/scene-data.json', { maxGap: 1 })).toBeNull()
  })
})
