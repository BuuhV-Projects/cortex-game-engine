import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { join, relative } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { runAndCaptureGame, type InputAction, type InspectCameraOption } from '../playtest/runAndCapture.js'
import { toCompactImage } from '../imageCompress.js'

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
          '`actions`, só renderiza alguns frames e tira uma foto. Passe `camera` pra ' +
          'VER a cena de qualquer ângulo com uma câmera livre (orbitar/enquadrar), ' +
          'sem depender da câmera de gameplay que segue o player. Teclas: use o ' +
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
          wait_for: z
            .string()
            .optional()
            .describe(
              'Espera DETERMINÍSTICA: expressão JS avaliada na página a cada 500ms até virar ' +
                'truthy (ex.: "window.__bootStage === \'pronto\'" se o jogo expõe um marco de boot). ' +
                'Prefira isso a aumentar waitMs às cegas. No timeout (60s), o diagnóstico vai pro ' +
                'console e a captura segue mesmo assim.',
            ),
          eval_js: z
            .string()
            .optional()
            .describe(
              'JS executado após o boot, ANTES das actions — ex.: teleportar o player pra um ' +
                'checkpoint ou ativar câmera overview antes da foto. O retorno aparece no console ([eval]).',
            ),
          width: z.number().int().min(160).max(3840).optional().describe('Largura da captura. Default 1280.'),
          height: z.number().int().min(120).max(2160).optional().describe('Altura da captura. Default 720.'),
          camera: z
            .object({
              orbit: z
                .object({
                  yaw: z.number().optional().describe('Azimute horizontal (graus). 0 = de frente; cresce girando ao redor.'),
                  pitch: z.number().optional().describe('Elevação (graus). Negativo = olhando DE CIMA. Default -25.'),
                  dist: z.number().positive().optional().describe('Distância ao alvo (unidades). Omitido = auto (enquadra).'),
                  target: z
                    .tuple([z.number(), z.number(), z.number()])
                    .optional()
                    .describe('Ponto observado [x,y,z]. Omitido = centro da cena.'),
                })
                .optional()
                .describe('Orbita ao redor de um alvo. Ignorado se `pos` vier.'),
              pos: z
                .tuple([z.number(), z.number(), z.number()])
                .optional()
                .describe('Pose explícita: posição da câmera no mundo [x,y,z].'),
              lookAt: z
                .tuple([z.number(), z.number(), z.number()])
                .optional()
                .describe('Ponto observado da pose explícita (default origem).'),
              fov: z.number().min(10).max(120).optional().describe('Field of view (graus).'),
            })
            .optional()
            .describe(
              'CÂMERA DE INSPEÇÃO: vê a cena de QUALQUER ângulo, livre da câmera de gameplay (que segue o ' +
                'player). Use pra inspecionar o cenário montado. `orbit:{yaw,pitch,dist,target}` orbita um ' +
                'alvo (sem dist = auto-enquadra); `pos`+`lookAt` é pose explícita; objeto vazio {} enquadra a ' +
                'cena inteira. Fica ativa por todo o playtest (todas as fotos saem por ela, com a gameplay ' +
                'rodando). Render cru (sem pós-processamento).',
            ),
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
        async ({ waitMs, width, height, actions, wait_for, eval_js, camera }) => {
          const result = await runAndCaptureGame(projectRoot, {
            waitMs,
            width,
            height,
            waitFor: wait_for,
            evalJs: eval_js,
            camera: camera as InspectCameraOption | undefined,
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

          // Comprime cada screenshot (JPEG redimensionado) ANTES de virar bloco —
          // PNGs full-res acumulam na sessão e estouram o limite de 32 MB/request.
          const compact = result.screenshots.map((png) => toCompactImage(png))

          // Salva os comprimidos no sandbox (histórico + fallback: o agente pode
          // dar Read na imagem se o bloco não bastar) — disco também fica menor.
          const dir = join(projectRoot, '.cortex', 'playtest')
          const stamp = Date.now()
          const savedRels: string[] = []
          try {
            await mkdir(dir, { recursive: true })
            for (let i = 0; i < compact.length; i++) {
              const suffix = compact.length > 1 ? `-${i + 1}` : ''
              const file = join(dir, `${stamp}${suffix}.${compact[i]!.ext}`)
              await writeFile(file, compact[i]!.data)
              savedRels.push(relative(projectRoot, file))
            }
          } catch {
            // Se não conseguir salvar, segue só com os blocos de imagem.
          }

          const imageBlocks = compact.map((c) => ({
            type: 'image' as const,
            data: c.data.toString('base64'),
            mimeType: c.mimeType,
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
