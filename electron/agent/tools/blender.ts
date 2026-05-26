import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { resolve, isAbsolute, relative, dirname } from 'path'
import { mkdir } from 'fs/promises'
import { BlenderModelGenerator } from '../../../src/ai/BlenderModelGenerator.js'

/**
 * MCP server in-process que expõe a tool `generate_blender_model` ao agente
 * do Chat IA (ADR-0019 reativada). Encapsula o {@link BlenderModelGenerator}
 * existente (ADR-0004): Claude gera um script Python `bpy`, executamos
 * Blender headless, devolvemos o `.glb`.
 *
 * O server precisa do `projectRoot` para resolver `target_path` relativo e
 * garantir que o `.glb` cai dentro do sandbox do projeto (ADR-0017). Por
 * isso é uma factory — uma instância nova por turno do agente.
 */
export function createBlenderToolServer(projectRoot: string) {
  return createSdkMcpServer({
    name: 'cortex-blender',
    version: '0.1.0',
    tools: [
      tool(
        'generate_blender_model',
        'Gera um modelo 3D (.glb) a partir de uma descrição em linguagem natural. ' +
          'Usa Claude para escrever um script Python do Blender (bpy) e executa ' +
          '`blender --background --python script.py` para exportar o arquivo. ' +
          'Requer Blender instalado no PATH (ou BLENDER_PATH apontando para o executável).',
        {
          description: z
            .string()
            .min(1)
            .describe(
              'Descrição do modelo desejado em linguagem natural ' +
                '(ex.: "espada medieval com lâmina metálica e cabo de madeira").',
            ),
          target_path: z
            .string()
            .min(1)
            .describe(
              'Caminho relativo (a partir da raiz do projeto) onde salvar o .glb ' +
                '(ex.: "assets/sword.glb"). Pastas intermediárias são criadas.',
            ),
        },
        async ({ description, target_path }) => {
          const absolute = isAbsolute(target_path)
            ? target_path
            : resolve(projectRoot, target_path)
          const rel = relative(projectRoot, absolute)
          if (rel.startsWith('..') || isAbsolute(rel)) {
            return errorResult(
              `target_path "${target_path}" sai do projeto (${projectRoot}).`,
            )
          }

          try {
            await mkdir(dirname(absolute), { recursive: true })
            const gen = new BlenderModelGenerator()
            const { glbPath, scriptPath } = await gen.generate(description, absolute)
            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    `Modelo 3D gerado.\n` +
                    `- Arquivo .glb: ${relative(projectRoot, glbPath)}\n` +
                    `- Script Python (debug): ${scriptPath}`,
                },
              ],
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return errorResult(`Falha ao gerar modelo: ${message}`)
          }
        },
      ),
    ],
  })
}

function errorResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    isError: true,
  }
}
