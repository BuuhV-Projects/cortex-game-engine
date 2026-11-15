import type { z } from 'zod'

/**
 * Definição de tool neutra de transporte (SPEC-0737): o servidor MCP `cortex` a registra no
 * `McpServer`, e o Chat IA (enquanto existir) a embrulha no `tool()` do Agent SDK. Uma lógica, dois
 * adaptadores.
 */

/** Bloco de conteúdo devolvido pela tool (subconjunto comum ao MCP e ao Agent SDK). */
export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }

export interface ToolResult {
  content: ToolContent[]
  isError?: boolean
  [key: string]: unknown
}

/** Imagem já comprimida para persistir em `.cortex/` (ver `CompressImage`). */
export interface CompactImage {
  data: Buffer
  ext: 'jpg' | 'png'
  mimeType: 'image/jpeg' | 'image/png'
}

/** Comprime um PNG; o Chat IA injeta o `nativeImage` do Electron, o MCP passa sem. */
export type CompressImage = (png: Buffer) => CompactImage

/** O que a tool sabe do ambiente em que roda. */
export interface ToolContext {
  /** Raiz do projeto do jogo (absoluta). */
  projectRoot: string
  /** `<recursos>/kits` do Studio, ou `undefined` sem kits empacotados. */
  kitsDir: string | undefined
  /** `<recursos>/docs/cortex-game-engine`, ou `undefined`. */
  docsDir: string | undefined
  /** Executável do Blender resolvido (ou `blender` do PATH). */
  blenderBin: string
  compressImage?: CompressImage
}

export type ToolShape = z.ZodRawShape

export interface ToolDef<Shape extends ToolShape = ToolShape> {
  name: string
  description: string
  schema: Shape
  /** `project`: o MCP acrescenta `projectDir` opcional à entrada. */
  scope: 'project' | 'global'
  handler: (args: z.infer<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<ToolResult>
}

/** Ajuda a inferir os tipos dos args a partir do `schema`. */
export function defineTool<Shape extends ToolShape>(def: ToolDef<Shape>): ToolDef<Shape> {
  return def
}

/** Atalho para uma resposta de texto. */
export function textResult(text: string, isError = false): ToolResult {
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] }
}
