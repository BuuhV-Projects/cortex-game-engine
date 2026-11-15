import { z } from 'zod'
import { defineTool, textResult, type ToolContext, type ToolResult } from '../toolDef.js'
import { GUIDES, findSection, findSymbol, formatGuideIndex, readGuide, searchApi, type GuideId } from '../engineApi/apiReference.js'

/**
 * Tools da API do engine (SPEC-0737): índice dos guias, seção de um guia, referência TypeDoc de um export
 * e busca. Leitura sob demanda, como o índice do ADR-0114: nada da doc entra no contexto sem ser pedido.
 */

/** Versão do engine embutida no build (`define` do `vite.mcp.config.ts`). */
declare const __CORTEX_ENGINE_VERSION__: string | undefined
const ENGINE_VERSION = typeof __CORTEX_ENGINE_VERSION__ === 'string' ? __CORTEX_ENGINE_VERSION__ : 'dev'

/** Símbolos listados por seção no índice (o resto vira `…`). */
const MAX_INDEX_SYMBOLS = 12
/** Corte de uma página longa (o `Game` passa de 20 KB). */
const DEFAULT_MAX_CHARS = 12000
const MAX_CHARS_LIMIT = 60000
const DEFAULT_SEARCH_LIMIT = 15
const MAX_SEARCH_LIMIT = 50

const GUIDE_IDS = Object.keys(GUIDES) as [GuideId, ...GuideId[]]

function header(): string {
  return `> Doc do cortex-game-engine ${ENGINE_VERSION} (a do Studio instalado). Assinatura exata do jogo: \`vendor/cortex-game-engine/*.d.ts\`.\n\n`
}

function noDocs(ctx: ToolContext): ToolResult | null {
  return ctx.docsDir ? null : textResult('Documentação do engine não encontrada nos recursos do Studio (docs/cortex-game-engine).', true)
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n… (cortado em ${maxChars} de ${text.length} caracteres; peça \`maxChars\` maior)`
}

export const engineApiIndex = defineTool({
  name: 'engine_api_index',
  description:
    'ÍNDICE da documentação do cortex-game-engine: as seções do guia da API (engine-api.md — catálogo de ' +
    'recursos e receitas) e do mapa de arquitetura (architecture.md), com os símbolos de cada seção. Comece ' +
    'por aqui antes de codar feature de cena/render/física/input/áudio/ECS/UI; depois leia a seção com ' +
    'engine_api_section e a assinatura com engine_api_symbol. Importe sempre de "cortex-game-engine", nunca ' +
    'de "three" direto.',
  scope: 'global',
  schema: {},
  handler: async (_args, ctx) => {
    const missing = noDocs(ctx)
    if (missing) return missing
    const parts = GUIDE_IDS.flatMap((id) => {
      const md = readGuide(ctx.docsDir!, id)
      return md ? [formatGuideIndex(id, md, MAX_INDEX_SYMBOLS)] : []
    })
    return textResult(header() + parts.join('\n\n'))
  },
})

export const engineApiSection = defineTool({
  name: 'engine_api_section',
  description:
    'Texto inteiro de uma seção de um guia do engine (engine-api.md ou architecture.md), pelo título do ' +
    'engine_api_index. Aceita parte do título.',
  scope: 'global',
  schema: {
    doc: z.enum(GUIDE_IDS).optional().describe('Guia: "engine-api" (default) ou "architecture".'),
    title: z.string().min(1).describe('Título da seção (ou parte dele), como no engine_api_index.'),
    maxChars: z.number().int().positive().max(MAX_CHARS_LIMIT).optional().describe(`Corte da resposta (default ${DEFAULT_MAX_CHARS}).`),
  },
  handler: async ({ doc, title, maxChars }, ctx) => {
    const missing = noDocs(ctx)
    if (missing) return missing
    const id = doc ?? 'engine-api'
    const md = readGuide(ctx.docsDir!, id)
    if (!md) return textResult(`Guia ${GUIDES[id]} não encontrado.`, true)
    const found = findSection(md, title)
    if (!found) return textResult(`Seção "${title}" não encontrada em ${GUIDES[id]}. Veja engine_api_index.`, true)
    const { section, text } = found
    return textResult(`${header()}${GUIDES[id]} L${section.startLine}-${section.endLine}\n\n${truncate(text, maxChars ?? DEFAULT_MAX_CHARS)}`)
  },
})

export const engineApiSymbol = defineTool({
  name: 'engine_api_symbol',
  description:
    'Referência completa (gerada do TSDoc) de um export do engine — classe, função, interface, tipo ou ' +
    'variável — pelo nome exato (ex.: "Game", "buildScene", "VehicleLean"): assinatura, parâmetros, ' +
    'propriedades, métodos e exemplos. Sem saber o nome, use engine_api_search.',
  scope: 'global',
  schema: {
    name: z.string().min(1).describe('Nome do export (ex. "ArcadeVehicleComponent").'),
    maxChars: z.number().int().positive().max(MAX_CHARS_LIMIT).optional().describe(`Corte da resposta (default ${DEFAULT_MAX_CHARS}).`),
  },
  handler: async ({ name, maxChars }, ctx) => {
    const missing = noDocs(ctx)
    if (missing) return missing
    const found = findSymbol(ctx.docsDir!, name)
    if (!found) {
      const near = searchApi(ctx.docsDir!, name, DEFAULT_SEARCH_LIMIT).filter((h) => h.kind !== 'seção')
      const hint = near.length ? ` Parecidos: ${near.map((h) => h.name).join(', ')}.` : ''
      return textResult(`Export "${name}" não encontrado na referência.${hint}`, true)
    }
    return textResult(`${header()}(${found.entry.kind}, ${found.entry.file})\n\n${truncate(found.text, maxChars ?? DEFAULT_MAX_CHARS)}`)
  },
})

export const engineApiSearch = defineTool({
  name: 'engine_api_search',
  description:
    'Busca na API do engine por palavra (nome ou descrição): devolve exports (classe/função/interface/tipo/' +
    'variável) e seções dos guias ranqueados. Use quando não souber o nome exato — ex.: "veiculo roda", ' +
    '"dialogo", "agua". Depois abra o resultado com engine_api_symbol ou engine_api_section.',
  scope: 'global',
  schema: {
    query: z.string().min(1).describe('Palavras a buscar.'),
    limit: z.number().int().positive().max(MAX_SEARCH_LIMIT).optional().describe(`Máximo de resultados (default ${DEFAULT_SEARCH_LIMIT}).`),
  },
  handler: async ({ query, limit }, ctx) => {
    const missing = noDocs(ctx)
    if (missing) return missing
    const hits = searchApi(ctx.docsDir!, query, limit ?? DEFAULT_SEARCH_LIMIT)
    if (hits.length === 0) return textResult(`Nada encontrado para "${query}".`)
    const rows = ['| Nome | Tipo | Onde | Resumo |', '| --- | --- | --- | --- |']
    for (const h of hits) rows.push(`| ${h.name} | ${h.kind} | ${h.where} | ${h.summary.replace(/\|/g, '\\|')} |`)
    return textResult(header() + rows.join('\n'))
  },
})

export const engineApiTools = [engineApiIndex, engineApiSection, engineApiSymbol, engineApiSearch]
