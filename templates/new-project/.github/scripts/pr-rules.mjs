// Regras do CLAUDE.md do jogo checadas no diff do PR (SPEC-0656 da engine; cópia adaptada do
// .github/scripts/pr-rules.mjs da engine: mudou uma regra lá, mude aqui e nos jogos).
// Uso: node .github/scripts/pr-rules.mjs <base-sha> <head-sha>
// Só olha o que o PR toca: débito herdado não reprova PR que não mexe no arquivo.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const MAX_LINES = 500
const CODE_EXT = /\.(ts|tsx|js|mjs|cjs|c|cc|cpp|h|hpp|py|sh|ps1|rs)$/
const EXEMPT = /(^|\/)(third_party|vendor|node_modules|dist|public|src-tauri)\//
/** Ferramentas de Node (scripts, testes, CI) podem usar console.log; o código do jogo usa debug(). */
const TOOLING = /^(scripts|tests|\.github)\//
const CONSOLE_EXT = /\.(ts|tsx|js|mjs|cjs)$/
const RECORD_AREAS = /^docs\/(specs|adrs|tdrs)\//

/**
 * @param {{ files: { status: string, path: string, lines: number }[],
 *           added: { path: string, text: string }[],
 *           pendencias: string }} diff
 * @returns {{ errors: { path: string, msg: string }[], warnings: { path: string, msg: string }[] }}
 */
export function checkRules({ files, added, pendencias }) {
  const errors = []
  const warnings = []
  const touched = files.filter((f) => f.status !== 'D')

  for (const f of touched) {
    if (/(^|\/)package-lock\.json$/.test(f.path)) {
      errors.push({ path: f.path, msg: 'package-lock.json no PR: o repo usa yarn (yarn.lock).' })
    }
    if (CODE_EXT.test(f.path) && !EXEMPT.test(f.path) && f.lines > MAX_LINES && !pendencias.includes(f.path)) {
      errors.push({
        path: f.path,
        msg: `${f.lines} linhas (máx. ${MAX_LINES}): refatore ou registre em docs/pendencias-refatoracao.md.`,
      })
    }
  }

  for (const a of added) {
    if (!CONSOLE_EXT.test(a.path) || TOOLING.test(a.path) || EXEMPT.test(a.path)) continue
    const code = a.text.trim()
    if (code.startsWith('//') || code.startsWith('*')) continue
    if (code.includes('console.log(')) {
      errors.push({ path: a.path, msg: 'console.log no jogo: use debug(escopo, …) da cortex-game-engine.' })
    }
  }

  const codeChanged = touched.some((f) => CODE_EXT.test(f.path) && !EXEMPT.test(f.path) && !TOOLING.test(f.path))
  if (codeChanged && !touched.some((f) => RECORD_AREAS.test(f.path))) {
    warnings.push({ path: '', msg: 'Código mudou sem SPEC/ADR/TDR no PR (ok só para correção trivial).' })
  }
  return { errors, warnings }
}

/** Caminho do cabeçalho `+++`; o git põe entre aspas os que têm caractere especial. */
function headerPath(raw) {
  const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1).replace(/\\(["\\])/g, '$1') : raw
  return unquoted.startsWith('b/') ? unquoted.slice(2) : ''
}

/**
 * Linhas adicionadas por arquivo, a partir de `git diff -U0`. `+++` só é
 * cabeçalho antes do primeiro `@@` de cada arquivo: dentro do trecho, uma
 * linha adicionada `++ x` também começa com `+++ `.
 */
export function parseAddedLines(patch) {
  const added = []
  let path = ''
  let inHeader = false
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inHeader = true
      path = ''
    } else if (inHeader && line.startsWith('+++ ')) path = headerPath(line.slice(4))
    else if (line.startsWith('@@')) inHeader = false
    else if (!inHeader && line.startsWith('+') && path) added.push({ path, text: line.slice(1) })
  }
  return added
}

function git(...args) {
  // quotePath=false: caminho com acento sai cru, não escapado entre aspas.
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
}

function countLines(path) {
  if (!existsSync(path)) return 0
  const text = readFileSync(path, 'utf8')
  return text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

function main() {
  const [base, head] = process.argv.slice(2)
  if (!base || !head) {
    console.error('uso: pr-rules.mjs <base-sha> <head-sha>')
    process.exit(2)
  }
  const range = `${base}...${head}`
  // -z: pares status\0caminho\0, sem aspas nem escape em nenhum caminho.
  const fields = git('diff', '--name-status', '--no-renames', '-z', range).split('\0').filter(Boolean)
  const files = []
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const [status, path] = [fields[i], fields[i + 1]]
    files.push({ status, path, lines: status === 'D' ? 0 : countLines(path) })
  }
  const added = parseAddedLines(git('diff', '-U0', '--no-renames', range))
  const pendencias = existsSync('docs/pendencias-refatoracao.md')
    ? readFileSync('docs/pendencias-refatoracao.md', 'utf8')
    : ''
  const { errors, warnings } = checkRules({ files, added, pendencias })
  for (const w of warnings) console.log(`::warning${w.path ? ` file=${w.path}` : ''}::${w.msg}`)
  for (const e of errors) console.log(`::error file=${e.path}::${e.msg}`)
  console.log(`regras do repo: ${files.length} arquivo(s), ${errors.length} erro(s), ${warnings.length} aviso(s)`)
  process.exit(errors.length ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
