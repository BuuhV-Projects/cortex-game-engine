import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import { readdir, readFile, writeFile, mkdir, cp, copyFile } from 'fs/promises'

/**
 * MCP server `cortex-kits`: expõe os **kits de assets empacotados no engine**
 * (`<resourceBase>/kits/<nome>/`, ADR-0053) ao Chat IA. `list_kits` mostra o
 * catálogo (role/tags/temas); `import_kit` copia o kit escolhido (ou só alguns
 * assets) pro `assets/<kit>/` do projeto, com o `kit.json`. Assim a IA monta cena
 * com assets prontos sem o usuário importar arquivo por arquivo.
 */

interface KitAssetLite {
  role?: string
  tags?: string[]
  gameplayRole?: string[]
}
interface KitJson {
  name?: string
  theme?: string
  assets?: Record<string, KitAssetLite>
}

async function readKit(kitsDir: string, name: string): Promise<KitJson | null> {
  const p = join(kitsDir, name, 'kit.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(await readFile(p, 'utf-8')) as KitJson
  } catch {
    return null
  }
}

async function listKitNames(kitsDir: string | undefined): Promise<string[]> {
  if (!kitsDir || !existsSync(kitsDir)) return []
  const entries = await readdir(kitsDir, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory() && existsSync(join(kitsDir, e.name, 'kit.json')))
    .map((e) => e.name)
    .sort()
}

const SKIP_TAGS = new Set(['S', 'M', 'L', '2d', 'backdrop'])

export function createKitsToolServer(projectRoot: string, kitsDir: string | undefined) {
  return createSdkMcpServer({
    name: 'cortex-kits',
    version: '0.1.0',
    tools: [
      tool(
        'list_kits',
        'Lista os KITS de assets prontos empacotados no engine (modelos .glb e ' +
          'backdrops por tema), com contagem por role, tags/temas e quantos assets. ' +
          'Use ANTES de montar cena pra escolher um kit que combine com o jogo; depois ' +
          'use import_kit pra trazê-lo pro projeto. É a forma de reusar arte coerente ' +
          'em vez de gerar do zero.',
        {},
        async () => {
          const names = await listKitNames(kitsDir)
          if (names.length === 0) {
            return { content: [{ type: 'text' as const, text: 'Nenhum kit empacotado disponível.' }] }
          }
          const rows = ['| Kit | Assets | Roles | Temas/tags |', '| --- | --- | --- | --- |']
          for (const name of names) {
            const kit = await readKit(kitsDir!, name)
            const entries = Object.values(kit?.assets ?? {})
            const byRole: Record<string, number> = {}
            const tags = new Set<string>()
            for (const a of entries) {
              if (a.role) byRole[a.role] = (byRole[a.role] ?? 0) + 1
              for (const t of a.tags ?? []) if (!SKIP_TAGS.has(t)) tags.add(t)
            }
            const roleStr = Object.entries(byRole)
              .map(([r, n]) => `${r} ${n}`)
              .join(', ')
            const tagStr = [...tags].slice(0, 14).join(', ')
            rows.push(`| ${name} | ${entries.length} | ${roleStr} | ${tagStr} |`)
          }
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  rows.join('\n') +
                  '\n\nUse `import_kit { kit }` pra copiar um kit (ou `only` pra um subconjunto) ' +
                  'pro `assets/<kit>/` do projeto, com o `kit.json`.',
              },
            ],
          }
        },
      ),
      tool(
        'import_kit',
        'Copia um kit empacotado (ou só alguns arquivos) pro `assets/<kit>/` do ' +
          'projeto, junto do kit.json e thumbnails. Depois: referencie os modelos como ' +
          '`assets/<kit>/<arquivo>` nos nós da cena, importe `assets/<kit>/kit.json` e ' +
          'passe-o ao `buildScene({ kit })`.',
        {
          kit: z.string().describe('Nome do kit (exato, de list_kits).'),
          only: z
            .array(z.string())
            .optional()
            .describe('Opcional: só estes arquivos (nome com extensão, ex. "block-grass.glb"). Default: o kit inteiro.'),
        },
        async ({ kit, only }) => {
          if (!kitsDir || !existsSync(join(kitsDir, kit))) {
            return { content: [{ type: 'text' as const, text: `Kit "${kit}" não encontrado.` }], isError: true }
          }
          const srcAssets = join(kitsDir, kit, 'assets')
          const destRoot = join(projectRoot, 'assets', kit) // assets do JOGO (vão pro build)
          const thumbRel = `.cortex/kit-thumbs/${kit}` // referência DEV (fora do build)
          await mkdir(destRoot, { recursive: true })

          // 1) Assets do jogo (.glb/.jpg + subpastas tipo Textures/) → assets/<kit>/.
          const want = only ? new Set(only.map((s) => basename(s))) : null
          const copied = new Set<string>()
          if (existsSync(srcAssets)) {
            for (const f of await readdir(srcAssets, { withFileTypes: true })) {
              if (f.isDirectory()) {
                await cp(join(srcAssets, f.name), join(destRoot, f.name), { recursive: true })
                continue
              }
              if (want && !want.has(f.name)) continue
              await copyFile(join(srcAssets, f.name), join(destRoot, f.name))
              copied.add(f.name)
            }
          }
          const copiedStems = new Set([...copied].map((f) => f.replace(/\.[^.]+$/, '')))

          // 2) Thumbnails → .cortex (referência da IA; o BUILD do jogo NÃO os empacota).
          const srcThumbs = join(kitsDir, kit, 'thumbnails')
          const hasThumbs = existsSync(srcThumbs)
          if (hasThumbs) {
            await mkdir(join(projectRoot, thumbRel), { recursive: true })
            for (const t of await readdir(srcThumbs)) {
              if (!copiedStems.has(t.replace(/\.[^.]+$/, ''))) continue
              await copyFile(join(srcThumbs, t), join(projectRoot, thumbRel, t))
            }
          }

          // 3) kit.json (catálogo, runtime) → assets/<kit>/, com paths reescritos
          //    project-relative; thumb aponta pro .cortex (ou p/ a própria imagem em backdrops).
          const srcKit = join(kitsDir, kit, 'kit.json')
          if (existsSync(srcKit)) {
            let raw: { assets?: Record<string, Record<string, unknown>> } = {}
            try {
              raw = JSON.parse(await readFile(srcKit, 'utf-8'))
            } catch {
              /* kit.json inválido — escreve catálogo vazio */
            }
            const outAssets: Record<string, unknown> = {}
            for (const [key, a] of Object.entries(raw.assets ?? {})) {
              const file = basename(key)
              if (copied.size > 0 && !copied.has(file)) continue // só os importados
              const na = { ...a }
              const thumb = a['thumb']
              if (typeof thumb === 'string') {
                na['thumb'] = hasThumbs ? `${thumbRel}/${basename(thumb)}` : `assets/${kit}/${file}`
              }
              outAssets[`assets/${kit}/${file}`] = na
            }
            await writeFile(join(destRoot, 'kit.json'), JSON.stringify({ ...raw, assets: outAssets }, null, 2))
          }

          return {
            content: [
              {
                type: 'text' as const,
                text:
                  `Importado "${kit}" → assets/${kit}/ (${copied.size} asset(s)${only ? ' do subconjunto' : ''}).\n` +
                  `Nós da cena: \`url: "assets/${kit}/<arquivo>"\`; catálogo em \`assets/${kit}/kit.json\` → ` +
                  `\`buildScene({ kit })\` (collider/role + attach vêm dele).` +
                  (hasThumbs ? ` Thumbnails (referência, FORA do build) em \`${thumbRel}/\`.` : ''),
              },
            ],
          }
        },
      ),
    ],
  })
}
