import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { join, relative } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { renderAssetThumbnails, type AssetThumbnail } from '../assets/renderThumbnails.js'
import { toCompactImage, type CompactImage } from '../imageCompress.js'

/**
 * MCP server in-process que expõe a tool `inspect_assets` ao Chat IA. Renderiza
 * um thumbnail (3/4 view) de cada `.glb` de um diretório e mede o bounding box,
 * devolvendo as imagens + uma tabela de dimensões. É o que permite à IA "ver" os
 * modelos de um pacote importado antes de montar a cena — sem isso ela posiciona
 * assets só pelo nome do arquivo, e o resultado fica genérico/feio.
 *
 * Reusa o Blender headless (mesmo binário do generate_blender_model). Factory
 * com `projectRoot` — uma instância por turno do agente.
 */

/**
 * Imagens devolvidas inline como blocos multimodais por padrão: **zero**. Com o
 * *resume* do Agent SDK, cada image block enviado fica na conversa e é reenviado
 * a cada turno — então imagem só deve entrar no contexto **quando a tarefa atual
 * exigir VER aquela peça**, não em massa "por via das dúvidas". A tool devolve a
 * **tabela de dimensões** (texto, referência durável) e salva os thumbnails em
 * `.cortex/asset-thumbs`; o agente dá `Read` no thumbnail específico só na hora
 * de posicionar uma peça que precisa enxergar. Assim o contexto não carrega nada
 * de imagem sem necessidade.
 */
const MAX_IMAGE_BLOCKS = 0

export function createAssetToolServer(projectRoot: string) {
  return createSdkMcpServer({
    name: 'cortex-assets',
    version: '0.1.0',
    tools: [
      tool(
        'inspect_assets',
        'Renderiza um thumbnail de cada modelo .glb de um diretório do projeto e ' +
          'mede as dimensões (bounding box em unidades do engine), devolvendo as ' +
          'IMAGENS (você VÊ cada modelo) + uma tabela com nome, caminho e tamanho. ' +
          'Use SEMPRE antes de montar/popular uma cena com assets existentes (pacote ' +
          'importado): sem isso você está cego pros modelos e só conhece o nome do ' +
          'arquivo. As dimensões servem pra espaçar, escalar e conectar peças (ex.: ' +
          'alinhar uma ponte à borda de uma ilha). Requer Blender no PATH (ou BLENDER_PATH).',
        {
          dir: z
            .string()
            .optional()
            .describe('Diretório a inspecionar, relativo à raiz do projeto. Default "assets". Varre subpastas.'),
          size: z
            .number()
            .int()
            .min(128)
            .max(1024)
            .optional()
            .describe('Lado do thumbnail quadrado em px. Default 384.'),
          max: z
            .number()
            .int()
            .min(1)
            .max(120)
            .optional()
            .describe('Máximo de .glb a renderizar. Default 48. Aumente p/ pacotes grandes (mais lento).'),
        },
        async ({ dir, size, max }) => {
          const result = await renderAssetThumbnails(projectRoot, { dir, size, max })

          if (!result.ok || result.thumbnails.length === 0) {
            return {
              content: [{ type: 'text' as const, text: `Falha ao inspecionar assets: ${result.note}` }],
              isError: true,
            }
          }

          // Comprime cada thumbnail (JPEG 256px) ANTES de salvar/devolver. Com
          // 100+ assets, os PNGs RGBA full-res (~56KB cada) que a IA recebe E relê
          // de .cortex/asset-thumbs acumulam na sessão e estouram o limite de 32MB.
          // JPEG perde o alpha (fundo vira preto), mas o modelo continua reconhecível.
          const compact = new Map<string, CompactImage>()
          for (const t of result.thumbnails) {
            if (t.png) compact.set(t.name, toCompactImage(t.png, 256, 65))
          }

          // Persiste os thumbnails no sandbox (.cortex/asset-thumbs) — assim a IA
          // pode dar Read num thumbnail específico depois, sem re-renderizar tudo.
          const outDir = join(projectRoot, '.cortex', 'asset-thumbs')
          const thumbRel = new Map<string, string>()
          try {
            await mkdir(outDir, { recursive: true })
            for (const t of result.thumbnails) {
              const c = compact.get(t.name)
              if (!c) continue
              const file = join(outDir, `${t.name}.${c.ext}`)
              await writeFile(file, c.data)
              thumbRel.set(t.name, relative(projectRoot, file).replace(/\\/g, '/'))
            }
          } catch {
            // Sem persistência, segue só com os blocos de imagem.
          }

          const table = buildTable(result.thumbnails, thumbRel)

          // Imagem só sob demanda: por padrão NÃO devolve thumbnail nenhum — só a
          // tabela (referência durável). Cada `.glb` tem um thumbnail comprimido
          // salvo em .cortex/asset-thumbs; a IA dá `Read` no caminho da tabela só
          // quando precisar VER aquela peça pra posicioná-la. Mantém o contexto leve.
          const withImg = result.thumbnails.filter((t) => compact.has(t.name))
          const imageBlocks =
            MAX_IMAGE_BLOCKS > 0
              ? withImg.slice(0, MAX_IMAGE_BLOCKS).map((t) => {
                  const c = compact.get(t.name)!
                  return { type: 'image' as const, data: c.data.toString('base64'), mimeType: c.mimeType }
                })
              : []
          const onDemandNote =
            `\n(${withImg.length} assets medidos. A TABELA acima é a referência — posicione pelas DIMENSÕES. ` +
            `Os thumbnails estão salvos em .cortex/asset-thumbs/: dê \`Read\` SÓ no thumbnail da peça que você ` +
            `for posicionar e precisar enxergar — não carregue imagens em massa.)`

          return {
            content: [
              ...imageBlocks,
              {
                type: 'text' as const,
                text: `${result.note}\n\n${table}${onDemandNote}`,
              },
            ],
          }
        },
      ),
    ],
  })
}

/** Tabela markdown com nome, dimensões (LxAxP) e caminhos de cada asset. */
function buildTable(thumbs: AssetThumbnail[], thumbRel: Map<string, string>): string {
  const header =
    '| Asset | Tamanho (L×A×P, unidades) | Caminho .glb | Thumbnail |\n' +
    '| --- | --- | --- | --- |'
  const rows = thumbs.map((t) => {
    const d = t.dims
      ? `${t.dims.x} × ${t.dims.y} × ${t.dims.z}`
      : '— (falhou)'
    const thumb = thumbRel.get(t.name) ?? '—'
    return `| ${t.name} | ${d} | ${t.assetPath} | ${thumb} |`
  })
  return [header, ...rows].join('\n')
}
