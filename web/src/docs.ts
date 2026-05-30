/**
 * Visualizador de documentação para `docs.html`.
 *
 * - Carrega `.md` de `docs-content/{en,pt}/` em build-time via
 *   `import.meta.glob`. Cada arquivo é uma página.
 * - Slug = nome do arquivo sem o prefixo numérico de ordenação e sem
 *   a extensão (`01-introduction.md` → `introduction`). A URL fica
 *   `docs.html#introduction`.
 * - Título = primeiro `# heading` do markdown; cai para o slug se faltar.
 * - Render: `marked` (single-pass, sem syntax highlighting por ora).
 * - i18n: o conjunto de docs muda quando o usuário troca o idioma
 *   (evento `locale-change` disparado por `src/i18n.ts`).
 */

import { marked } from 'marked'
import {
  applyTranslations,
  getCurrentLocale,
  setupLanguageToggle,
  t,
  type Locale,
} from './i18n'

interface Doc {
  slug: string
  title: string
  order: number
  source: string
}

// Glob estática em build-time. Vite resolve uma única vez; runtime só
// indexa o objeto. Carregar os dois idiomas sempre é trivialmente barato
// (poucos KB cada) e evita refetch ao trocar de idioma.
const EN_MODULES = import.meta.glob('../docs-content/en/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const PT_MODULES = import.meta.glob('../docs-content/pt/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const DOCS: Record<Locale, Doc[]> = {
  en: Object.entries(EN_MODULES).map(parseDoc).sort(byOrder),
  pt: Object.entries(PT_MODULES).map(parseDoc).sort(byOrder),
}

function parseDoc([path, source]: [string, string]): Doc {
  const filename = path.split('/').pop() ?? path
  const stem = filename.replace(/\.md$/i, '')
  const match = /^(\d+)-(.+)$/.exec(stem)
  const order = match ? parseInt(match[1], 10) : 999
  const slug = match ? match[2] : stem
  const titleMatch = /^#\s+(.+)$/m.exec(source)
  const title = titleMatch ? titleMatch[1].trim() : slug
  return { slug, title, order, source }
}

function byOrder(a: Doc, b: Doc): number {
  return a.order - b.order
}

// ─── Render ──────────────────────────────────────────────────────────────────

function currentDocs(): Doc[] {
  return DOCS[getCurrentLocale()]
}

function currentSlug(): string {
  const hash = window.location.hash.replace(/^#/, '')
  const docs = currentDocs()
  if (hash && docs.some((d) => d.slug === hash)) return hash
  return docs[0]?.slug ?? ''
}

function renderSidebar(activeSlug: string): void {
  const nav = document.getElementById('docs-nav')
  if (!nav) return
  nav.innerHTML = ''
  for (const doc of currentDocs()) {
    const link = document.createElement('a')
    link.href = `#${doc.slug}`
    link.textContent = doc.title
    const base = 'rounded-md px-3 py-1.5 transition'
    const active = 'bg-sky-500/10 text-sky-300'
    const idle = 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'
    link.className = `${base} ${doc.slug === activeSlug ? active : idle}`
    nav.appendChild(link)
  }
}

function renderContent(slug: string): void {
  const container = document.getElementById('docs-content')
  if (!container) return
  const doc = currentDocs().find((d) => d.slug === slug)
  if (!doc) {
    container.innerHTML = `<p class="text-zinc-500">${escapeHtml(t('docs.not_found'))}</p>`
    return
  }
  container.innerHTML = marked.parse(doc.source, { async: false }) as string
  window.scrollTo({ top: 0, behavior: 'instant' })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function update(): void {
  const slug = currentSlug()
  renderSidebar(slug)
  renderContent(slug)
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

applyTranslations()
setupLanguageToggle()

// Estilo do toggle ativo (mesmo da landing).
const style = document.createElement('style')
style.textContent = `[data-lang].active { background: rgb(39 39 42); color: white; }`
document.head.appendChild(style)

if (currentDocs().length === 0) {
  const container = document.getElementById('docs-content')
  if (container) {
    container.innerHTML = `<p class="text-zinc-500">${t('docs.empty_html')}</p>`
  }
} else {
  update()
  window.addEventListener('hashchange', update)
  // Trocar idioma rebuilda a sidebar e re-renderiza o conteúdo.
  document.addEventListener('locale-change', () => {
    applyTranslations()
    update()
  })
}
