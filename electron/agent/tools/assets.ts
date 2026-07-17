import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { join, relative, resolve, isAbsolute } from 'path'
import { existsSync } from 'fs'
import { mkdir, writeFile, readFile } from 'fs/promises'
import { renderAssetThumbnails, type AssetThumbnail } from '../assets/renderThumbnails.js'
import { measureGlb } from '../assets/measureGlb.js'
import { toCompactImage, type CompactImage } from '../imageCompress.js'

/** Semântica de um asset lida do `kit.json` (design system, ADR-0053). */
interface KitEntry {
  role?: string
  tags?: string[]
  gameplayRole?: string[]
  anchors?: string[]
}
type KitInfo = { map: Map<string, KitEntry>; path: string; theme?: string }

/**
 * Procura e lê um `kit.json` (manifesto do design system, ADR-0053) próximo ao
 * diretório inspecionado — assim o `inspect_assets` devolve a SEMÂNTICA de cada
 * asset (role/tags/gameplayRole/âncoras), não só dimensões. Indexa por basename
 * do `.glb`. Parse leve e defensivo (sem depender do schema zod do engine).
 */
async function loadKitInfo(projectRoot: string, relDir: string): Promise<KitInfo | null> {
  const candidates = [
    join(projectRoot, relDir, 'kit.json'),
    join(projectRoot, relDir, '..', 'kit.json'),
    join(projectRoot, 'assets', 'kit.json'),
    join(projectRoot, 'kit.json'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      const raw = JSON.parse(await readFile(p, 'utf-8')) as {
        theme?: string
        assets?: Record<string, KitEntry & { anchors?: Record<string, unknown> }>
      }
      if (!raw?.assets || typeof raw.assets !== 'object') continue
      const map = new Map<string, KitEntry>()
      for (const [key, v] of Object.entries(raw.assets)) {
        const base = key.split('/').pop()!.replace(/\.glb$/i, '')
        map.set(base, {
          role: typeof v?.role === 'string' ? v.role : undefined,
          tags: Array.isArray(v?.tags) ? v.tags : undefined,
          gameplayRole: Array.isArray(v?.gameplayRole) ? v.gameplayRole : undefined,
          anchors: v?.anchors && typeof v.anchors === 'object' ? Object.keys(v.anchors) : undefined,
        })
      }
      return { map, path: relative(projectRoot, p).replace(/\\/g, '/'), theme: raw.theme }
    } catch {
      // kit.json inválido — segue sem semântica.
    }
  }
  return null
}

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
          'alinhar uma ponte à borda de uma ilha). Se houver um kit.json (design system) ' +
          'no projeto, a tabela também traz role/gameplayRole/sockets de cada asset — ' +
          'autore pela intenção e conecte via attach. Requer Blender no PATH (ou BLENDER_PATH).',
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

          const kit = await loadKitInfo(projectRoot, dir ?? 'assets')
          const table = buildTable(result.thumbnails, thumbRel, kit)

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
          const kitNote = kit
            ? `\n\n**Kit detectado (\`${kit.path}\`${kit.theme ? `, theme \`${kit.theme}\`` : ''}).** A tabela traz ` +
              `\`role\`/\`gameplayRole\` de cada asset — AUTORE pela INTENÇÃO (chão=\`ground\`/\`platform\`, ` +
              `perigo=\`hazard\`, prêmio=\`gameplayRole: reward\`, marco=\`landmark\`), não só pela geometria. ` +
              `Em vez de bakear \`x\`/\`z\` de conexões, use \`attach\` no nó (\`{ socket, to, toSocket }\`) p/ peças ` +
              `com **âncoras** (col. Sockets) — o \`buildScene({ kit })\` encaixa por socket. Colliders vêm do \`role\`.`
            : ''
          const onDemandNote =
            `\n(${withImg.length} assets medidos. A TABELA acima é a referência — posicione pelas DIMENSÕES. ` +
            `Os thumbnails estão salvos em .cortex/asset-thumbs/: dê \`Read\` SÓ no thumbnail da peça que você ` +
            `for posicionar e precisar enxergar — não carregue imagens em massa.)` +
            kitNote

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
      tool(
        'measure_glb',
        'Mede as DIMENSÕES (bounding box em metros, eixos L×A×P) de arquivos .glb ' +
          'específicos, lendo o binário direto (Node puro — instantâneo, SEM Blender). ' +
          'Use quando só precisar das medidas de um ou poucos assets (conferir proporção ' +
          'em metros, espaçar/escalar uma peça) — é muito mais barato que `inspect_assets` ' +
          '(que renderiza thumbnails de um diretório inteiro via Blender). Atenção: mesh ' +
          'skinned (personagem rigado) reporta o bbox da BIND POSE, que pode não bater ' +
          'com a pose animada.',
        {
          paths: z
            .array(z.string().min(1))
            .min(1)
            .max(50)
            .describe('Caminhos dos .glb, relativos à raiz do projeto (ex.: ["assets/bridge.glb"]).'),
        },
        async ({ paths }) => {
          const lines: string[] = [
            '| Asset | Tamanho (L×A×P, m) | min (x,y,z) | max (x,y,z) | Obs |',
            '| --- | --- | --- | --- | --- |',
          ]
          const fmt = (n: number): string => n.toFixed(2)
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
          return {
            content: [{ type: 'text' as const, text: lines.join('\n') }],
            ...(anyOk ? {} : { isError: true as const }),
          }
        },
      ),
    ],
  })
}

/**
 * Tabela markdown com nome, dimensões (LxAxP) e caminhos de cada asset. Quando há
 * um `kit.json` (design system), acrescenta colunas de **semântica** (role,
 * gameplayRole, sockets) — pra a IA autorar por intenção e conectar via `attach`.
 */
function buildTable(thumbs: AssetThumbnail[], thumbRel: Map<string, string>, kit: KitInfo | null): string {
  const header = kit
    ? '| Asset | Tamanho (L×A×P) | Role | GameplayRole | Sockets | Caminho .glb | Thumbnail |\n' +
      '| --- | --- | --- | --- | --- | --- | --- |'
    : '| Asset | Tamanho (L×A×P, unidades) | Caminho .glb | Thumbnail |\n' + '| --- | --- | --- | --- |'
  const rows = thumbs.map((t) => {
    const d = t.dims ? `${t.dims.x} × ${t.dims.y} × ${t.dims.z}` : '— (falhou)'
    const thumb = thumbRel.get(t.name) ?? '—'
    if (!kit) return `| ${t.name} | ${d} | ${t.assetPath} | ${thumb} |`
    const e = kit.map.get(t.name)
    const role = e?.role ?? '—'
    const gp = e?.gameplayRole?.join(', ') || '—'
    const sockets = e?.anchors?.join(', ') || '—'
    return `| ${t.name} | ${d} | ${role} | ${gp} | ${sockets} | ${t.assetPath} | ${thumb} |`
  })
  return [header, ...rows].join('\n')
}
