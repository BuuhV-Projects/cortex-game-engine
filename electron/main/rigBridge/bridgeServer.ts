import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { RIG_BRIDGE_PATH, RIG_BRIDGE_TOKEN_HEADER } from './bridgeFile.js'

/**
 * Servidor HTTP da ponte do auto-rig (SPEC-0746, ADR-0747): só `POST /rig` com o token, corpo `{ cmd, args }`, e a
 * resposta do painel em JSON. Sem Electron: o repasse ao renderer chega por `forward`.
 */

/** Resposta do painel a um comando. */
export interface RigReply {
  ok: boolean
  result?: unknown
  error?: string
}

/** Manda o comando ao painel e espera a resposta. */
export type RigForward = (cmd: string, args: Record<string, unknown>) => Promise<RigReply>

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_TOO_LARGE = 413
/** Maior corpo aceito (a pegada e os comandos são pequenos). */
export const MAX_BODY_BYTES = 1024 * 1024
/** Endereço da escuta: só a própria máquina. */
export const BRIDGE_HOST = '127.0.0.1'

function send(res: ServerResponse, status: number, body: RigReply): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function sameToken(got: string | string[] | undefined, want: string): boolean {
  if (typeof got !== 'string') return false
  const a = Buffer.from(got)
  const b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** O corpo inteiro, ou `null` se passa de `MAX_BODY_BYTES`. */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY_BYTES) tooLarge = true
      else chunks.push(c)
    })
    req.on('end', () => resolve(tooLarge ? null : Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function handle(req: IncomingMessage, res: ServerResponse, token: string, forward: RigForward): Promise<void> {
  if (req.method !== 'POST' || req.url !== RIG_BRIDGE_PATH) return send(res, HTTP_NOT_FOUND, { ok: false, error: 'só POST /rig' })
  if (!sameToken(req.headers[RIG_BRIDGE_TOKEN_HEADER], token)) return send(res, HTTP_FORBIDDEN, { ok: false, error: 'token inválido' })
  const text = await readBody(req)
  if (text === null) return send(res, HTTP_TOO_LARGE, { ok: false, error: 'corpo grande demais' })
  let body: { cmd?: unknown; args?: unknown }
  try {
    body = JSON.parse(text) as { cmd?: unknown; args?: unknown }
  } catch {
    return send(res, HTTP_BAD_REQUEST, { ok: false, error: 'JSON inválido' })
  }
  if (typeof body.cmd !== 'string') return send(res, HTTP_BAD_REQUEST, { ok: false, error: 'falta cmd' })
  const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args) ? (body.args as Record<string, unknown>) : {}
  try {
    send(res, HTTP_OK, await forward(body.cmd, args))
  } catch (err) {
    send(res, HTTP_OK, { ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

/** Sobe o servidor em `127.0.0.1` numa porta livre (`port` 0) e devolve-o já escutando. */
export function startBridgeServer(token: string, forward: RigForward, port = 0): Promise<Server> {
  const server = createServer((req, res) => void handle(req, res, token, forward))
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, BRIDGE_HOST, () => resolve(server))
  })
}
