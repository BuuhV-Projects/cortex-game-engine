/**
 * Higiene do disk cache do Chromium entre sessões do Studio.
 *
 * O problema: o cache HTTP e o code cache do Chromium usam o backend
 * **blockfile** (um índice com lista encadeada LRU + arquivos `f_xxxxxx`
 * externos). Esse índice só fecha íntegro num shutdown limpo. Quando o
 * processo morre à força — `Ctrl+C` no `electron-vite dev`, fechar o
 * terminal, crash do renderer — o índice fica inconsistente e a sessão
 * seguinte cospe no log:
 *
 * ```
 * net\disk_cache\blockfile\backend_impl.cc] Critical error found -8
 * net\disk_cache\blockfile\entry_impl.cc]   No file for a1010e3a
 * ```
 *
 * O `-8` é `ERR_INVALID_LINKS` da enum interna do disk cache
 * (`net/disk_cache/blockfile/errors.h`) — a lista LRU quebrou; o
 * "No file for" é uma entrada do índice apontando pra um `f_xxxxxx` que
 * sumiu. O Chromium se recupera sozinho (desabilita o cache e recria), então
 * o impacto é ruído no log, não falha funcional — mas ruído recorrente
 * mascara erro de verdade.
 *
 * A estratégia aqui é detectar o shutdown sujo por **sentinela** e limpar o
 * cache preventivamente no boot seguinte, ANTES de qualquer janela abrir:
 *
 * - boot: se a sentinela da sessão anterior ainda existe, o app não fechou
 *   limpo → purga os caches blockfile; depois (re)cria a sentinela;
 * - shutdown limpo (`before-quit`): remove a sentinela.
 *
 * Módulo sem dependência de `electron` de propósito — recebe o `userData`
 * como parâmetro pra poder ser testado com um diretório temporário.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Arquivo-sentinela criado no boot e removido no shutdown limpo. Encontrá-lo
 * durante o boot significa que a sessão anterior terminou à força.
 */
export const SESSION_SENTINEL = 'cortex-session.lock'

/**
 * Subdiretórios de `userData` servidos pelo backend blockfile — são os que
 * produzem os erros acima. `GPUCache`/`DawnWebGPUCache` usam outro backend e
 * ficam de fora (limpá-los só encareceria o boot sem resolver nada).
 */
export const BLOCKFILE_CACHE_DIRS: readonly string[] = ['Cache', 'Code Cache']

// No Windows um handle ainda não solto faz o unlink falhar com EPERM/EBUSY;
// o rm do Node retenta sozinho quando recebe estes parâmetros.
const RM_MAX_RETRIES = 3
const RM_RETRY_DELAY_MS = 50

/**
 * Esvazia o CONTEÚDO de um diretório preservando a raiz.
 *
 * Apagar e recriar a raiz é tentador, mas no Windows o nome fica em
 * "delete pending" enquanto algum handle não solta e o `mkdir` seguinte
 * estoura EPERM — a mesma armadilha já documentada no ADR-0101
 * (`native/scripts/fs-clean.mjs`). Manter a raiz viva evita a corrida.
 */
export function emptyDirContents(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    return
  }
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), {
      recursive: true,
      force: true,
      maxRetries: RM_MAX_RETRIES,
      retryDelay: RM_RETRY_DELAY_MS,
    })
  }
}

/**
 * Purga os caches blockfile de um `userData`, devolvendo os diretórios que
 * existiam e foram esvaziados (os ausentes são ignorados — nada a limpar).
 *
 * Best-effort: um diretório travado por outro processo não derruba o boot.
 */
export function purgeBlockfileCaches(userDataDir: string): string[] {
  const purged: string[] = []
  for (const name of BLOCKFILE_CACHE_DIRS) {
    const dir = join(userDataDir, name)
    if (!existsSync(dir)) continue
    try {
      emptyDirContents(dir)
      purged.push(name)
    } catch {
      /* cache travado — o Chromium se vira; não vale abortar o boot */
    }
  }
  return purged
}

/** Caminho da sentinela de sessão dentro do `userData`. */
export function sentinelPath(userDataDir: string): string {
  return join(userDataDir, SESSION_SENTINEL)
}

/**
 * A sessão anterior terminou à força? (sentinela sobreviveu ao shutdown)
 */
export function isUncleanShutdown(userDataDir: string): boolean {
  return existsSync(sentinelPath(userDataDir))
}

/** Marca a sessão como viva. Chamado no boot, depois da eventual purga. */
export function markSessionStart(userDataDir: string): void {
  try {
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(sentinelPath(userDataDir), String(process.pid), 'utf-8')
  } catch {
    /* sem sentinela só perdemos a detecção — não é motivo pra travar o boot */
  }
}

/** Marca o encerramento limpo. Chamado no `before-quit`. */
export function markSessionEnd(userDataDir: string): void {
  try {
    rmSync(sentinelPath(userDataDir), {
      force: true,
      maxRetries: RM_MAX_RETRIES,
      retryDelay: RM_RETRY_DELAY_MS,
    })
  } catch {
    /* best-effort no shutdown */
  }
}

/**
 * Rotina de boot: purga o cache se a sessão anterior morreu à força e
 * (re)arma a sentinela. Devolve os diretórios purgados — vazio quando o
 * shutdown anterior foi limpo.
 *
 * DEVE rodar antes da primeira `BrowserWindow`: depois disso o Chromium já
 * abriu o índice do blockfile e mexer nos arquivos vira corrida.
 */
export function recoverCacheIfUnclean(userDataDir: string): string[] {
  if (!userDataDir) return []
  const purged = isUncleanShutdown(userDataDir) ? purgeBlockfileCaches(userDataDir) : []
  markSessionStart(userDataDir)
  return purged
}
