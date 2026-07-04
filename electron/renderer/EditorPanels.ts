import { t } from './i18n'
import { h, icon } from './ui'

/** Botão de ação compacto (play/stop) — agrupado/inline no inspector. */
function isActionBtn(label?: string): boolean {
  const l = (label ?? '').trim()
  return l.startsWith('▶') || l.startsWith('⏹')
}

/** Ícone + cor por tipo de Object3D na hierarquia (estilo Layout A). */
function typeMeta(type: string): { icon: string; color: string } {
  const t = type.toLowerCase()
  if (t.includes('camera')) return { icon: 'camera', color: 'oklch(0.72 0.13 235)' }
  if (t.includes('light')) return { icon: 'sun', color: 'oklch(0.82 0.13 85)' }
  if (t.includes('helper')) return { icon: 'focus', color: 'oklch(0.55 0.012 280)' }
  if (t.includes('group') || t.includes('scene') || t.includes('object3d')) return { icon: 'folder', color: 'oklch(0.70 0.16 285)' }
  return { icon: 'cube', color: 'oklch(0.74 0.15 150)' }
}

/**
 * Painéis **nativos da IDE** do editor (ADR-0056): hierarquia (outliner) +
 * inspector, renderizados como chrome ao redor do preview — estilo Blender, fora
 * da tela do jogo e visíveis também durante o Play.
 *
 * A fonte da verdade é o engine, rodando no iframe do Preview: ele publica um
 * **modelo declarativo** via `postMessage` (após um handshake hello→ack) e estes
 * painéis o renderizam e mandam comandos de volta (selecionar, editar campo,
 * apertar botão, alternar edit/play). Toda a lógica de domínio fica no engine.
 */

// ── Protocolo (espelha src/editor/EditorModel.ts) ─────────────────────────────
interface OutlinerItem {
  id: string
  label: string
  type: string
  selected: boolean
  children: OutlinerItem[]
}
interface SelectOption {
  value: string
  label: string
}
interface Field {
  kind: 'vec3' | 'number' | 'checkbox' | 'select' | 'color' | 'button' | 'note' | 'file' | 'text'
  id: string
  label?: string
  value?: number | boolean | string | [number, number, number]
  options?: SelectOption[]
  step?: number
  variant?: 'normal' | 'primary' | 'danger'
  text?: string
  tone?: 'muted' | 'info'
  accept?: string
  placeholder?: string
}
interface Section {
  title?: string
  fields: Field[]
}
interface InspectorModel {
  title: string
  empty: boolean
  sections: Section[]
}
interface ViewportInfo {
  camera?: string
  fps?: number
  objects?: number
  lights?: number
  selected?: string | null
  gizmo?: 'translate' | 'rotate' | 'scale'
}
interface StateMessage {
  source: 'cortex-editor'
  type: 'state'
  editorActive: boolean
  paused?: boolean
  outliner: { items: OutlinerItem[] }
  inspector: InspectorModel
  viewport?: ViewportInfo
}

const ENGINE = 'cortex-editor'
const IDE = 'cortex-ide'

export class EditorPanels {
  private outlinerListEl!: HTMLElement
  private inspectorEl!: HTMLElement

  /** Janela do iframe que fez o handshake (destino dos comandos). */
  private target: Window | null = null
  private editorActive = true
  private paused = false

  // Reconciliação do inspector: chave de estrutura + updaters por campo.
  private inspectorKey = ''
  private updaters = new Map<string, (f: Field) => void>()

  // Hierarquia: último estado + filtro + nós EXPANDIDOS (default = tudo colapsado).
  private lastItems: OutlinerItem[] = []
  private lastOutlinerJson = ''
  private filter = ''
  private expanded = new Set<string>()

  /**
   * @param outlinerHost  onde a árvore de hierarquia é montada (aba Hierarquia do LeftDock).
   * @param inspectorHost onde o inspector é montado (dock direito, antes do chat).
   */
  constructor(
    private outlinerHost: HTMLElement,
    private inspectorHost: HTMLElement,
  ) {}

  init(): void {
    this.buildHosts()
    window.addEventListener('message', (ev) => this.onMessage(ev))
    // Se o projeto para/fecha, o iframe some — limpa os painéis.
    document.addEventListener('play-stopped', () => this.reset())
    document.addEventListener('project-close', () => this.reset())
    // Troca de idioma: reconstrói os hosts e repinta a partir do último estado.
    document.addEventListener('locale-change', () => {
      this.buildHosts()
      this.renderOutliner(this.lastItems)
    })
    // Transport da toolbar (Shell) controla a gameplay via a ponte (Unity-style).
    document.addEventListener('request-editor-play', () => this.send({ type: 'editor', active: !this.editorActive }))
    document.addEventListener('request-editor-pause', () => this.send({ type: 'pause' }))
    // "Adicionar terreno" (menu Projeto) → cria um terreno na cena via a ponte.
    document.addEventListener('request-add-terrain', () => this.send({ type: 'addTerrain' }))
    // "Forma: …" (menu Cena, blockout/ProBuilder — ADR-0071) → cria um nó `mesh`.
    document.addEventListener('request-add-shape', (e) =>
      this.send({ type: 'addShape', kind: (e as CustomEvent<{ kind: string }>).detail.kind }))
    // "Desenhar caixa no chão" (menu Cena, ProBuilder New Shape) → arma o desenho.
    document.addEventListener('request-draw-shape', () => this.send({ type: 'drawShape' }))
    // "Desenhar estrada" (menu Cena, Road Architect — ADR-0072) → arma o desenho.
    document.addEventListener('request-draw-road', () => this.send({ type: 'drawRoad' }))
    // "Vegetação" (menu Cena — ADR-0077) → cria o nó e liga o pincel (modelo no Inspector).
    document.addEventListener('request-add-vegetation', () => this.send({ type: 'addVegetation' }))
    // Picker "Adicionar modelo (.glb)" (ADR-0093): o modal abre NO frame do jogo.
    document.addEventListener('request-add-model', () => this.send({ type: 'openModelPicker' }))
    // Drop de asset no viewport (ADR-0090): o Preview captura o drop no overlay e
    // repassa url + posição normalizada; o engine raycasta e adiciona o modelo lá.
    document.addEventListener('request-drop-asset', (e) => {
      const { url, nx, ny } = (e as CustomEvent<{ url: string; nx: number; ny: number }>).detail
      this.send({ type: 'dropAsset', url, nx, ny })
    })
    // Botões de ferramenta (mover/girar/escalar) das pills do viewport.
    document.addEventListener('request-tool', (e) => {
      this.send({ type: 'tool', mode: (e as CustomEvent<{ mode: string }>).detail.mode })
    })
    // Busca da aba Hierarquia (LeftDock) filtra a árvore.
    document.addEventListener('hierarchy-filter', (e) => {
      this.filter = (((e as CustomEvent<{ query: string }>).detail.query) || '').toLowerCase()
      this.renderOutliner(this.lastItems)
    })
    // Botão "minimizar tudo" (LeftDock): colapsa toda a árvore.
    document.addEventListener('hierarchy-collapse-all', () => {
      this.expanded.clear()
      this.renderOutliner(this.lastItems)
    })
  }

  private buildHosts(): void {
    // Hierarquia: só a lista (o header/abas/busca são do LeftDock).
    this.outlinerHost.innerHTML = ''
    const oList = h('div', { class: 'tree scroll grow' })
    this.outlinerHost.append(oList)
    this.outlinerListEl = oList

    // Inspector (dock direito): header + corpo.
    this.inspectorHost.innerHTML = ''
    this.inspectorHost.className = 'panel inspector-dock'
    const body = h('div', { class: 'insp scroll grow' })
    this.inspectorHost.append(
      h('div', { class: 'panel-h' }, h('span', { class: 'ttl lit' }, t('editor.properties'))),
      body,
    )
    this.inspectorEl = body
    this.inspectorKey = ''
    this.updaters = new Map()
    this.renderInspector({ title: '', empty: true, sections: [] })
  }

  private reset(): void {
    this.target = null
    this.lastItems = []
    this.renderOutliner([])
    this.inspectorKey = ''
    this.renderInspector({ title: '', empty: true, sections: [] })
  }

  private onMessage(ev: MessageEvent): void {
    const data = ev.data as { source?: string; type?: string } | null
    if (!data || data.source !== ENGINE) return
    if (data.type === 'hello') {
      this.target = ev.source as Window
      this.send({ type: 'ack' })
      return
    }
    if (data.type === 'state') {
      if (!this.target) this.target = ev.source as Window
      this.renderState(data as StateMessage)
    }
  }

  private send(msg: Record<string, unknown>): void {
    this.target?.postMessage({ source: IDE, ...msg }, '*')
  }

  private renderState(state: StateMessage): void {
    this.editorActive = state.editorActive
    this.paused = state.paused ?? false
    // Avisa a toolbar (Shell) do estado de play/pause pra refletir o transport.
    document.dispatchEvent(
      new CustomEvent('editor-active-change', { detail: { active: this.editorActive, paused: this.paused } }),
    )
    // Info do viewport (câmera/perf/seleção/ferramenta) → pills flutuantes (Preview/Shell).
    if (state.viewport) {
      document.dispatchEvent(new CustomEvent('editor-viewport', { detail: state.viewport }))
    }
    // Só re-renderiza a hierarquia se os itens mudaram de verdade — senão o
    // publish frequente (câmera/transform) reconstruía a árvore e jogava o scroll
    // pro topo.
    this.lastItems = state.outliner.items
    const ojson = JSON.stringify(this.lastItems)
    if (ojson !== this.lastOutlinerJson) {
      this.lastOutlinerJson = ojson
      this.renderOutliner(this.lastItems)
    }
    this.renderInspector(state.inspector)
  }

  // ── Hierarquia (árvore aninhada + filtro de busca) ─────────────────────────
  /** `true` se o item (ou algum descendente) casa com o filtro. */
  private matches(item: OutlinerItem): boolean {
    if (!this.filter) return true
    if (item.label.toLowerCase().includes(this.filter)) return true
    return item.children.some((c) => this.matches(c))
  }

  private renderOutliner(items: OutlinerItem[]): void {
    if (!this.outlinerListEl) return
    const scroll = this.outlinerListEl.scrollTop // preserva a posição do scroll
    this.outlinerListEl.textContent = ''
    for (const item of items) this.renderNode(item, 0)
    this.outlinerListEl.scrollTop = scroll
    if (this.outlinerListEl.childElementCount === 0) {
      this.outlinerListEl.append(
        h('div', { style: { padding: '8px', color: 'var(--tx-dim)', fontSize: '11px' } },
          this.filter ? 'Nada encontrado.' : '—'),
      )
    }
  }

  private renderNode(item: OutlinerItem, depth: number): void {
    if (!this.matches(item)) return
    const m = typeMeta(item.type)
    const dim = item.label.startsWith('(') || item.label.startsWith('__')
    const hasChildren = item.children.length > 0
    // Default colapsado: só expande o que o usuário abriu. Sob filtro, tudo aberto.
    const isCollapsed = hasChildren && !this.expanded.has(item.id) && !this.filter

    const chev = hasChildren
      ? icon(isCollapsed ? 'chevR' : 'chevD', { size: 11, color: 'var(--tx-dim)' })
      : h('span', { class: 'indent', style: { width: '11px' } })
    if (hasChildren) {
      chev.style.cursor = 'pointer'
      chev.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.expanded.has(item.id)) this.expanded.delete(item.id)
        else this.expanded.add(item.id)
        this.renderOutliner(this.lastItems)
      })
    }

    const node = h('div', { class: 'node' + (item.selected ? ' sel' : '') + (dim ? ' dim' : ''), title: item.type },
      h('span', { class: 'indent', style: { width: `${depth * 13}px` } }),
      chev,
      h('span', { class: 'ico', style: { color: item.selected ? 'var(--accent)' : m.color } }, icon(m.icon, { size: 13 })),
      h('span', { class: 'nm' }, item.label),
    )
    node.addEventListener('click', () => {
      this.send({ type: 'select', id: item.id })
      this.send({ type: 'focus', id: item.id })
    })
    this.outlinerListEl.append(node)

    if (hasChildren && !isCollapsed) for (const c of item.children) this.renderNode(c, depth + 1)
  }

  private structureKey(model: InspectorModel): string {
    const parts: string[] = [model.empty ? 'E' : 'F']
    for (const s of model.sections) for (const f of s.fields) {
      // Botão/nota não têm updater de valor — inclui o TEXTO na chave pra um label
      // dinâmico (ex.: "Esculpir" ⇄ "Parar de esculpir") forçar o rebuild e aparecer.
      const dyn = f.kind === 'button' ? `|${(f as { label?: string }).label ?? ''}`
        : f.kind === 'note' ? `|${(f as { text?: string }).text ?? ''}`
        // Opções dinâmicas de select (ex.: texturas do projeto após importar)
        // forçam rebuild — o updater só atualiza o VALOR, não a lista.
        : f.kind === 'select' ? `|${(f.options ?? []).map((o) => o.value).join('§')}`
        : ''
      parts.push(`${f.id}|${f.kind}${dyn}`)
    }
    return parts.join(',')
  }

  private renderInspector(model: InspectorModel): void {
    const key = this.structureKey(model)
    if (key === this.inspectorKey) {
      // Mesma estrutura: só atualiza valores (sem pisar no input em foco).
      for (const s of model.sections) for (const f of s.fields) this.updaters.get(f.id)?.(f)
      return
    }
    this.inspectorKey = key
    this.updaters = new Map()
    this.inspectorEl.textContent = ''

    if (model.empty) {
      this.inspectorEl.append(
        h('div', { class: 'sec-b', style: { color: 'var(--tx-lo)' } }, t('editor.nothing_selected')),
      )
      return
    }

    // Cabeçalho do objeto (chip + nome).
    this.inspectorEl.append(
      h('div', { class: 'insp-id' },
        h('span', { class: 'chip' }, icon('cube', { size: 17 })),
        h('div', { class: 'col', style: { gap: '2px' } }, h('span', { class: 'nm' }, model.title)),
      ),
    )

    for (const section of model.sections) {
      const body = h('div', { class: 'sec-b' })
      const fs = section.fields
      let i = 0
      while (i < fs.length) {
        const f = fs[i]!
        const next = fs[i + 1]
        // select + botão de ação (▶/⏹) → uma linha só (select cresce, botão compacto).
        if (f.kind === 'select' && next && next.kind === 'button' && isActionBtn(next.label)) {
          body.append(this.buildSelectAction(f, next))
          i += 2
          continue
        }
        // sequência de botões de ação → agrupa numa linha (ex.: ▶ Tocar · ⏹ Parar).
        if (f.kind === 'button' && isActionBtn(f.label)) {
          const group: Field[] = []
          while (i < fs.length && fs[i]!.kind === 'button' && isActionBtn(fs[i]!.label)) group.push(fs[i++]!)
          body.append(h('div', { class: 'cge-btn-row' }, ...group.map((g) => this.buildButton(g, true))))
          continue
        }
        body.append(this.buildField(f))
        i++
      }
      const sec = h('div', { class: 'sec' })
      if (section.title) {
        sec.append(h('div', { class: 'sec-h' }, icon('chevD', { size: 12 }), h('span', { class: 'lbl' }, section.title)))
      }
      sec.append(body)
      this.inspectorEl.append(sec)
    }
  }

  /** Linha: rótulo + (select que cresce + botão de ação compacto ▶/⏹). */
  private buildSelectAction(sel: Field, btn: Field): HTMLElement {
    return h('div', { class: 'field cge-field-action' },
      h('span', { class: 'k' }, sel.label ?? ''),
      h('div', { class: 'row gap-6', style: { minWidth: '0' } },
        h('label', { class: 'num cge-insp-select', style: { flex: '1 1 auto', minWidth: '0' } }, this.selectControl(sel)),
        this.buildButton(btn, true),
      ),
    )
  }

  private buildField(f: Field): HTMLElement {
    switch (f.kind) {
      case 'vec3':
        return this.buildVec3(f)
      case 'number':
        return this.buildNumber(f)
      case 'checkbox':
        return this.buildCheckbox(f)
      case 'select':
        return this.buildSelect(f)
      case 'color':
        return this.buildColor(f)
      case 'button':
        return this.buildButton(f)
      case 'file':
        return this.buildFile(f)
      case 'text':
        return this.buildText(f)
      case 'note':
      default:
        return this.buildNote(f)
    }
  }

  /** Texto livre (ex.: renomear objeto) — commit no Enter/blur, não por tecla. */
  private buildText(f: Field): HTMLElement {
    const input = h('input', { type: 'text', value: String(f.value ?? '') }) as HTMLInputElement
    if (f.placeholder) input.placeholder = f.placeholder
    input.addEventListener('change', () => this.send({ type: 'field', id: f.id, value: input.value }))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur()
      e.stopPropagation()
    })
    this.updaters.set(f.id, (nf) => {
      if (document.activeElement !== input) input.value = String(nf.value ?? '')
    })
    return h('div', { class: 'field' }, h('span', { class: 'k' }, f.label ?? ''), h('label', { class: 'num' }, input))
  }

  private buildVec3(f: Field): HTMLElement {
    const vals = (f.value as [number, number, number]) ?? [0, 0, 0]
    const inputs: HTMLInputElement[] = []
    const axes = ['x', 'y', 'z'] as const
    const emit = (): void =>
      this.send({
        type: 'field',
        id: f.id,
        value: [Number(inputs[0].value) || 0, Number(inputs[1].value) || 0, Number(inputs[2].value) || 0],
      })
    const vec = h('div', { class: 'vec' })
    for (let i = 0; i < 3; i++) {
      const input = h('input', { type: 'number', value: fmt(vals[i]), onInput: emit }) as HTMLInputElement
      input.step = String(f.step ?? 0.1)
      inputs.push(input)
      vec.append(h('label', { class: 'num' }, h('span', { class: 'ax ' + axes[i] }, axes[i].toUpperCase()), input))
    }
    this.updaters.set(f.id, (nf) => {
      const v = nf.value as [number, number, number]
      for (let i = 0; i < 3; i++) if (document.activeElement !== inputs[i]) inputs[i].value = fmt(v[i])
    })
    return h('div', { class: 'field' }, h('span', { class: 'k' }, f.label ?? ''), vec)
  }

  private buildNumber(f: Field): HTMLElement {
    const input = h('input', {
      type: 'number',
      value: fmt(Number(f.value)),
      onInput: () => {
        const v = parseFloat(input.value)
        if (!Number.isNaN(v)) this.send({ type: 'field', id: f.id, value: v })
      },
    }) as HTMLInputElement
    input.step = String(f.step ?? 0.1)
    this.updaters.set(f.id, (nf) => {
      if (document.activeElement !== input) input.value = fmt(Number(nf.value))
    })
    return h('div', { class: 'field' }, h('span', { class: 'k' }, f.label ?? ''), h('label', { class: 'num' }, input))
  }

  private buildCheckbox(f: Field): HTMLElement {
    const tog = h('span', { class: 'tog' + (f.value ? ' on' : '') })
    tog.addEventListener('click', () => {
      const next = !tog.classList.contains('on')
      tog.classList.toggle('on', next)
      this.send({ type: 'field', id: f.id, value: next })
    })
    this.updaters.set(f.id, (nf) => tog.classList.toggle('on', Boolean(nf.value)))
    return h('div', { class: 'kv' }, h('span', { class: 'k' }, f.label ?? ''), tog)
  }

  private selectControl(f: Field): HTMLSelectElement {
    const sel = h('select', {
      onChange: () => this.send({ type: 'field', id: f.id, value: sel.value }),
    }) as HTMLSelectElement
    for (const opt of f.options ?? []) {
      const o = document.createElement('option')
      o.value = opt.value
      o.textContent = opt.label
      if (opt.value === f.value) o.selected = true
      sel.appendChild(o)
    }
    this.updaters.set(f.id, (nf) => {
      if (document.activeElement !== sel) sel.value = String(nf.value)
    })
    return sel
  }

  private buildSelect(f: Field): HTMLElement {
    return h('div', { class: 'field' }, h('span', { class: 'k' }, f.label ?? ''), h('label', { class: 'num cge-insp-select' }, this.selectControl(f)))
  }

  private buildColor(f: Field): HTMLElement {
    const input = h('input', {
      type: 'color',
      value: String(f.value),
      class: 'cge-insp-color',
      onInput: () => this.send({ type: 'field', id: f.id, value: input.value }),
    }) as HTMLInputElement
    this.updaters.set(f.id, (nf) => {
      if (document.activeElement !== input) input.value = String(nf.value)
    })
    return h('div', { class: 'kv' }, h('span', { class: 'k' }, f.label ?? ''), input)
  }

  private buildButton(f: Field, compact = false): HTMLElement {
    const add = (f.label ?? '').startsWith('+')
    const cls = compact
      ? 'btn ghost sm cge-insp-action'
      : 'btn ghost sm cge-insp-btn' + (add ? ' is-add' : '')
    return h('button', {
      class: cls + (f.variant === 'danger' ? ' stop' : ''),
      onClick: () => this.send({ type: 'button', id: f.id }),
    }, f.label ?? '')
  }

  /**
   * Campo de importação de arquivo: abre o file picker AQUI (o clique do usuário
   * acontece neste frame — abrir no iframe do engine via postMessage seria
   * bloqueado por falta de user activation) e manda o conteúdo lido pra ponte
   * como JSON `{ name, dataUrl }`.
   */
  private buildFile(f: Field): HTMLElement {
    const input = h('input', { type: 'file', style: { display: 'none' } }) as HTMLInputElement
    if (f.accept) input.accept = f.accept
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        this.send({ type: 'field', id: f.id, value: JSON.stringify({ name: file.name, dataUrl: String(reader.result) }) })
        input.value = ''
      }
      reader.readAsDataURL(file)
    })
    const btn = h('button', {
      class: 'btn ghost sm cge-insp-btn',
      onClick: () => input.click(),
    }, f.label ?? '')
    return h('div', {}, btn, input)
  }

  private buildNote(f: Field): HTMLElement {
    return h('div', {
      style: { fontSize: '11px', margin: '2px 0', color: f.tone === 'info' ? 'var(--tx)' : 'var(--tx-lo)' },
    }, f.text ?? '')
  }
}

function fmt(v: number): string {
  return (Math.round(v * 1000) / 1000).toString()
}
