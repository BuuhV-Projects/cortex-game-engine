// Regras do CLAUDE.md do jogo checadas no diff do PR (SPEC-0656 da engine; cópia adaptada do
// .github/scripts/pr-rules.mjs da engine: mudou uma regra lá, mude aqui e nos jogos).
// Uso: node .github/scripts/pr-rules.mjs <base-sha> <head-sha>
// Só olha o que o PR toca: débito herdado não reprova PR que não mexe no arquivo.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const MAX_LINES = 500
/** Teto da saída do `git diff` lida pelo script (256 MiB): PR grande com binários não estoura o buffer. */
const MAX_DIFF_BUFFER_BYTES = 256 * 1024 * 1024
const CODE_EXT = /\.(ts|tsx|js|mjs|cjs|c|cc|cpp|h|hpp|py|sh|ps1|rs)$/
const EXEMPT = /(^|\/)(third_party|vendor|node_modules|dist|public|src-tauri)\//
/** Ferramentas de Node (scripts, testes, CI) podem usar console.log; o código do jogo usa debug(). */
const TOOLING = /^(scripts|tests|\.github)\//
const CONSOLE_EXT = /\.(ts|tsx|js|mjs|cjs)$/
const RECORD_AREAS = /^docs\/(specs|adrs|tdrs)\//
/** Chamada de `console.log`, com espaço ou quebra de linha entre os pedaços. */
const CONSOLE_CALL = /\bconsole\s*\.\s*log\s*\(/g

/**
 * @param {{ files: { status: string, path: string, lines: number }[],
 *           added: { path: string, text: string, line: number }[],
 *           pendencias: string,
 *           sources?: Record<string, string> }} diff
 *   `sources`: o texto do arquivo inteiro no head, por caminho (comentário e string só se distinguem no arquivo todo).
 * @returns {{ errors: { path: string, msg: string }[], warnings: { path: string, msg: string }[] }}
 */
export function checkRules({ files, added, pendencias, sources = {} }) {
  const errors = []
  const warnings = []
  const touched = files.filter((f) => f.status !== 'D')
  const pending = pendingPaths(pendencias)

  for (const f of touched) {
    if (/(^|\/)package-lock\.json$/.test(f.path)) {
      errors.push({ path: f.path, msg: 'package-lock.json no PR: o repo usa yarn (yarn.lock).' })
    }
    if (CODE_EXT.test(f.path) && !EXEMPT.test(f.path) && f.lines > MAX_LINES && !pending.has(f.path)) {
      errors.push({
        path: f.path,
        msg: `${f.lines} linhas (máx. ${MAX_LINES}): refatore ou registre em docs/pendencias-refatoracao.md.`,
      })
    }
  }

  // Linhas adicionadas por arquivo; a chamada é achada no arquivo INTEIRO (sem strings nem comentários) e só reprova
  // se cair numa linha adicionada.
  const addedLines = new Map()
  for (const a of added) {
    if (!CONSOLE_EXT.test(a.path) || TOOLING.test(a.path) || EXEMPT.test(a.path)) continue
    if (!addedLines.has(a.path)) addedLines.set(a.path, new Set())
    addedLines.get(a.path).add(a.line)
  }
  for (const [path, lines] of addedLines) {
    const source = sources[path]
    if (source === undefined) continue
    if (consoleCallLines(codeOnly(source)).some((l) => lines.has(l))) {
      errors.push({ path, msg: 'console.log no jogo: use debug(escopo, …) da cortex-game-engine.' })
    }
  }

  const codeChanged = touched.some((f) => CODE_EXT.test(f.path) && !EXEMPT.test(f.path) && !TOOLING.test(f.path))
  if (codeChanged && !touched.some((f) => RECORD_AREAS.test(f.path))) {
    warnings.push({ path: '', msg: 'Código mudou sem SPEC/ADR/TDR no PR (ok só para correção trivial).' })
  }
  return { errors, warnings }
}

/** Caminhos registrados em `docs/pendencias-refatoracao.md`: um por linha, com ou sem `- ` e crases. */
export function pendingPaths(text) {
  const paths = text.split('\n').map((l) => l.trim().replace(/^[-*]\s+/, '').replace(/`/g, '').trim())
  return new Set(paths.filter(Boolean))
}

/** Espaços no lugar de `text`, mantendo as quebras de linha (o número das linhas não muda). */
const blank = (text) => text.replace(/[^\n]/g, ' ')

/** Antes de um destes (ou no começo), `/` abre expressão regular; depois de nome, número, `)` ou `]`, é divisão. */
const REGEX_AFTER = /[(,=:[!&|?{};+\-*%<>~^]/
const REGEX_AFTER_WORD = /\b(return|typeof|case|in|of|yield|await|delete|void|throw|new)\s*$/
const IN_TEMPLATE = 'tpl'
const IN_BRACE = 'code'

/**
 * Fim (exclusivo) da expressão regular que começa no `/` em `start`, ou `-1` se não fecha na mesma linha (então era
 * divisão). Aspas dentro dela não abrem string.
 */
function regexEnd(src, start) {
  let inClass = false
  for (let k = start + 1; k < src.length; k++) {
    const ch = src[k]
    if (ch === '\\') k++
    else if (ch === '\n') return -1
    else if (ch === '[') inClass = true
    else if (ch === ']') inClass = false
    else if (ch === '/' && !inClass) {
      let end = k + 1
      while (end < src.length && /[a-z]/i.test(src[end])) end++
      return end
    }
  }
  return -1
}

/**
 * Fim (exclusivo) do texto de template que começa em `start` (logo depois da crase ou do `}` de uma interpolação):
 * para na crase final ou logo depois de `${`. `opened` diz qual dos dois.
 */
function templateTextEnd(src, start) {
  for (let k = start; k < src.length; k++) {
    if (src[k] === '\\') k++
    else if (src[k] === '`') return { end: k + 1, opened: false }
    else if (src[k] === '$' && src[k + 1] === '{') return { end: k + 2, opened: true }
  }
  return { end: src.length, opened: false }
}

/**
 * O código sem strings (`'` `"` e o texto de crases) nem comentários (`//`, bloco), trocados por espaços: as quebras
 * de linha ficam, então a linha de cada trecho é a mesma do arquivo. O código dentro de `${…}` continua código, e
 * expressões regulares saem inteiras (aspas nelas não abrem string).
 */
export function codeOnly(src) {
  let out = ''
  let i = 0
  const braces = [] // IN_BRACE para `{` comum, IN_TEMPLATE para o `${` de uma crase
  // O último elemento de código foi um literal (string, crase fechada, regex)? Depois de um valor, `/` é divisão —
  // e o texto que sobra no `out` não diz isso, porque o literal já virou espaço.
  let afterLiteral = false
  const enterTemplateText = (start) => {
    const { end, opened } = templateTextEnd(src, start)
    out += blank(src.slice(i, end))
    if (opened) braces.push(IN_TEMPLATE)
    afterLiteral = !opened
    i = end
  }
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      let end = src.indexOf('\n', i)
      if (end < 0) end = src.length
      out += blank(src.slice(i, end))
      i = end
    } else if (c === '/' && next === '*') {
      let end = src.indexOf('*/', i + 2)
      end = end < 0 ? src.length : end + 2
      out += blank(src.slice(i, end))
      i = end
    } else if (c === '"' || c === "'") {
      // string comum termina na linha (sem `\` no fim, o JS também não deixa passar dela)
      let end = i + 1
      while (end < src.length && src[end] !== c && src[end] !== '\n') end += src[end] === '\\' ? 2 : 1
      end = Math.min(end + 1, src.length)
      out += blank(src.slice(i, end))
      afterLiteral = true
      i = end
    } else if (c === '`') {
      enterTemplateText(i + 1)
    } else if (c === '}' && braces[braces.length - 1] === IN_TEMPLATE) {
      braces.pop()
      enterTemplateText(i + 1)
    } else if (c === '/' && !afterLiteral && regexStarts(out)) {
      const end = regexEnd(src, i)
      if (end < 0) {
        out += c
        afterLiteral = false
        i++
      } else {
        out += blank(src.slice(i, end))
        afterLiteral = true
        i = end
      }
    } else {
      if (c === '{') braces.push(IN_BRACE)
      else if (c === '}') braces.pop()
      if (!/\s/.test(c)) afterLiteral = false
      out += c
      i++
    }
  }
  return out
}

/** Um `/` aqui abre expressão regular? Decide pelo último caractere de código antes dele (fora literal: ver `afterLiteral`). */
function regexStarts(code) {
  const trimmed = code.trimEnd()
  if (trimmed === '') return true
  return REGEX_AFTER.test(trimmed[trimmed.length - 1]) || REGEX_AFTER_WORD.test(trimmed)
}

/**
 * Linhas (a partir de 1) com pedaços de cada chamada de `console.log`, no código já limpo por {@link codeOnly}. Só
 * as linhas onde a chamada tem código: um comentário ou uma linha vazia no meio dela não conta.
 */
export function consoleCallLines(code) {
  const lines = []
  for (const m of code.matchAll(CONSOLE_CALL)) {
    const first = code.slice(0, m.index).split('\n').length
    m[0].split('\n').forEach((piece, k) => {
      if (piece.trim() !== '') lines.push(first + k)
    })
  }
  return lines
}

/** Caminho do cabeçalho `+++`; o git põe entre aspas os que têm caractere especial. */
function headerPath(raw) {
  const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1).replace(/\\(["\\])/g, '$1') : raw
  return unquoted.startsWith('b/') ? unquoted.slice(2) : ''
}

/** Início do trecho no arquivo novo: o `+c` de `@@ -a,b +c,d @@`. */
const HUNK_START = /^@@ -\d+(?:,\d+)? \+(\d+)/

/**
 * Linhas adicionadas por arquivo, com o número da linha no arquivo novo, a partir de `git diff -U0`. `+++` só é
 * cabeçalho antes do primeiro `@@` de cada arquivo: dentro do trecho, uma linha adicionada `++ x` também começa
 * com `+++ `.
 */
export function parseAddedLines(patch) {
  const added = []
  let path = ''
  let inHeader = false
  let line = 0
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      inHeader = true
      path = ''
    } else if (inHeader && raw.startsWith('+++ ')) path = headerPath(raw.slice(4))
    else if (raw.startsWith('@@')) {
      inHeader = false
      line = Number(HUNK_START.exec(raw)?.[1] ?? 0)
    } else if (!inHeader && raw.startsWith('+') && path) added.push({ path, text: raw.slice(1), line: line++ })
    else if (!inHeader && raw.startsWith(' ')) line++ // contexto (com -U0 não vem; vale para qualquer -U)
  }
  return added
}

function git(...args) {
  // quotePath=false: caminho com acento sai cru, não escapado entre aspas.
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: MAX_DIFF_BUFFER_BYTES,
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
  // o checkout é o head (workflow com `ref: head.sha`): o arquivo no disco é o que o diff descreve
  const sources = {}
  for (const path of new Set(added.map((a) => a.path))) {
    if (CONSOLE_EXT.test(path) && existsSync(path)) sources[path] = readFileSync(path, 'utf8')
  }
  const pendencias = existsSync('docs/pendencias-refatoracao.md')
    ? readFileSync('docs/pendencias-refatoracao.md', 'utf8')
    : ''
  const { errors, warnings } = checkRules({ files, added, pendencias, sources })
  for (const w of warnings) console.log(`::warning${w.path ? ` file=${w.path}` : ''}::${w.msg}`)
  for (const e of errors) console.log(`::error file=${e.path}::${e.msg}`)
  console.log(`regras do repo: ${files.length} arquivo(s), ${errors.length} erro(s), ${warnings.length} aviso(s)`)
  process.exit(errors.length ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
