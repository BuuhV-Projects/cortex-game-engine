import { readFile } from 'node:fs/promises'
import { RIG_BRIDGE_PATH, RIG_BRIDGE_TOKEN_HEADER, rigBridgeFile, type RigBridgeInfo } from '../electron/main/rigBridge/bridgeFile.js'

/**
 * Cliente da ponte local do auto-rig (SPEC-0746, ADR-0747): lê porta e token do arquivo que o Studio publica e manda o
 * comando ao painel. O token só passa do arquivo para o cabeçalho; não aparece em resposta nem em erro.
 */

/** Prazo do pedido HTTP (um pouco acima do da ponte, para o erro do painel chegar antes). */
const HTTP_TIMEOUT_MS = 190_000

/** Lê o arquivo da ponte; sem arquivo ou ilegível: erro dizendo que o Studio não está aberto. */
async function bridgeInfo(env: NodeJS.ProcessEnv): Promise<RigBridgeInfo> {
  const file = rigBridgeFile(env)
  let info: Partial<RigBridgeInfo>
  try {
    info = JSON.parse(await readFile(file, 'utf8')) as Partial<RigBridgeInfo>
  } catch {
    throw new Error(`Studio não está aberto (sem ${file}). Abra o Cortex Studio e o painel Auto-rig de personagem, aba Animações.`)
  }
  if (typeof info.port !== 'number' || typeof info.token !== 'string') throw new Error(`arquivo da ponte ilegível: ${file}`)
  return info as RigBridgeInfo
}

/** Manda `cmd` à ponte e devolve o `result` do painel (lança com o `error` dele). */
export async function callRig(cmd: string, args: Record<string, unknown> = {}, env: NodeJS.ProcessEnv = process.env): Promise<unknown> {
  const info = await bridgeInfo(env)
  let res: Response
  try {
    res = await fetch(`http://127.0.0.1:${info.port}${RIG_BRIDGE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [RIG_BRIDGE_TOKEN_HEADER]: info.token },
      body: JSON.stringify({ cmd, args }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`a ponte do Studio não respondeu na porta ${info.port} (o Studio fechou?): ${err instanceof Error ? err.message : String(err)}`)
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; error?: string } | null
  if (!body || !body.ok) throw new Error(body?.error ?? `ponte respondeu HTTP ${res.status}`)
  return body.result
}
