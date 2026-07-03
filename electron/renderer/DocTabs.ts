import { h, icon } from './ui'

interface Doc {
  path: string
  name: string
  kind: 'code' | 'glb' | 'image' | 'md'
  /** Aba de PREVIEW (estilo VSCode): título em itálico, reutilizada pelo próximo clique. */
  preview: boolean
}

function kindOf(name: string): Doc['kind'] {
  const e = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  if (e === 'glb' || e === 'gltf') return 'glb'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(e)) return 'image'
  if (e === 'md' || e === 'markdown') return 'md'
  return 'code'
}

/**
 * Barra de **doc-tabs** do centro (redesign Layout A): uma aba fixa "Cena · start"
 * (o viewport do jogo) + uma aba por documento aberto (código / glb / imagem / md).
 * É a fonte única das abas — o Editor esconde a sua barra interna e só reage a
 * `doc-show` / `doc-close`. Clicar na Cena volta pro viewport.
 *
 * **Abas de preview (estilo VSCode):** clique simples na árvore abre uma aba de
 * preview (itálico) que é REUTILIZADA pelo próximo arquivo clicado — não acumula
 * abas. Fixar: duplo clique na aba (ou no arquivo na árvore → `pin: true` no
 * `file-open`). Clique com o botão do MEIO fecha qualquer aba de documento.
 */
export class DocTabs {
  private bar: HTMLElement
  private docs: Doc[] = []
  private active = 'scene'

  constructor(container: HTMLElement) {
    this.bar = container
  }

  init(): void {
    // Abrir um arquivo → vira aba e fica ativo. `pin` (duplo clique na árvore)
    // abre já fixa; sem `pin`, abre como preview reutilizando a aba de preview
    // existente (fecha o doc antigo — o Editor/preview reage ao doc-close).
    document.addEventListener('file-open', (e) => {
      const { path, name, pin } = (e as CustomEvent<{ path: string; name: string; pin?: boolean }>).detail
      const existing = this.docs.find((d) => d.path === path)
      if (existing) {
        if (pin) existing.preview = false
      } else {
        const doc: Doc = { path, name, kind: kindOf(name), preview: !pin }
        const previewIdx = this.docs.findIndex((d) => d.preview)
        if (!pin && previewIdx >= 0) {
          const old = this.docs[previewIdx]
          this.docs[previewIdx] = doc // reutiliza o slot (mesma posição na barra)
          document.dispatchEvent(new CustomEvent('doc-close', { detail: { path: old.path, name: old.name } }))
        } else {
          this.docs.push(doc)
        }
      }
      this.active = path
      this.render()
    })
    document.addEventListener('project-close', () => {
      this.docs = []
      this.active = 'scene'
      this.render()
    })
    document.addEventListener('locale-change', () => this.render())
    this.render()
  }

  private render(): void {
    this.bar.className = 'doctabs'
    this.bar.textContent = ''
    this.bar.append(this.sceneTab())
    for (const d of this.docs) this.bar.append(this.docTab(d))
  }

  private sceneTab(): HTMLElement {
    const tab = h('div', { class: 'doctab' + (this.active === 'scene' ? ' on' : ''), onClick: () => this.activate('scene') },
      h('span', { class: 'scene-dot' }),
      h('span', { class: 'nm' }, 'Cena · start'),
    )
    return tab
  }

  private docTab(d: Doc): HTMLElement {
    const badge = d.kind === 'glb'
      ? h('span', { style: { fontSize: '8.5px', fontWeight: '800', color: 'var(--accent)', fontFamily: 'var(--mono)' } }, '3D')
      : icon(d.kind === 'image' ? 'eye' : d.kind === 'md' ? 'file' : 'file', { size: 12, color: 'var(--tx-lo)' })
    const close = h('span', { class: 'x' }, icon('close', { size: 10 }))
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      this.closeDoc(d.path)
    })
    const nm = h('span', { class: 'nm' }, d.name)
    if (d.preview) nm.style.fontStyle = 'italic' // sinal de aba de preview (VSCode)
    const tab = h('div', { class: 'doctab' + (this.active === d.path ? ' on' : ''), title: d.path, onClick: () => this.activate(d.path) },
      badge, nm, close,
    )
    // Duplo clique na aba FIXA a preview (vira permanente).
    tab.addEventListener('dblclick', () => {
      if (!d.preview) return
      d.preview = false
      this.render()
    })
    // Botão do MEIO fecha a aba (padrão VSCode/browser).
    tab.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return
      e.preventDefault()
      this.closeDoc(d.path)
    })
    return tab
  }

  private activate(id: string): void {
    this.active = id
    if (id === 'scene') {
      document.dispatchEvent(new CustomEvent('editor-doc-change', { detail: { kind: 'scene' } }))
    } else {
      const d = this.docs.find((x) => x.path === id)
      if (d) document.dispatchEvent(new CustomEvent('doc-show', { detail: { path: d.path, name: d.name } }))
    }
    this.render()
  }

  private closeDoc(path: string): void {
    const d = this.docs.find((x) => x.path === path)
    this.docs = this.docs.filter((x) => x.path !== path)
    document.dispatchEvent(new CustomEvent('doc-close', { detail: { path, name: d?.name ?? '' } }))
    if (this.active === path) {
      const next = this.docs[this.docs.length - 1]
      if (next) this.activate(next.path)
      else this.activate('scene')
    } else {
      this.render()
    }
  }
}
