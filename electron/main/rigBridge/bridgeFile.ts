import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Onde a ponte local do auto-rig (SPEC-0746, ADR-0747) publica a porta e o token: o Studio grava, o MCP `cortex` lê.
 * Sem dependência do Electron (o MCP importa daqui).
 */

/** Variável que troca o caminho do arquivo (testes, mais de um Studio). */
export const RIG_BRIDGE_FILE_ENV = 'CORTEX_RIG_BRIDGE_FILE'
/** Pasta, no perfil do usuário, e nome do arquivo. */
const BRIDGE_DIR = '.cortex-studio'
const BRIDGE_FILE = 'rig-bridge.json'
/** Caminho da rota e cabeçalho do token. */
export const RIG_BRIDGE_PATH = '/rig'
export const RIG_BRIDGE_TOKEN_HEADER = 'x-cortex-token'

/** O que o arquivo guarda. */
export interface RigBridgeInfo {
  port: number
  token: string
  pid: number
}

/** O arquivo da ponte (`CORTEX_RIG_BRIDGE_FILE`, ou `~/.cortex-studio/rig-bridge.json`). */
export function rigBridgeFile(env: NodeJS.ProcessEnv = process.env): string {
  return env[RIG_BRIDGE_FILE_ENV] || join(homedir(), BRIDGE_DIR, BRIDGE_FILE)
}
