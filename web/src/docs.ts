/**
 * Visualizador de documentação para `docs.html`.
 *
 * - Carrega todos os `.md` de `docs-content/` em build-time via
 *   `import.meta.glob` (Vite-only). Cada arquivo é uma página.
 * - Slug = nome do arquivo sem o prefixo numérico de ordenação e sem
 *   a extensão (`01-introducao.md` → `introducao`). A URL fica
 *   `docs.html#introducao`.
 * - Título = primeiro `# heading` do markdown; cai para o slug se faltar.
 * - Render: `marked` (single-pass, sem syntax highlighting por ora —
 *   plugin `marked-highlight` + `highlight.js` entram quando precisar).
 */

import { marked } from 'marked'

interface Doc {
  slug: string
  title: string
  order: number
  source: string
}

// Vite glob: eager + raw = strings carregadas no bundle, sem runtime fetch.
const MARKDOWN_MODULES = import.meta.glob('../docs-content/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const DOCS: Doc[] = Object.entries(MARKDOWN_MODULES)
  .map(([path, source]) => parseDoc(path, source))
  .sort((a, b) => a.order - b.order)

function parseDoc(path: string, source: string): Doc {
  // path = "../docs-content/01-introducao.md"
  const filename = path.split('/').pop() ?? path
  const stem = filename.replace(/\.md$/i, '')
  // Aceita prefixo "NN-" pra controlar ordem; remove pra formar slug
  const match = /^(\d+)-(.+)$/.exec(stem)
  const order = match ? parseInt(match[1], 10) : 999
  const slug = match ? match[2] : stem

  // Primeira heading H1 (ou primeira linha começando com #)
  const titleMatch = /^#\s+(.+)$/m.exec(source)
  const title = titleMatch ? titleMatch[1].trim() : slug

  return { slug, title, order, source }
}

// ─── Render ──────────────────────────────────────────────────────────────────

function currentSlug(): string {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash && DOCS.some((d) => d.slug === hash)) return hash
  return DOCS[0]?.slug ?? ''
}

function renderSidebar(activeSlug: string): void {
  const nav = document.getElementById('docs-nav')
  if (!nav) return
  nav.innerHTML = ''
  for (const doc of DOCS) {
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
  const doc = DOCS.find((d) => d.slug === slug)
  if (!doc) {
    container.innerHTML = '<p class="text-zinc-500">Documento não encontrado.</p>'
    return
  }
  // `marked.parse` é sync quando o input é string; cast pra string explicitamente.
  container.innerHTML = marked.parse(doc.source, { async: false }) as string
  // Foco no topo a cada navegação — UX padrão de docs com hash routing.
  window.scrollTo({ top: 0, behavior: 'instant' })
}

function update(): void {
  const slug = currentSlug()
  renderSidebar(slug)
  renderContent(slug)
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

if (DOCS.length === 0) {
  const container = document.getElementById('docs-content')
  if (container) {
    container.innerHTML =
      '<p class="text-zinc-500">Nenhum documento ainda. Adicione um arquivo <code>.md</code> em <code>web/docs-content/</code>.</p>'
  }
} else {
  update()
  window.addEventListener('hashchange', update)
}
