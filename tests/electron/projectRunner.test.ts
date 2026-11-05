/**
 * Play do Studio (SPEC-0693): a troca de processo não pode deixar o `close` do
 * vite ANTIGO derrubar o estado do vite NOVO — era o "Projeto parado." logo
 * antes do "VITE ready", com o processo novo órfão (Stop sem efeito).
 *
 * Os filhos são EventEmitters falsos; as dependências (spawn, envio ao
 * renderer, kill, porta) entram injetadas — nada de electron/child_process real.
 */
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { ProjectRunner, type ProjectRunnerDeps } from '../../electron/main/projectRunner.js'

/** Filho falso: `stdout`/`stderr` emitem `data`; o próprio emite `close`. */
function fakeChild(pid: number): ChildProcess {
  const child = new EventEmitter() as EventEmitter & { pid: number; stdout: EventEmitter; stderr: EventEmitter }
  child.pid = pid
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child as unknown as ChildProcess
}

function setup() {
  const children: ChildProcess[] = []
  const deps: ProjectRunnerDeps = {
    spawnVite: vi.fn(() => {
      const child = fakeChild(100 + children.length)
      children.push(child)
      return child
    }),
    send: vi.fn(),
    killTree: vi.fn(),
    freePort: vi.fn(),
    portOf: vi.fn(() => 5174),
  }
  return { runner: new ProjectRunner(deps), deps, children }
}

const sentChannels = (deps: ProjectRunnerDeps): string[] => vi.mocked(deps.send).mock.calls.map(([ch]) => ch)

describe('ProjectRunner — troca de processo', () => {
  it('ignora o close do vite antigo que chega depois do novo subir', () => {
    const { runner, deps, children } = setup()
    runner.start('D:/jogos/demo')
    runner.start('D:/jogos/demo') // segundo Play com o primeiro vivo (reload do renderer em dev)

    expect(deps.killTree).toHaveBeenCalledWith(children[0])
    // O taskkill do antigo só produz o `close` dele DEPOIS do novo já estar rodando.
    children[0]!.emit('close', null)

    expect(sentChannels(deps)).not.toContain('project:stopped')
    expect(runner.process).toBe(children[1])
  })

  it('não encaminha log do vite antigo pro Console do Play novo', () => {
    const { runner, deps, children } = setup()
    runner.start('D:/jogos/demo')
    runner.start('D:/jogos/demo')

    ;(children[0] as unknown as { stdout: EventEmitter }).stdout.emit('data', Buffer.from('velho\n'))
    ;(children[1] as unknown as { stdout: EventEmitter }).stdout.emit('data', Buffer.from('VITE ready\n'))

    expect(deps.send).not.toHaveBeenCalledWith('log', 'velho\n')
    expect(deps.send).toHaveBeenCalledWith('log', 'VITE ready\n')
  })

  it('o close do vite CORRENTE para o Play e avisa o renderer', () => {
    const { runner, deps, children } = setup()
    runner.start('D:/jogos/demo')

    children[0]!.emit('close', 1)

    expect(sentChannels(deps)).toContain('project:stopped')
    expect(runner.process).toBeNull()
  })

  it('libera a porta do projeto antes de subir o vite', () => {
    const { runner, deps } = setup()
    runner.start('D:/jogos/demo')

    expect(deps.portOf).toHaveBeenCalledWith('D:/jogos/demo')
    const freePortOrder = vi.mocked(deps.freePort).mock.invocationCallOrder[0]!
    const spawnOrder = vi.mocked(deps.spawnVite).mock.invocationCallOrder[0]!
    expect(deps.freePort).toHaveBeenCalledWith(5174)
    expect(freePortOrder).toBeLessThan(spawnOrder)
  })
})

describe('ProjectRunner — stop e quit', () => {
  it('stop mata o corrente, avisa na hora e libera a porta', () => {
    const { runner, deps, children } = setup()
    runner.start('D:/jogos/demo')
    vi.mocked(deps.freePort).mockClear()

    runner.stop()

    expect(deps.killTree).toHaveBeenCalledWith(children[0])
    expect(sentChannels(deps)).toContain('project:stopped')
    expect(deps.freePort).toHaveBeenCalledWith(5174)
    expect(runner.process).toBeNull()
  })

  it('stop sem Play ativo só libera a última porta, sem avisar o renderer', () => {
    const { runner, deps } = setup()
    runner.stop()

    expect(deps.killTree).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.freePort).not.toHaveBeenCalled()
  })

  it('um close atrasado depois do stop não emite project:stopped duas vezes', () => {
    const { runner, deps, children } = setup()
    runner.start('D:/jogos/demo')
    runner.stop()
    children[0]!.emit('close', null)

    expect(sentChannels(deps).filter((ch) => ch === 'project:stopped')).toHaveLength(1)
  })

  it('killForQuit mata à força sem avisar o renderer e libera a porta', () => {
    const { runner, deps, children } = setup()
    runner.start('D:/jogos/demo')
    vi.mocked(deps.send).mockClear()
    vi.mocked(deps.freePort).mockClear()

    runner.killForQuit()

    expect(deps.killTree).toHaveBeenCalledWith(children[0], 'SIGKILL')
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.freePort).toHaveBeenCalledWith(5174)
    expect(runner.process).toBeNull()
  })
})
