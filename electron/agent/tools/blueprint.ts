import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { join, relative } from 'path'
import { existsSync, readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { renderBlueprintHtml, type BlueprintDoc, type KitAsset } from '../blueprint/renderBlueprint.js'
import { rasterizeBlueprint } from '../blueprint/rasterize.js'
import { toCompactImage } from '../imageCompress.js'

/**
 * MCP server `cortex-blueprint`: expõe a tool `generate_blueprint` ao Chat IA.
 * A IA compõe o `blueprint.json` (design + COMPORTAMENTO de cada peça, seguindo o
 * bloco "BLUEPRINT DE FASE" do system prompt) e esta tool RENDERIZA a imagem
 * determinística: thumbnails reais das peças (do kit empacotado ou do cache do
 * inspect_assets), script + params de cada peça de gameplay, caminho do jogador e
 * legenda com o nome de arquivo exato. Devolve um image block (padrão do
 * playtest_game). Espelha a skill `blueprint-fase` do Claude Code — ver
 * `blueprint/renderBlueprint.ts`. Factory com `projectRoot`/`kitsDir`.
 */

/** Data-URI mime por extensão de thumbnail. */
function mimeFor(ext: string): string {
  return ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
}

/** Lê o kit.json (kit empacotado OU dir do projeto) → Map<assetName, KitAsset>. */
function loadKitAssets(candidates: string[]): { map: Map<string, KitAsset>; path: string | null } {
  const map = new Map<string, KitAsset>()
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as {
        assets?: Record<string, KitAsset>
      }
      if (!raw?.assets || typeof raw.assets !== 'object') continue
      for (const [key, v] of Object.entries(raw.assets)) {
        const base = key.split('/').pop()!.replace(/\.glb$/i, '')
        map.set(base, { role: v?.role, tags: v?.tags, size: v?.size, gameplayRole: v?.gameplayRole })
      }
      return { map, path: p }
    } catch {
      // kit.json inválido — tenta o próximo candidato.
    }
  }
  return { map, path: null }
}

const BEHAVIOR_ENUM = [
  'spawn', 'goal', 'checkpoint', 'collectible', 'hazard', 'hazard-spinner',
  'hazard-chaser', 'launcher', 'platform', 'platform-moving', 'blocker', 'ground', 'decoration',
] as const

// Schema de uma peça — espelha BlueprintPiece. `behavior` é enum pra guiar o agente.
const pieceSchema = z.object({
  asset: z.string().describe('Nome do arquivo do kit SEM .glb (ex.: "trampoline_1_001"). Vira a legenda.'),
  x: z.number().describe('Centro X em px no canvas (origem topo-esquerdo).'),
  y: z.number().describe('Centro Y em px (y cresce pra baixo).'),
  behavior: z.enum(BEHAVIOR_ENUM).optional().describe('Papel de gameplay — deriva a cor e o script sugerido. Escolha o asset cujo role/tags casa.'),
  script: z.string().optional().describe('Componente real que o dev crava (default vem do behavior). Ex.: "Perigo", "Trampolim".'),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe('Params-chave de gameplay, ex.: { "raio": 1.8 } ou { "impulso": 22 }.'),
  note: z.string().optional().describe('Rótulo pt curto do PROPÓSITO (ex.: "mata ao tocar").'),
  scale: z.number().optional().describe('Multiplica o tamanho auto (derivado do bbox).'),
  px: z.number().optional().describe('Largura fixa em px (ignora o bbox).'),
  flag: z.string().optional().describe('Badge: "START" | "FIM" | "OBJETIVO".'),
  flagColor: z.string().optional().describe('Cor do badge (hex).'),
  category: z.string().optional().describe('Fallback legado de cor — prefira behavior.'),
})

const blueprintSchema = z.object({
  kit: z.string().optional().describe('Rótulo do kit no cabeçalho.'),
  title: z.string().optional().describe('Título; o que vem depois de "—" fica em destaque.'),
  subtitleKick: z.string().optional().describe('Linha superior em caixa-alta (ex.: "FASE 01 · SIDE-SCROLLER").'),
  subtitle: z.string().optional().describe('Descrição curta pro dev.'),
  orientation: z.enum(['top-down', 'side-scroller']).optional(),
  canvas: z.object({ w: z.number(), h: z.number() }).optional().describe('px da área de composição. Default 1920×1080.'),
  grid: z.number().optional().describe('Espaçamento da grade de fundo. Default 44.'),
  pxPerUnit: z.number().optional().describe('px por unidade de mundo (escala das thumbs). Default 7.'),
  steps: z.array(z.object({ n: z.union([z.number(), z.string()]), title: z.string(), desc: z.string().optional() })).optional(),
  zones: z.array(z.object({ label: z.string(), kind: z.string().optional(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })).optional(),
  pathD: z.string().optional().describe('Caminho do jogador — atributo SVG `d` (M/L/Q).'),
  pieces: z.array(pieceSchema).describe('As peças posicionadas — cada uma com seu comportamento.'),
})

export function createBlueprintToolServer(projectRoot: string, kitsDir: string | undefined) {
  return createSdkMcpServer({
    name: 'cortex-blueprint',
    version: '0.1.0',
    tools: [
      tool(
        'generate_blueprint',
        'Gera a IMAGEM de um BLUEPRINT DE FASE (planta de level design orientada a ' +
          'gameplay) a partir de um `blueprint` que VOCÊ compõe: peças posicionadas com ' +
          'thumbnails REAIS do kit, o COMPORTAMENTO de cada peça (script + params), o ' +
          'caminho do jogador e a legenda com o nome de arquivo exato. Use pra COMUNICAR ' +
          'o design de uma fase antes de montá-la (o que vai onde, com que propósito, em ' +
          'que ordem). Cada peça de gameplay deve declarar `behavior` (spawn/goal/' +
          'checkpoint/collectible/hazard/hazard-spinner/hazard-chaser/launcher/platform/' +
          'platform-moving/blocker/ground/decoration) — escolha o asset cujo role/tags ' +
          'CASA (não por estética; a tool avisa se não casar). Ver o bloco "BLUEPRINT DE ' +
          'FASE" nas instruções pro schema completo. Devolve a imagem (PNG).',
        {
          source: z
            .string()
            .describe(
              'De onde vêm os assets/thumbnails: NOME de um kit empacotado (ex.: "platformer-space", ' +
                'veja list_kits) OU caminho de um dir de assets do projeto com kit.json (ex.: "assets/kit-space").',
            ),
          blueprint: blueprintSchema.describe('O documento do blueprint que você compõe (design + comportamento).'),
          scale: z.number().min(1).max(3).optional().describe('Escala de rasterização (nitidez). Default 2.'),
        },
        async ({ source, blueprint, scale }) => {
          // 1) Resolve kit.json (kit empacotado OU dir do projeto).
          const kitJsonCandidates = [
            ...(kitsDir ? [join(kitsDir, source, 'kit.json')] : []),
            join(projectRoot, source, 'kit.json'),
            join(projectRoot, source, '..', 'kit.json'),
            join(projectRoot, 'assets', source, 'kit.json'),
            join(projectRoot, 'assets', 'kit.json'),
          ]
          const { map: kitAssets, path: kitPath } = loadKitAssets(kitJsonCandidates)

          // 2) Diretórios candidatos de thumbnail, em ordem de preferência:
          //    kit empacotado → dir do projeto → cache do inspect_assets.
          const thumbDirs = [
            ...(kitsDir ? [join(kitsDir, source, 'thumbnails')] : []),
            join(projectRoot, source, 'thumbnails'),
            join(projectRoot, 'assets', source, 'thumbnails'),
            join(projectRoot, '.cortex', 'asset-thumbs'),
          ]
          const resolveThumb = (name: string): string | null => {
            for (const dir of thumbDirs) {
              for (const ext of ['.png', '.jpg', '.jpeg']) {
                const p = join(dir, `${name}${ext}`)
                if (existsSync(p)) {
                  try {
                    const b64 = readFileSync(p).toString('base64')
                    return `data:${mimeFor(ext)};base64,${b64}`
                  } catch {
                    // segue tentando
                  }
                }
              }
            }
            return null
          }

          // 3) Render determinístico → HTML + dimensões + avisos.
          const { html, width, height, warnings, counts } = renderBlueprintHtml(
            blueprint as BlueprintDoc,
            kitAssets,
            resolveThumb,
          )

          // 4) Rasteriza numa BrowserWindow oculta.
          const tmpDir = join(projectRoot, '.cortex', 'blueprints')
          let png: Buffer
          try {
            png = await rasterizeBlueprint(html, width, height, tmpDir, scale ?? 2)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            return { content: [{ type: 'text' as const, text: `Falha ao rasterizar o blueprint: ${msg}` }], isError: true }
          }

          // 5) Salva (histórico + fallback Read) e comprime pro image block.
          const stamp = Date.now()
          let savedRel = ''
          try {
            await mkdir(tmpDir, { recursive: true })
            const file = join(tmpDir, `blueprint-${stamp}.png`)
            await writeFile(file, png)
            savedRel = relative(projectRoot, file).replace(/\\/g, '/')
          } catch {
            // segue só com o bloco de imagem
          }
          const compact = toCompactImage(png, 1840, 82)

          const warnText =
            warnings.length > 0
              ? `\n\n⚠️ AVISOS (${warnings.length}) — corrija e regenere:\n` + warnings.map((w) => `  - ${w}`).join('\n')
              : '\n\n✓ Sem avisos: cada peça casa com seu comportamento.'
          const countText = Object.entries(counts)
            .map(([c, n]) => `${c} ${n}`)
            .join(', ')
          const kitNote = kitPath
            ? `kit.json: ${relative(projectRoot, kitPath).replace(/\\/g, '/')}`
            : `⚠️ kit.json de "${source}" não encontrado — sem validação de comportamento nem escala por bbox.`

          return {
            content: [
              { type: 'image' as const, data: compact.data.toString('base64'), mimeType: compact.mimeType },
              {
                type: 'text' as const,
                text:
                  `Blueprint gerado (${blueprint.pieces.length} peças: ${countText}). ${kitNote}` +
                  (savedRel ? `\nSalvo: ${savedRel}` : '') +
                  warnText,
              },
            ],
          }
        },
      ),
    ],
  })
}
