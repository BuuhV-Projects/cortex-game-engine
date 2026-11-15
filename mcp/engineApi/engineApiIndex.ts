/**
 * Índice compacto da referência da API do engine (`engine-api.md`) para o
 * system prompt do Chat IA (ADR-0114).
 *
 * Injetar o doc inteiro (~63 KB / ~18k tokens) no system prompt custava caro
 * no primeiro turno de TODA sessão (cache write) e ocupava janela de contexto.
 * Este módulo destila o markdown num índice com: título de cada seção, faixa
 * de linhas (pra Read com offset/limit) e os símbolos que a seção documenta.
 * O agente lê a seção completa sob demanda com a tool Read (auto-aprovada).
 *
 * Módulo puro (sem I/O) — recebe o markdown, devolve o índice como string.
 */

export interface EngineApiSection {
  /** Nível do heading (2 = `##`, 3 = `###`). */
  level: number
  title: string
  /** Linha do heading no arquivo (1-based, compatível com Read offset). */
  startLine: number
  /** Última linha da seção (inclusive; até o próximo heading de nível <=). */
  endLine: number
  /** Símbolos documentados na seção (identificadores em crase). */
  symbols: string[]
}

/** Máximo de símbolos listados por seção no índice (o resto vira `…`). */
const MAX_SYMBOLS_PER_SECTION = 30

/** Palavras em crase que não são exports do engine (ruído comum em prosa). */
const SYMBOL_STOPLIST = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'new',
  'import',
  'export',
  'const',
  'let',
  'var',
  'this',
  'async',
  'await',
  'string',
  'number',
  'boolean',
  'void',
  'type',
  'dev',
  'three',
])

/** Identificador "puro" (sem pontos/parênteses/espaços) — candidato a export. */
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Extrai spans em crase de um trecho de linha. */
function backtickSpans(text: string): string[] {
  const spans: string[] = []
  const re = /`([^`]+)`/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) spans.push(m[1])
  return spans
}

/**
 * Marca quais linhas estão dentro de blocos de código cercados (``` ou ~~~),
 * pra ignorar headings e "símbolos" que na verdade são código de exemplo.
 */
function fencedLineMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false)
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const isFenceDelimiter = /^\s*(```|~~~)/.test(lines[i])
    if (isFenceDelimiter) {
      // A linha do delimitador também conta como código (não tem heading válido).
      mask[i] = true
      inFence = !inFence
      continue
    }
    mask[i] = inFence
  }
  return mask
}

/**
 * Extrai os símbolos de uma linha de conteúdo. Em linhas de tabela só a
 * primeira célula conta (as demais são descrição, cheias de exemplos em
 * crase); em prosa, qualquer identificador puro em crase conta.
 */
function symbolsFromLine(line: string): string[] {
  const trimmed = line.trimStart()
  let searchText = line
  if (trimmed.startsWith('|')) {
    const cells = trimmed.split('|')
    // split de `| a | b |` → ['', ' a ', ' b ', ''] — a 1ª célula é cells[1].
    searchText = cells.length > 1 ? cells[1] : ''
  }
  return backtickSpans(searchText).filter(
    (s) => s.length >= 2 && IDENTIFIER_RE.test(s) && !SYMBOL_STOPLIST.has(s),
  )
}

/**
 * Divide o markdown em seções (headings `##`/`###` fora de code fences), com
 * faixa de linhas e símbolos. Uma seção `##` termina no próximo `##`; uma
 * `###` termina no próximo heading de qualquer nível.
 */
export function parseEngineApiSections(markdown: string): EngineApiSection[] {
  const lines = markdown.split('\n')
  const fenced = fencedLineMask(lines)

  const headings: Array<{ level: number; title: string; line: number }> = []
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(lines[i])
    if (m) headings.push({ level: m[1].length, title: m[2], line: i + 1 })
  }

  const sections: EngineApiSection[] = []
  for (let h = 0; h < headings.length; h++) {
    const { level, title, line } = headings[h]
    let endLine = lines.length
    for (let n = h + 1; n < headings.length; n++) {
      if (headings[n].level <= level) {
        endLine = headings[n].line - 1
        break
      }
    }

    const seen = new Set<string>()
    const symbols: string[] = []
    for (let i = line; i < endLine; i++) {
      if (fenced[i]) continue
      for (const sym of symbolsFromLine(lines[i])) {
        if (!seen.has(sym)) {
          seen.add(sym)
          symbols.push(sym)
        }
      }
    }
    sections.push({ level, title, startLine: line, endLine, symbols })
  }
  return sections
}

/**
 * Gera o índice injetado no system prompt: preâmbulo do doc (curto, tem as
 * regras de import) + instruções de leitura sob demanda + uma linha por seção.
 * `docPath` é o caminho absoluto do `engine-api.md` empacotado (resourceBase).
 */
export function buildEngineApiIndex(markdown: string, docPath: string): string {
  const lines = markdown.split('\n')
  const sections = parseEngineApiSections(markdown)

  // Preâmbulo = tudo antes do primeiro heading de seção (título, regras de
  // import, fonte de verdade). É curto e importante — vai inline.
  const firstSectionLine = sections.length > 0 ? sections[0].startLine : lines.length + 1
  const preamble = lines
    .slice(0, firstSectionLine - 1)
    .join('\n')
    .replace(/\n-{3,}\s*$/g, '')
    .trim()

  const entries = sections
    .map((s) => {
      const indent = s.level === 3 ? '  ' : ''
      const range = `L${s.startLine}-${s.endLine}`
      const shown = s.symbols.slice(0, MAX_SYMBOLS_PER_SECTION)
      const overflow = s.symbols.length > MAX_SYMBOLS_PER_SECTION ? ', …' : ''
      const syms = shown.length > 0 ? ` — ${shown.join(', ')}${overflow}` : ''
      return `${indent}- ${s.title} — ${range}${syms}`
    })
    .join('\n')

  return `${preamble}

Este é o ÍNDICE da referência. A referência COMPLETA (assinaturas, receitas,
exemplos de código) está no arquivo:

  ${docPath}

Como usar: antes de codar feature de cena/render/física/input/áudio/ECS/
pós-processamento/HDRI/modelos 3D, localize a seção abaixo e LEIA o trecho com
a tool Read usando a faixa de linhas — ex.: seção "L414-488" →
Read(file_path acima, offset=414, limit=75). Esse arquivo fica FORA do projeto
e a leitura dele é permitida e esperada. Não confie só nos nomes do índice:
as assinaturas exatas estão no arquivo e em \`vendor/cortex-game-engine/*.d.ts\`.

Seções (título — linhas — símbolos):

${entries}`
}
