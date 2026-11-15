/**
 * Servidor MCP `cortex` de ponta a ponta (SPEC-0737): cliente MCP real por transporte em memória.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createCortexServer, ALL_TOOLS } from '../../mcp/server.js'

const REPO = process.cwd()
let client: Client

beforeAll(async () => {
  const server = createCortexServer({
    resources: { base: REPO, kitsDir: join(REPO, 'kits'), docsDir: join(REPO, 'docs', 'cortex-game-engine') },
    cwd: REPO,
    blenderBin: 'blender',
  })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'teste', version: '0' })
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
})

afterAll(async () => {
  await client.close()
})

describe('servidor MCP cortex', () => {
  it('anuncia as 10 tools da v1', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(ALL_TOOLS.map((t) => t.name).sort())
    expect(tools).toHaveLength(10)
  })

  it('tool de projeto ganha projectDir opcional; tool global não', async () => {
    const { tools } = await client.listTools()
    const props = (name: string) => Object.keys((tools.find((t) => t.name === name)!.inputSchema.properties ?? {}) as object)
    expect(props('validate_scene')).toContain('projectDir')
    expect(props('list_kits')).not.toContain('projectDir')
  })

  it('chama uma tool e devolve o texto', async () => {
    const r = await client.callTool({ name: 'engine_api_symbol', arguments: { name: 'Game', maxChars: 100 } })
    const content = r.content as Array<{ type: string; text: string }>
    expect(content[0]!.text).toContain('Class: Game')
  })

  it('erro de entrada volta isError sem derrubar o servidor', async () => {
    const r = await client.callTool({ name: 'import_kit', arguments: { kit: '../x' } })
    expect(r.isError).toBe(true)
    const again = await client.listTools()
    expect(again.tools.length).toBeGreaterThan(0)
  })

  it('expõe os dois guias como resources', async () => {
    const { resources } = await client.listResources()
    expect(resources.map((r) => r.uri).sort()).toEqual(['cortex://docs/architecture.md', 'cortex://docs/engine-api.md'])
  })
})
