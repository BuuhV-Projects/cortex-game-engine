import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { join, relative } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { runAndCaptureGame } from '../playtest/runAndCapture.js'

/**
 * MCP server in-process que expõe a tool `playtest_game` ao Chat IA (ADR-0033).
 * Sobe o vite do projeto numa BrowserWindow oculta do Electron, captura um
 * screenshot e os erros de console, e devolve a imagem + os erros ao modelo —
 * fechando o ciclo "implementou → testou → corrige". Ver runAndCapture.ts.
 *
 * Factory (recebe `projectRoot`) — uma instância por turno do agente.
 */
export function createPlaytestToolServer(projectRoot: string) {
  return createSdkMcpServer({
    name: 'cortex-playtest',
    version: '0.1.0',
    tools: [
      tool(
        'playtest_game',
        'Roda o jogo do projeto atual e captura um screenshot + os erros de ' +
          'console (runtime) pra você VER se a implementação funcionou. Sobe o ' +
          'vite numa janela oculta do Electron, renderiza alguns frames e tira ' +
          'a foto. Use depois de implementar algo visual/jogável pra validar e ' +
          'corrigir se necessário. Requer WebGPU no ambiente (engine WebGPU-only).',
        {
          waitMs: z
            .number()
            .int()
            .min(0)
            .max(15000)
            .optional()
            .describe('Espera (ms) após o load antes da captura, pra dar tempo de assets/init. Default 3000.'),
          width: z.number().int().min(160).max(3840).optional().describe('Largura da captura. Default 1280.'),
          height: z.number().int().min(120).max(2160).optional().describe('Altura da captura. Default 720.'),
        },
        async ({ waitMs, width, height }) => {
          const result = await runAndCaptureGame(projectRoot, { waitMs, width, height })

          const errorsText =
            result.consoleMessages.length > 0
              ? `Mensagens de console do jogo:\n${result.consoleMessages.join('\n')}`
              : 'Nenhuma mensagem de erro/console capturada.'

          if (!result.ok || !result.pngBuffer) {
            return {
              content: [{ type: 'text' as const, text: `Falha ao rodar o jogo: ${result.note}\n\n${errorsText}` }],
              isError: true,
            }
          }

          // Salva o PNG no sandbox do projeto (pra histórico + fallback: o agente
          // pode dar Read na imagem se o bloco de imagem não for suficiente).
          const dir = join(projectRoot, '.cortex', 'playtest')
          const file = join(dir, `${Date.now()}.png`)
          let savedRel = ''
          try {
            await mkdir(dir, { recursive: true })
            await writeFile(file, result.pngBuffer)
            savedRel = relative(projectRoot, file)
          } catch {
            // Se não conseguir salvar, segue só com o bloco de imagem.
          }

          return {
            content: [
              {
                type: 'image' as const,
                data: result.pngBuffer.toString('base64'),
                mimeType: 'image/png',
              },
              {
                type: 'text' as const,
                text:
                  `${result.note}\n` +
                  (savedRel ? `Screenshot salvo em: ${savedRel}\n` : '') +
                  `\n${errorsText}`,
              },
            ],
          }
        },
      ),
    ],
  })
}
