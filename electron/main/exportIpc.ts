/**
 * Handler IPC — export CortexNative (ADR-0101: o export PC oficial). SPEC-0693.
 */
import { ipcMain, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { resourceBase, validatePath } from './shared.js'

export function registerExportIpc(): void {
  /**
   * Roda `native/scripts/export-game.mjs <projeto>` gerando `dist-native/`
   * (exe + dlls + boot.hbc + assets). Usa o próprio binário do Electron como
   * Node (`ELECTRON_RUN_AS_NODE`) — não depende de node no PATH. O host + o
   * toolchain de export vão embarcados no Studio **Windows** via
   * `electron-builder.json#win.extraResources` (TDR-0003); em dev, resolvem do
   * próprio repo. macOS/Linux não embarcam o host (D3D12/Windows-only) — lá o
   * `script` não existe e o handler informa que é só no Studio Windows.
   */
  ipcMain.handle('export:native', async (_event, projectDir: unknown, mode: unknown, debug?: unknown, outDir?: unknown, editor?: unknown) => {
    const safeDir = validatePath(projectDir)
    const script = join(resourceBase(), 'native', 'scripts', 'export-game.mjs')
    if (!existsSync(script)) {
      return {
        ok: false,
        output:
          'Export nativo (CortexNative) disponível apenas no Studio para Windows — ' +
          'o host é D3D12/Windows-only por enquanto (TDR-0003).',
      }
    }
    // Alvo do submenu Exportar ›: pc (desktop) | steam (--steam) | xbox (--xbox/GDK).
    // `debug` acrescenta --debug (HUD de métricas na tela — FPS/CPU/memória/GPU).
    const flags = mode === 'steam' ? ['--steam'] : mode === 'xbox' ? ['--xbox'] : []
    if (debug === true) flags.push('--debug')
    // `editor` inclui o modo editor (F2) no bundle — so pro PREVIEW NATIVO
    // (SPEC-0205). Export de producao jamais passa isto.
    if (editor === true) flags.push('--editor')
    // Pasta de saída escolhida pelo dev (`--out`). Omitida = `dist-native` do
    // projeto. Serve pra manter várias versões e pra contornar uma dist-native
    // travada (Explorer/antivírus com handle aberto).
    if (typeof outDir === 'string' && outDir) flags.push('--out', validatePath(outDir))
    return await new Promise((resolvePromise) => {
      const child = spawn(process.execPath, [script, safeDir, ...flags], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        cwd: resourceBase(),
        windowsHide: true,
      })
      let output = ''
      // Marcadores `[export:step] <key>` (prepare/bundle/bytecode/runtime/assets/
      // done) do script viram eventos pro modal de progresso do renderer. O parse
      // é por linha: um chunk de stdout pode ter várias, e a última pode vir
      // cortada — esse resto espera o próximo chunk em `pending`.
      let pending = ''
      const emitSteps = (chunk: string): void => {
        const lines = (pending + chunk).split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          const step = /^\[export:step\]\s+(\w+)/.exec(trimmed)
          // Detalhe dentro da etapa (SPEC-0699): `[export:progress] {json}` → o modal
          // mostra a barra e o arquivo/textura em curso. O JSON vai cru pro renderer.
          const detail = /^\[export:progress\]\s+(\{.*\})$/.exec(trimmed)
          if (_event.sender.isDestroyed()) continue
          if (step) _event.sender.send('export:progress', step[1])
          else if (detail) _event.sender.send('export:progress', `progress:${detail[1]}`)
        }
      }
      child.stdout?.on('data', (d: Buffer) => { const s = d.toString(); output += s; emitSteps(s) })
      child.stderr?.on('data', (d: Buffer) => { output += d.toString() })
      // Destino REAL do export: a pasta escolhida (`--out`) ou o `dist-native`
      // default. Sem isto o "abrir pasta" do modal ia sempre pro dist-native,
      // mesmo com outra pasta escolhida (bug relatado).
      const distDir = typeof outDir === 'string' && outDir ? validatePath(outDir) : join(safeDir, 'dist-native')
      child.on('close', (code) => {
        resolvePromise({
          ok: code === 0,
          output,
          distDir: code === 0 ? distDir : undefined,
        })
      })
      child.on('error', (err) => resolvePromise({ ok: false, output: String(err) }))
    })
  })

  /** Abre uma pasta no explorador do SO (ex.: dist-native após o export). */
  ipcMain.handle('shell:openPath', async (_event, target: unknown) => {
    const safe = validatePath(target)
    await shell.openPath(safe)
  })
}
