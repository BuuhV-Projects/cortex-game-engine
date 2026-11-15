import { join, relative } from 'node:path'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { AssetThumbnail } from './renderThumbnails.js'

/** Semântica de um asset lida do `kit.json` (design system, ADR-0053). */
export interface KitEntry {
  role?: string
  tags?: string[]
  gameplayRole?: string[]
  anchors?: string[]
}
export type KitInfo = { map: Map<string, KitEntry>; path: string; theme?: string }

/**
 * Procura e lê um `kit.json` próximo ao diretório inspecionado — assim o `inspect_assets` devolve a
 * SEMÂNTICA de cada asset (role/tags/gameplayRole/âncoras), não só dimensões. Indexa pelo basename do
 * `.glb`. Parse leve e defensivo (sem depender do schema zod do engine).
 */
export async function loadKitInfo(projectRoot: string, relDir: string): Promise<KitInfo | null> {
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
 * Tabela markdown com nome, dimensões (L×A×P) e caminhos de cada asset. Com `kit.json`, acrescenta a
 * semântica (role, gameplayRole, sockets) para autorar por intenção e conectar via `attach`.
 */
export function buildAssetTable(thumbs: AssetThumbnail[], thumbRel: Map<string, string>, kit: KitInfo | null): string {
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
