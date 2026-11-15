import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEngineApiSections, type EngineApiSection } from './engineApiIndex.js'

/**
 * Leitura da documentação do engine para as tools `engine_api_*` (SPEC-0737).
 *
 * Duas fontes em `docs/cortex-game-engine/`: os guias escritos à mão (`engine-api.md`,
 * `architecture.md`), lidos por seção, e a referência gerada pelo TypeDoc (`api/<tipo>/<Nome>.md`), lida
 * por símbolo. O catálogo de busca é montado uma vez por pasta e fica em cache (~650 arquivos).
 */

export const GUIDES = { 'engine-api': 'engine-api.md', architecture: 'architecture.md' } as const
export type GuideId = keyof typeof GUIDES

/** Pasta do TypeDoc → nome legível do tipo. */
const SYMBOL_KINDS: Record<string, string> = {
  classes: 'classe',
  functions: 'função',
  interfaces: 'interface',
  'type-aliases': 'tipo',
  variables: 'variável',
}
const API_DIR = 'api'
const MD_EXT = '.md'
/** Linhas do cabeçalho de navegação do TypeDoc (breadcrumb, `***`, breadcrumb). */
const TYPEDOC_HEADER = /^(\[\*\*cortex-game-engine\*\*\]|\*\*\*|\[cortex-game-engine\])/
/** Tamanho da primeira frase guardada no catálogo de busca. */
const SUMMARY_CHARS = 160

/** Pesos da busca: nome igual > começa com > contém > aparece no resumo. */
const SCORE_EXACT = 100
const SCORE_PREFIX = 50
const SCORE_NAME = 30
const SCORE_SUMMARY = 10

export function readGuide(docsDir: string, id: GuideId): string | null {
  const p = join(docsDir, GUIDES[id])
  return existsSync(p) ? readFileSync(p, 'utf-8') : null
}

/** Índice de um guia: uma linha por seção (`##`/`###`) com faixa de linhas e símbolos. */
export function formatGuideIndex(id: GuideId, markdown: string, maxSymbols: number): string {
  const lines = parseEngineApiSections(markdown).map((s) => {
    const indent = s.level === 3 ? '  ' : ''
    const shown = s.symbols.slice(0, maxSymbols)
    const overflow = s.symbols.length > maxSymbols ? ', …' : ''
    const syms = shown.length ? ` — ${shown.join(', ')}${overflow}` : ''
    return `${indent}- ${s.title} (L${s.startLine}-${s.endLine})${syms}`
  })
  return `## ${GUIDES[id]}\n\n${lines.join('\n')}`
}

/** Seção pelo título: igual (sem caixa) primeiro, depois a primeira que contém o texto. */
export function findSection(markdown: string, title: string): { section: EngineApiSection; text: string } | null {
  const sections = parseEngineApiSections(markdown)
  const wanted = title.trim().toLowerCase()
  const section =
    sections.find((s) => s.title.toLowerCase() === wanted) ?? sections.find((s) => s.title.toLowerCase().includes(wanted))
  if (!section) return null
  const text = markdown
    .split('\n')
    .slice(section.startLine - 1, section.endLine)
    .join('\n')
  return { section, text }
}

export interface SymbolEntry {
  name: string
  kind: string
  /** Caminho relativo à pasta de docs (ex.: `api/classes/Game.md`). */
  file: string
  summary: string
}

/** Página do TypeDoc sem o cabeçalho de navegação. */
export function stripTypedocHeader(markdown: string): string {
  const lines = markdown.split('\n')
  let i = 0
  while (i < lines.length && (lines[i]!.trim() === '' || TYPEDOC_HEADER.test(lines[i]!.trim()))) i++
  return lines.slice(i).join('\n')
}

/** Primeira linha de prosa depois do título e do "Defined in". */
function summaryOf(body: string): string {
  const line = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('Defined in') && !l.startsWith('>'))
  return (line ?? '').slice(0, SUMMARY_CHARS)
}

const catalogCache = new Map<string, SymbolEntry[]>()

export function symbolCatalog(docsDir: string): SymbolEntry[] {
  const cached = catalogCache.get(docsDir)
  if (cached) return cached
  const entries: SymbolEntry[] = []
  for (const [dir, kind] of Object.entries(SYMBOL_KINDS)) {
    const abs = join(docsDir, API_DIR, dir)
    if (!existsSync(abs)) continue
    for (const f of readdirSync(abs)) {
      if (!f.endsWith(MD_EXT)) continue
      const body = stripTypedocHeader(readFileSync(join(abs, f), 'utf-8'))
      entries.push({ name: f.slice(0, -MD_EXT.length), kind, file: `${API_DIR}/${dir}/${f}`, summary: summaryOf(body) })
    }
  }
  catalogCache.set(docsDir, entries)
  return entries
}

/** Símbolo pelo nome exato; sem achar, pelo nome sem diferenciar maiúsculas. */
export function findSymbol(docsDir: string, name: string): { entry: SymbolEntry; text: string } | null {
  const catalog = symbolCatalog(docsDir)
  const entry = catalog.find((e) => e.name === name) ?? catalog.find((e) => e.name.toLowerCase() === name.toLowerCase())
  if (!entry) return null
  return { entry, text: stripTypedocHeader(readFileSync(join(docsDir, entry.file), 'utf-8')) }
}

export interface SearchHit {
  name: string
  kind: string
  where: string
  summary: string
  score: number
}

function scoreName(name: string, term: string): number {
  if (name === term) return SCORE_EXACT
  if (name.startsWith(term)) return SCORE_PREFIX
  return name.includes(term) ? SCORE_NAME : 0
}

/** Busca nos símbolos do TypeDoc e nas seções dos guias; cada termo soma pontos. */
export function searchApi(docsDir: string, query: string, limit: number): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  const hits: SearchHit[] = []
  const score = (name: string, summary: string): number =>
    terms.reduce((acc, t) => acc + scoreName(name.toLowerCase(), t) + (summary.toLowerCase().includes(t) ? SCORE_SUMMARY : 0), 0)

  for (const e of symbolCatalog(docsDir)) {
    const s = score(e.name, e.summary)
    if (s > 0) hits.push({ name: e.name, kind: e.kind, where: e.file, summary: e.summary, score: s })
  }
  for (const id of Object.keys(GUIDES) as GuideId[]) {
    const md = readGuide(docsDir, id)
    if (!md) continue
    for (const sec of parseEngineApiSections(md)) {
      const s = score(sec.title, sec.symbols.join(' '))
      if (s > 0) {
        hits.push({ name: sec.title, kind: 'seção', where: `${GUIDES[id]} L${sec.startLine}`, summary: sec.symbols.join(', '), score: s })
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit)
}
