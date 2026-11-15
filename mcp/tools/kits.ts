import { z } from 'zod'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile, mkdir, cp, copyFile } from 'node:fs/promises'
import { defineTool, textResult, type ToolResult } from '../toolDef.js'

/**
 * Tools de kits (SPEC-0737): os **kits de assets empacotados no engine** (`<recursos>/kits/<nome>/`,
 * ADR-0053). `list_kits` mostra o catálogo; `list_kit_assets` os arquivos de um kit; `import_kit` copia o
 * kit (ou só alguns assets) para `assets/<kit>/` do projeto, com o `kit.json`.
 */

interface KitAssetLite {
  role?: string
  tags?: string[]
  gameplayRole?: string[]
  size?: number[]
}
interface KitJson {
  name?: string
  theme?: string
  assets?: Record<string, KitAssetLite>
}

const SKIP_TAGS = new Set(['S', 'M', 'L', '2d', 'backdrop'])
/** Tags mostradas por kit no `list_kits`. */
const MAX_TAGS_SHOWN = 14
/** Linhas padrão do `list_kit_assets`. */
const DEFAULT_ASSET_ROWS = 80
/** Casas decimais do tamanho (×100 → 2 casas). */
const SIZE_ROUNDING = 100

async function readKit(kitsDir: string, name: string): Promise<KitJson | null> {
  const p = join(kitsDir, name, 'kit.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(await readFile(p, 'utf-8')) as KitJson
  } catch {
    return null
  }
}

export async function listKitNames(kitsDir: string | undefined): Promise<string[]> {
  if (!kitsDir || !existsSync(kitsDir)) return []
  const entries = await readdir(kitsDir, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory() && existsSync(join(kitsDir, e.name, 'kit.json')))
    .map((e) => e.name)
    .sort()
}

/** Só nome de kit listado: barra `../` e caminhos que sairiam da pasta de kits. */
async function knownKit(kitsDir: string | undefined, kit: string): Promise<ToolResult | null> {
  const names = await listKitNames(kitsDir)
  if (names.includes(kit)) return null
  return textResult(`Kit "${kit}" não encontrado. Kits disponíveis: ${names.join(', ') || 'nenhum'}.`, true)
}

export const listKits = defineTool({
  name: 'list_kits',
  description:
    'Lista os KITS de assets prontos empacotados no engine (modelos .glb e backdrops por tema), com ' +
    'contagem por role, tags/temas e quantos assets. Use ANTES de montar cena pra escolher um kit que ' +
    'combine com o jogo; depois use import_kit pra trazê-lo pro projeto. É a forma de reusar arte ' +
    'coerente em vez de gerar do zero.',
  scope: 'global',
  schema: {},
  handler: async (_args, ctx) => {
    const names = await listKitNames(ctx.kitsDir)
    if (names.length === 0) return textResult('Nenhum kit empacotado disponível.')
    const rows = ['| Kit | Assets | Roles | Temas/tags |', '| --- | --- | --- | --- |']
    for (const name of names) {
      const kit = await readKit(ctx.kitsDir!, name)
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
      const tagStr = [...tags].slice(0, MAX_TAGS_SHOWN).join(', ')
      rows.push(`| ${name} | ${entries.length} | ${roleStr} | ${tagStr} |`)
    }
    return textResult(
      rows.join('\n') +
        '\n\nDepois: `list_kit_assets { kit }` pra ver os arquivos e escolher, então ' +
        '`import_kit { kit, only: [...] }` pra copiar SÓ os assets usados pro ' +
        '`assets/<kit>/` do projeto (com o `kit.json`).',
    )
  },
})

export const listKitAssets = defineTool({
  name: 'list_kit_assets',
  description:
    'Lista os ARQUIVOS de um kit (nome .glb + role/gameplayRole/tamanho/tags) SEM copiar nada. Use ' +
    'DEPOIS de escolher um kit no list_kits e ANTES do import_kit: assim você descobre os nomes exatos e ' +
    'escolhe só o que vai usar, passando-os em `import_kit { only: [...] }` — em vez de importar o kit ' +
    'inteiro (centenas de modelos). Filtre por `role`/`gameplayRole`/`tag` pra reduzir a lista.',
  scope: 'global',
  schema: {
    kit: z.string().describe('Nome do kit (exato, de list_kits).'),
    role: z.string().optional().describe('Opcional: só assets com este role (ex. "platform", "decoration").'),
    gameplayRole: z.string().optional().describe('Opcional: só assets com este gameplayRole (ex. "reward").'),
    tag: z.string().optional().describe('Opcional: só assets com esta tag/tema (ex. "forest").'),
    limit: z.number().int().positive().optional().describe(`Opcional: nº máx. de linhas (default ${DEFAULT_ASSET_ROWS}).`),
  },
  handler: async ({ kit, role, gameplayRole, tag, limit }, ctx) => {
    const unknown = await knownKit(ctx.kitsDir, kit)
    if (unknown) return unknown
    const data = await readKit(ctx.kitsDir!, kit)
    const all = Object.entries(data?.assets ?? {})
    if (all.length === 0) return textResult(`Kit "${kit}" não tem assets no kit.json.`)
    const filtered = all.filter(([, a]) => {
      if (role && a.role !== role) return false
      if (gameplayRole && !(a.gameplayRole ?? []).includes(gameplayRole)) return false
      if (tag && !(a.tags ?? []).includes(tag)) return false
      return true
    })
    const shown = filtered.slice(0, limit ?? DEFAULT_ASSET_ROWS)
    const rows = ['| Arquivo | Role | Gameplay | Tamanho (LAP) | Tags |', '| --- | --- | --- | --- | --- |']
    for (const [key, a] of shown) {
      const gp = (a.gameplayRole ?? []).join(', ')
      const sz = a.size ? a.size.map((n) => (Math.round(n * SIZE_ROUNDING) / SIZE_ROUNDING).toString()).join('×') : ''
      const tags = (a.tags ?? []).filter((t) => !SKIP_TAGS.has(t)).join(', ')
      rows.push(`| ${basename(key)} | ${a.role ?? ''} | ${gp} | ${sz} | ${tags} |`)
    }
    const note =
      filtered.length > shown.length
        ? `\n\nMostrando ${shown.length} de ${filtered.length} (filtre por role/gameplayRole/tag ou aumente \`limit\`).`
        : `\n\n${filtered.length} asset(s)${role || gameplayRole || tag ? ' no filtro' : ''}.`
    return textResult(
      rows.join('\n') + note + `\n\nImporte SÓ os que vai usar: \`import_kit { kit: "${kit}", only: ["arquivo1.glb", ...] }\`.`,
    )
  },
})

export const importKit = defineTool({
  name: 'import_kit',
  description:
    'Copia assets de um kit pro `assets/<kit>/` do projeto, junto do kit.json e thumbnails. PREFIRA ' +
    'SEMPRE `only` com os arquivos que a cena vai usar (descubra os nomes com `list_kit_assets`) — assim o ' +
    'projeto só recebe o que é usado. Importar o kit INTEIRO (omitindo `only`) despeja centenas de modelos ' +
    'não usados em disco. Depois: referencie os modelos como `assets/<kit>/<arquivo>` nos nós da cena, ' +
    'importe `assets/<kit>/kit.json` e passe-o ao `buildScene({ kit })`.',
  scope: 'project',
  schema: {
    kit: z.string().describe('Nome do kit (exato, de list_kits).'),
    only: z
      .array(z.string())
      .optional()
      .describe('Recomendado: só estes arquivos (ex. "block-grass.glb"). Omitir = copia o kit INTEIRO.'),
  },
  handler: async ({ kit, only }, ctx) => {
    const unknown = await knownKit(ctx.kitsDir, kit)
    if (unknown) return unknown
    const kitsDir = ctx.kitsDir!
    const { projectRoot } = ctx
    const srcAssets = join(kitsDir, kit, 'assets')
    const destRoot = join(projectRoot, 'assets', kit) // assets do JOGO (vão pro build)
    const thumbRel = `.cortex/kit-thumbs/${kit}` // referência DEV (fora do build)
    const entries = existsSync(srcAssets) ? await readdir(srcAssets, { withFileTypes: true }) : []

    // `only` com nome que o kit não tem (typo, sem `.glb`): erro antes de gravar qualquer coisa.
    const want = only ? new Set(only.map((s) => basename(s))) : null
    if (want) {
      const available = new Set(entries.filter((f) => !f.isDirectory()).map((f) => f.name))
      const missing = [...want].filter((n) => !available.has(n))
      if (missing.length > 0) {
        return textResult(
          `O kit "${kit}" não tem: ${missing.join(', ')}. Nada foi importado. ` +
            `Confira os nomes (com a extensão) em \`list_kit_assets { kit: "${kit}" }\`.`,
          true,
        )
      }
    }
    await mkdir(destRoot, { recursive: true })

    // 1) Assets do jogo (.glb/.jpg + subpastas tipo Textures/) → assets/<kit>/.
    const copied = new Set<string>()
    for (const f of entries) {
      if (f.isDirectory()) {
        await cp(join(srcAssets, f.name), join(destRoot, f.name), { recursive: true })
        continue
      }
      if (want && !want.has(f.name)) continue
      await copyFile(join(srcAssets, f.name), join(destRoot, f.name))
      copied.add(f.name)
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

    // 3) kit.json (catálogo, runtime) → assets/<kit>/, com paths project-relative.
    const subset = want ? copied : null
    await writeImportedKitJson(join(kitsDir, kit, 'kit.json'), destRoot, kit, subset, hasThumbs ? thumbRel : null)

    return textResult(
      `Importado "${kit}" → assets/${kit}/ (${copied.size} asset(s)${only ? ' do subconjunto' : ''}).\n` +
        `Nós da cena: \`url: "assets/${kit}/<arquivo>"\`; catálogo em \`assets/${kit}/kit.json\` → ` +
        `\`buildScene({ kit })\` (collider/role + attach vêm dele).` +
        (hasThumbs ? ` Thumbnails (referência, FORA do build) em \`${thumbRel}/\`.` : ''),
    )
  },
})

/**
 * Reescreve o `kit.json` com os paths do projeto; `thumb` aponta para o `.cortex` (ou p/ o asset).
 * `subset` (import com `only`) limita o catálogo aos arquivos copiados; `null` = kit inteiro.
 */
async function writeImportedKitJson(
  srcKit: string,
  destRoot: string,
  kit: string,
  subset: Set<string> | null,
  thumbRel: string | null,
): Promise<void> {
  if (!existsSync(srcKit)) return
  let raw: { assets?: Record<string, Record<string, unknown>> } = {}
  try {
    raw = JSON.parse(await readFile(srcKit, 'utf-8'))
  } catch {
    /* kit.json inválido — escreve catálogo vazio */
  }
  const outAssets: Record<string, unknown> = {}
  for (const [key, a] of Object.entries(raw.assets ?? {})) {
    const file = basename(key)
    if (subset && !subset.has(file)) continue // só os importados
    const na = { ...a }
    const thumb = a['thumb']
    if (typeof thumb === 'string') na['thumb'] = thumbRel ? `${thumbRel}/${basename(thumb)}` : `assets/${kit}/${file}`
    outAssets[`assets/${kit}/${file}`] = na
  }
  await writeFile(join(destRoot, 'kit.json'), JSON.stringify({ ...raw, assets: outAssets }, null, 2))
}

export const kitTools = [listKits, listKitAssets, importKit]
