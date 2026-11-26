import { ipcMain, type BrowserWindow } from 'electron'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { rigBridgeFile, type RigBridgeInfo } from './bridgeFile.js'
import { startBridgeServer, type RigReply } from './bridgeServer.js'
import { createForward } from './forward.js'
import { debug } from '../../../src/core/debug.js'

/**
 * Ponte local do auto-rig no main process (SPEC-0746, ADR-0747): sobe o servidor, publica porta e token no arquivo da
 * ponte e repassa cada comando ao painel pela janela principal (`rigRemote:command` → `rigRemote:reply`).
 */

const SCOPE = 'rig-bridge'
const TOKEN_BYTES = 24
/** Só o dono lê o arquivo do token (onde o sistema respeita o modo). */
const OWNER_ONLY = 0o600

let server: Server | null = null
let onReply: ((event: unknown, id: unknown, reply: unknown) => void) | null = null

/** Sobe a ponte; `getWindow` devolve a janela com o painel. Falha vira log, não derruba o Studio. */
export async function startRigBridge(getWindow: () => BrowserWindow | null): Promise<void> {
  if (server) return
  const fwd = createForward((msg) => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return false
    win.webContents.send('rigRemote:command', msg)
    return true
  })
  const token = randomBytes(TOKEN_BYTES).toString('hex')
  try {
    server = await startBridgeServer(token, fwd.forward)
    // só com o servidor no ar: se ele não sobe, nenhum listener fica sem uso
    onReply = (_event, id, reply) => fwd.reply(id, reply as RigReply)
    ipcMain.on('rigRemote:reply', onReply)
    const info: RigBridgeInfo = { port: (server.address() as AddressInfo).port, token, pid: process.pid }
    const file = rigBridgeFile()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(info), { mode: OWNER_ONLY })
    chmodSync(file, OWNER_ONLY) // o modo do writeFileSync só vale na criação: um arquivo antigo mais aberto fecha aqui
    debug(SCOPE, 'ponte do auto-rig em 127.0.0.1', info.port)
  } catch (err) {
    debug(SCOPE, 'ponte do auto-rig não subiu', err)
  }
}

/** O arquivo da ponte é deste processo (outro Studio aberto depois o sobrescreve). */
function ownsFile(file: string): boolean {
  try {
    return (JSON.parse(readFileSync(file, 'utf8')) as Partial<RigBridgeInfo>).pid === process.pid
  } catch {
    return false
  }
}

/** Fecha a ponte e apaga o arquivo, se ainda é o deste Studio (ao sair). */
export function stopRigBridge(): void {
  if (!server) return
  server.close()
  server.closeAllConnections() // keep-alive não segura o fechamento
  server = null
  if (onReply) ipcMain.removeListener('rigRemote:reply', onReply)
  onReply = null
  const file = rigBridgeFile()
  if (ownsFile(file)) rmSync(file, { force: true })
}
