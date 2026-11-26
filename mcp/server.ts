import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { buildContext, findResources, resolveBlenderBin, resolveProjectRoot, type Resources } from './context.js'
import { GUIDES, readGuide, type GuideId } from './engineApi/apiReference.js'
import { assetTools } from './tools/assets.js'
import { engineApiTools } from './tools/engineApi.js'
import { kitTools } from './tools/kits.js'
import { rigTools } from './tools/rig.js'
import { validateSceneTool } from './tools/validate.js'
import type { ToolDef } from './toolDef.js'

/**
 * Servidor MCP `cortex` (ADR-0736, SPEC-0737): as ferramentas próprias do Studio e a API do engine para o
 * Claude Code do dev. Roda por stdio com o exe do Studio em modo Node (`ELECTRON_RUN_AS_NODE=1`).
 * stdout é o canal do protocolo: diagnóstico só em stderr.
 */

export const SERVER_NAME = 'cortex'
const SERVER_VERSION = '1.0.0'

export const ALL_TOOLS: ToolDef[] = [...kitTools, ...assetTools, validateSceneTool, ...engineApiTools, ...rigTools] as ToolDef[]

const PROJECT_DIR_ARG = {
  projectDir: z
    .string()
    .optional()
    .describe('Pasta do projeto do jogo. Default: a pasta em que o Claude Code foi aberto.'),
}

export interface ServerOptions {
  resources: Resources
  cwd: string
  blenderBin: string
}

export function createCortexServer(opts: ServerOptions): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  for (const def of ALL_TOOLS) {
    const schema = def.scope === 'project' ? { ...def.schema, ...PROJECT_DIR_ARG } : def.schema
    server.registerTool(def.name, { description: def.description, inputSchema: schema }, async (args: Record<string, unknown>) => {
      const { projectDir, ...rest } = args as { projectDir?: string }
      const ctx = buildContext(resolveProjectRoot(projectDir, opts.cwd), opts.resources, opts.blenderBin)
      try {
        return await def.handler(rest as never, ctx)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: `Erro em ${def.name}: ${message}` }], isError: true }
      }
    })
  }
  for (const id of Object.keys(GUIDES) as GuideId[]) {
    const uri = `cortex://docs/${GUIDES[id]}`
    server.registerResource(id, uri, { title: GUIDES[id], mimeType: 'text/markdown' }, async () => {
      const text = opts.resources.docsDir ? readGuide(opts.resources.docsDir, id) : null
      return { contents: [{ uri, mimeType: 'text/markdown', text: text ?? `${GUIDES[id]} não encontrado.` }] }
    })
  }
  return server
}

async function main(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const resources = findResources(scriptDir, process.env)
  if (!resources.base) console.error('[cortex-mcp] recursos do Studio não encontrados (kits/, docs/); defina CORTEX_RESOURCES.')
  const server = createCortexServer({ resources, cwd: process.cwd(), blenderBin: resolveBlenderBin(process.env) })
  await server.connect(new StdioServerTransport())
}

/** Só sobe o stdio quando é a entrada (o build define a flag; o teste importa sem subir). */
declare const __CORTEX_MCP_ENTRY__: boolean | undefined
if (typeof __CORTEX_MCP_ENTRY__ === 'boolean' && __CORTEX_MCP_ENTRY__) {
  main().catch((err: unknown) => {
    console.error('[cortex-mcp] falhou ao iniciar:', err)
    process.exit(1)
  })
}
