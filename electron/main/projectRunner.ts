/**
 * Play do Studio: o dev server (`vite`) do projeto, um processo por vez
 * (`run:start` / `run:stop`). SPEC-0693.
 *
 * O ponto delicado é a troca de processo: `start` com um vite ainda vivo mata
 * o antigo e sobe o novo, e o `close` do antigo chega DEPOIS do novo já estar
 * rodando. Cada listener compara o filho com o corrente antes de agir — saída
 * ou fechamento de um processo que não é mais o corrente é ignorada. Sem isso
 * o Console imprimia "Projeto parado." logo antes do "VITE ready", o Preview
 * marcava o projeto como parado e o processo novo ficava órfão (Stop sem efeito).
 */
import { ipcMain } from 'electron'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { envForSpawn, sendToRenderer, validatePath } from './shared.js'

/**
 * Mata o processo e toda a sua árvore de filhos.
 *
 * No Windows, `ChildProcess.kill()` mata apenas o shell (cmd.exe) spawnado
 * com `shell: true`, deixando os processos netos (ex.: vite/node) como
 * zumbis que continuam segurando portas. Usamos `taskkill /T /F` para
 * derrubar a árvore inteira. Em Unix, o kill normal já cascateia.
 */
export function killProcessTree(proc: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!proc.pid) return
  if (process.platform === 'win32') {
    // /T = mata filhos recursivamente; /F = força. spawnSync pra COMPLETAR antes
    // de seguir (senão o vite zumbi ainda segura a porta quando o próximo Play sobe).
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'])
  } else {
    proc.kill(signal)
  }
}

/** Porta do dev server do projeto (lida do vite.config; default 5174, strictPort). */
export function vitePortOf(projectDir: string): number {
  try {
    const cfg = readFileSync(join(projectDir, 'vite.config.ts'), 'utf-8')
    const m = /port:\s*(\d+)/.exec(cfg)
    if (m) return Number(m[1])
  } catch {
    /* sem vite.config legível — cai no default */
  }
  return 5174
}

/**
 * Mata QUALQUER processo escutando na `port` — garante que um vite preso/zumbi não
 * segure a porta e faça o próximo Play falhar (vite usa `strictPort`). Best-effort.
 */
export function killPort(port: number): void {
  if (!port) return
  if (process.platform === 'win32') {
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf-8' })
    const pids = new Set<string>()
    for (const line of (r.stdout ?? '').split('\n')) {
      const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/.exec(line)
      if (m && Number(m[1]) === port) pids.add(m[2]!)
    }
    for (const pid of pids) spawnSync('taskkill', ['/pid', pid, '/T', '/F'])
  } else {
    const r = spawnSync('sh', ['-c', `lsof -ti tcp:${port} 2>/dev/null || true`], { encoding: 'utf-8' })
    for (const pid of (r.stdout ?? '').split(/\s+/).filter(Boolean)) spawnSync('kill', ['-9', pid])
  }
}

/** Dependências do runner — injetadas pra testar a troca de processo com filhos falsos. */
export interface ProjectRunnerDeps {
  /** Spawna o `vite` no diretório do projeto. */
  spawnVite: (projectDir: string) => ChildProcess
  /** Envia um evento ao renderer (`log`, `project:stopped`). */
  send: (channel: string, ...args: unknown[]) => void
  /** Mata um processo e sua árvore. */
  killTree: (proc: ChildProcess, signal?: NodeJS.Signals) => void
  /** Libera a porta do dev server (mata zumbis). */
  freePort: (port: number) => void
  /** Porta do dev server do projeto. */
  portOf: (projectDir: string) => number
}

export class ProjectRunner {
  /** Processo do vite em execução (único de cada vez). */
  private current: ChildProcess | null = null
  /** Porta do último Play — pra liberar a porta (matar zumbis) no stop/quit. */
  private lastPort: number | null = null

  constructor(private readonly deps: ProjectRunnerDeps) {}

  /** Processo corrente (null = parado). */
  get process(): ChildProcess | null {
    return this.current
  }

  /** Sobe o vite do projeto; stdout/stderr vão ao renderer via `log`. */
  start(projectDir: string): void {
    // Garante que não há processo anterior pendurado
    if (this.current) {
      this.deps.killTree(this.current)
      this.current = null
    }
    // Libera a porta ANTES de subir: vite usa strictPort, então um zumbi de um Play
    // anterior (ou crash) seguraria a porta e o Play falharia. Mata quem estiver nela.
    const port = this.deps.portOf(projectDir)
    this.lastPort = port
    this.deps.freePort(port)

    const child = this.deps.spawnVite(projectDir)
    this.current = child

    // Guarda de identidade: o processo morto acima ainda emite `data`/`close`
    // depois que o novo subiu. Só o processo CORRENTE fala com o renderer.
    const forwardLog = (data: Buffer): void => {
      if (this.current !== child) return
      this.deps.send('log', data.toString())
    }
    child.stdout?.on('data', forwardLog)
    child.stderr?.on('data', forwardLog)

    child.on('close', () => {
      if (this.current !== child) return
      this.current = null
      this.deps.send('project:stopped')
    })
  }

  /** Mata o vite em execução (se houver) e avisa o renderer. */
  stop(): void {
    if (this.current) {
      this.deps.killTree(this.current)
      this.current = null
      // Emite imediatamente para o renderer — o evento 'close' do child pode demorar
      // ou não disparar em algumas plataformas após kill()
      this.deps.send('project:stopped')
    }
    // Garante a porta livre mesmo se o tree-kill não pegou o vite (zumbi segurando-a).
    if (this.lastPort) this.deps.freePort(this.lastPort)
  }

  /**
   * Shutdown do Studio: mata o vite à força, sem avisar o renderer (que já está
   * fechando), e libera a porta — senão o `vite` (neto do shell) vira órfão
   * segurando a porta e o próximo boot falha no Play.
   */
  killForQuit(): void {
    if (this.current?.pid) {
      try {
        this.deps.killTree(this.current, 'SIGKILL')
      } catch {
        /* best-effort no shutdown */
      }
    }
    this.current = null
    if (this.lastPort) this.deps.freePort(this.lastPort)
  }
}

const runner = new ProjectRunner({
  spawnVite: (projectDir) => spawn('vite', [], { cwd: projectDir, shell: true, env: envForSpawn(projectDir) }),
  send: sendToRenderer,
  killTree: killProcessTree,
  freePort: killPort,
  portOf: vitePortOf,
})

export function registerRunIpc(): void {
  // Spawna o `vite` no diretório do projeto; redireciona stdout/stderr ao renderer via 'log'
  ipcMain.handle('run:start', async (_event, projectDir: unknown) => {
    runner.start(validatePath(projectDir))
  })

  // Mata o processo filho em execução, se houver
  ipcMain.handle('run:stop', async () => {
    runner.stop()
  })
}

/** `before-quit`: mata o vite do Play sincronamente. */
export function killRunnerForQuit(): void {
  runner.killForQuit()
}
