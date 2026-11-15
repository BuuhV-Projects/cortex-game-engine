import { z } from 'zod'
import { join, relative, resolve, isAbsolute } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { renderAssetThumbnails } from '../assets/renderThumbnails.js'
import { measureGlb } from '../assets/measureGlb.js'
import { loadKitInfo, buildAssetTable } from '../assets/kitInfo.js'
import { defineTool, textResult, type CompactImage } from '../toolDef.js'

/**
 * Tools de assets (SPEC-0737): `measure_glb` (bbox lendo o binário, Node puro) e `inspect_assets`
 * (thumbnail + medida de cada `.glb` de uma pasta, via Blender headless).
 *
 * `inspect_assets` não devolve imagem inline: cada imagem fica no contexto e é reenviada a cada turno. Ela
 * devolve a tabela (referência durável) e grava os thumbnails em `.cortex/asset-thumbs/`; o agente lê só
 * o da peça que precisa enxergar.
 */

/** Lado do thumbnail sem compressor (o MCP): PNG pequeno já na saída do Blender. */
const UNCOMPRESSED_THUMB_SIZE = 256
/** Lado do thumbnail com compressor (o Chat IA reduz depois). */
const COMPRESSED_THUMB_SIZE = 384
const MIN_THUMB_SIZE = 128
const MAX_THUMB_SIZE = 1024
const MAX_RENDERED_ASSETS = 120
const MAX_MEASURED_FILES = 50
/** Casas decimais nas medidas. */
const MEASURE_DECIMALS = 2

export const inspectAssets = defineTool({
  name: 'inspect_assets',
  description:
    'Renderiza um thumbnail de cada modelo .glb de um diretório do projeto e mede as dimensões (bounding ' +
    'box em unidades do engine), devolvendo uma tabela com nome, tamanho, caminho do .glb e caminho do ' +
    'thumbnail salvo em .cortex/asset-thumbs/ (leia a imagem da peça que precisar VER). Use antes de ' +
    'montar/popular uma cena com assets existentes: sem isso você só conhece o nome do arquivo. Se houver ' +
    'um kit.json no projeto, a tabela também traz role/gameplayRole/sockets de cada asset — autore pela ' +
    'intenção e conecte via attach. Requer Blender (BLENDER_PATH, instalação padrão ou PATH).',
  scope: 'project',
  schema: {
    dir: z.string().optional().describe('Diretório a inspecionar, relativo à raiz do projeto. Default "assets". Varre subpastas.'),
    size: z.number().int().min(MIN_THUMB_SIZE).max(MAX_THUMB_SIZE).optional().describe('Lado do thumbnail em px.'),
    max: z.number().int().min(1).max(MAX_RENDERED_ASSETS).optional().describe('Máximo de .glb a renderizar. Default 48.'),
  },
  handler: async ({ dir, size, max }, ctx) => {
    const { projectRoot, compressImage } = ctx
    const thumbSize = size ?? (compressImage ? COMPRESSED_THUMB_SIZE : UNCOMPRESSED_THUMB_SIZE)
    const result = await renderAssetThumbnails(projectRoot, { dir, size: thumbSize, max, blenderBin: ctx.blenderBin })
    if (!result.ok || result.thumbnails.length === 0) {
      return textResult(`Falha ao inspecionar assets: ${result.note}`, true)
    }

    const outDir = join(projectRoot, '.cortex', 'asset-thumbs')
    const thumbRel = new Map<string, string>()
    try {
      await mkdir(outDir, { recursive: true })
      for (const t of result.thumbnails) {
        if (!t.png) continue
        const img: CompactImage = compressImage ? compressImage(t.png) : { data: t.png, ext: 'png', mimeType: 'image/png' }
        const file = join(outDir, `${t.name}.${img.ext}`)
        await writeFile(file, img.data)
        thumbRel.set(t.name, relative(projectRoot, file).replace(/\\/g, '/'))
      }
    } catch {
      // Sem persistência: a tabela segue sem caminho de thumbnail.
    }

    const kit = await loadKitInfo(projectRoot, dir ?? 'assets')
    const table = buildAssetTable(result.thumbnails, thumbRel, kit)
    const kitNote = kit
      ? `\n\n**Kit detectado (\`${kit.path}\`${kit.theme ? `, theme \`${kit.theme}\`` : ''}).** A tabela traz ` +
        `\`role\`/\`gameplayRole\` de cada asset — AUTORE pela INTENÇÃO (chão=\`ground\`/\`platform\`, ` +
        `perigo=\`hazard\`, prêmio=\`gameplayRole: reward\`, marco=\`landmark\`), não só pela geometria. ` +
        `Em vez de bakear \`x\`/\`z\` de conexões, use \`attach\` no nó (\`{ socket, to, toSocket }\`) p/ peças ` +
        `com **âncoras** (col. Sockets) — o \`buildScene({ kit })\` encaixa por socket. Colliders vêm do \`role\`.`
      : ''
    const onDemandNote =
      `\n(${thumbRel.size} thumbnails salvos em .cortex/asset-thumbs/. Posicione pelas DIMENSÕES; leia ` +
      `SÓ o thumbnail da peça que precisar enxergar — não carregue imagens em massa.)` +
      kitNote
    return textResult(`${result.note}\n\n${table}${onDemandNote}`)
  },
})

export const measureGlbTool = defineTool({
  name: 'measure_glb',
  description:
    'Mede as DIMENSÕES (bounding box em metros, eixos L×A×P) de arquivos .glb específicos, lendo o binário ' +
    'direto (instantâneo, SEM Blender). Use quando só precisar das medidas de um ou poucos assets (conferir ' +
    'proporção em metros, espaçar/escalar uma peça) — é muito mais barato que `inspect_assets`. Atenção: ' +
    'mesh skinned (personagem rigado) reporta o bbox da BIND POSE, que pode não bater com a pose animada.',
  scope: 'project',
  schema: {
    paths: z
      .array(z.string().min(1))
      .min(1)
      .max(MAX_MEASURED_FILES)
      .describe('Caminhos dos .glb, relativos à raiz do projeto (ex.: ["assets/bridge.glb"]).'),
  },
  handler: async ({ paths }, ctx) => {
    const { projectRoot } = ctx
    const lines: string[] = [
      '| Asset | Tamanho (L×A×P, m) | min (x,y,z) | max (x,y,z) | Obs |',
      '| --- | --- | --- | --- | --- |',
    ]
    const fmt = (n: number): string => n.toFixed(MEASURE_DECIMALS)
    let anyOk = false
    for (const p of paths) {
      const absolute = isAbsolute(p) ? p : resolve(projectRoot, p)
      const rel = relative(projectRoot, absolute).replace(/\\/g, '/')
      if (rel.startsWith('..') || isAbsolute(rel)) {
        lines.push(`| ${p} | — | — | — | fora do projeto |`)
        continue
      }
      try {
        const m = measureGlb(await readFile(absolute))
        anyOk = true
        const obs = m.hasSkinnedMesh ? '⚠️ skinned (bbox = bind pose)' : '—'
        lines.push(
          `| ${rel} | ${fmt(m.size.x)} × ${fmt(m.size.y)} × ${fmt(m.size.z)} ` +
            `| ${fmt(m.min.x)}, ${fmt(m.min.y)}, ${fmt(m.min.z)} ` +
            `| ${fmt(m.max.x)}, ${fmt(m.max.y)}, ${fmt(m.max.z)} | ${obs} |`,
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        lines.push(`| ${rel} | — | — | — | erro: ${message} |`)
      }
    }
    return textResult(lines.join('\n'), !anyOk)
  },
})

export const assetTools = [inspectAssets, measureGlbTool]
