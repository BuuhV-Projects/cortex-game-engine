import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { join, relative } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { runAndCaptureGame, type InputAction } from '../playtest/runAndCapture.js'

/**
 * MCP server in-process que expõe a tool `playtest_game` ao Chat IA (ADR-0033).
 * Sobe o vite do projeto numa BrowserWindow oculta do Electron, opcionalmente
 * injeta input (teclado) pra "jogar", captura screenshot(s) e as mensagens de
 * console, e devolve as imagens + os logs ao modelo — fechando o ciclo
 * "implementou → testou/jogou → corrige". Ver runAndCapture.ts.
 *
 * Factory (recebe `projectRoot`) — uma instância por turno do agente.
 */
export function createPlaytestToolServer(projectRoot: string) {
  return createSdkMcpServer({
    name: 'cortex-playtest',
    version: '0.2.0',
    tools: [
      tool(
        'playtest_game',
        'Roda o jogo do projeto atual numa janela oculta do Electron, deixa você ' +
          'JOGAR injetando input de teclado e captura screenshot(s) + as mensagens ' +
          'de console (logs/warns/erros de runtime) pra VER se a implementação ' +
          'funcionou. Passe `actions` pra simular input: ex. segurar ArrowRight ' +
          'andando, dar tap em Space pra pular, e screenshot em pontos-chave. Sem ' +
          '`actions`, só renderiza alguns frames e tira uma foto. Teclas: use o ' +
          'valor de KeyboardEvent.key ("ArrowLeft/Right/Up/Down", " " ou "Space", ' +
          '"Enter") ou letras ("a", "d"). Requer WebGPU (engine WebGPU-only).',
        {
          waitMs: z
            .number()
            .int()
            .min(0)
            .max(15000)
            .optional()
            .describe('Espera (ms) após o load, antes do input/captura, pra dar tempo de assets/init. Default 3000.'),
          width: z.number().int().min(160).max(3840).optional().describe('Largura da captura. Default 1280.'),
          height: z.number().int().min(120).max(2160).optional().describe('Altura da captura. Default 720.'),
          actions: z
            .array(
              z.discriminatedUnion('type', [
                z
                  .object({ type: z.literal('press'), key: z.string() })
                  .describe('Pressiona e MANTÉM a tecla (até um release).'),
                z
                  .object({ type: z.literal('release'), key: z.string() })
                  .describe('Solta a tecla.'),
                z
                  .object({
                    type: z.literal('tap'),
                    key: z.string(),
                    ms: z.number().int().min(0).max(5000).optional(),
                  })
                  .describe('Pressiona e solta rápido (default 80ms). Bom pra pulo/ataque.'),
                z
                  .object({ type: z.literal('wait'), ms: z.number().int().min(0).max(15000) })
                  .describe('Espera (ms) com o jogo rodando — use pra deixar o movimento acontecer.'),
                z
                  .object({ type: z.literal('screenshot') })
                  .describe('Captura um PNG neste ponto da timeline.'),
              ]),
            )
            .max(80)
            .optional()
            .describe(
              'Timeline de input pra jogar. Ex.: [{type:"press",key:"ArrowRight"},' +
                '{type:"wait",ms:1000},{type:"tap",key:"Space"},{type:"wait",ms:500},' +
                '{type:"screenshot"},{type:"release",key:"ArrowRight"}].',
            ),
        },
        async ({ waitMs, width, height, actions }) => {
          const result = await runAndCaptureGame(projectRoot, {
            waitMs,
            width,
            height,
            actions: actions as InputAction[] | undefined,
          })

          const logsText =
            result.consoleMessages.length > 0
              ? `Mensagens de console do jogo:\n${result.consoleMessages.join('\n')}`
              : 'Nenhuma mensagem de console capturada.'

          if (!result.ok || result.screenshots.length === 0) {
            return {
              content: [{ type: 'text' as const, text: `Falha ao rodar o jogo: ${result.note}\n\n${logsText}` }],
              isError: true,
            }
          }

          // Salva os PNGs no sandbox do projeto (histórico + fallback: o agente
          // pode dar Read na imagem se o bloco de imagem não bastar).
          const dir = join(projectRoot, '.cortex', 'playtest')
          const stamp = Date.now()
          const savedRels: string[] = []
          try {
            await mkdir(dir, { recursive: true })
            for (let i = 0; i < result.screenshots.length; i++) {
              const suffix = result.screenshots.length > 1 ? `-${i + 1}` : ''
              const file = join(dir, `${stamp}${suffix}.png`)
              await writeFile(file, result.screenshots[i]!)
              savedRels.push(relative(projectRoot, file))
            }
          } catch {
            // Se não conseguir salvar, segue só com os blocos de imagem.
          }

          const imageBlocks = result.screenshots.map((png) => ({
            type: 'image' as const,
            data: png.toString('base64'),
            mimeType: 'image/png',
          }))

          return {
            content: [
              ...imageBlocks,
              {
                type: 'text' as const,
                text:
                  `${result.note}\n` +
                  (savedRels.length > 0 ? `Screenshots salvos: ${savedRels.join(', ')}\n` : '') +
                  `\n${logsText}`,
              },
            ],
          }
        },
      ),
    ],
  })
}
