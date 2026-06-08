import { t } from './i18n'

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
}
interface SelectOption {
  value: string
  label: string
}
interface Field {
  kind: 'vec3' | 'number' | 'checkbox' | 'select' | 'color' | 'button' | 'note'
  id: string
  label?: string
  value?: number | boolean | string | [number, number, number]
  options?: SelectOption[]
  step?: number
  variant?: 'normal' | 'primary' | 'danger'
  text?: string
  tone?: 'muted' | 'info'
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
interface StateMessage {
  source: 'cortex-editor'
  type: 'state'
  editorActive: boolean
  outliner: { items: OutlinerItem[] }
  inspector: InspectorModel
}

const ENGINE = 'cortex-editor'
const IDE = 'cortex-ide'

export class EditorPanels {
  private container: HTMLElement
  private headerEl!: HTMLElement
  private modeBtn!: HTMLButtonElement
  private outlinerListEl!: HTMLElement
  private inspectorEl!: HTMLElement

  /** Janela do iframe que fez o handshake (destino dos comandos). */
  private target: Window | null = null
  private editorActive = true
  /** Avisa o layout pra alargar a coluna direita uma vez (espaço pros painéis). */
  private announcedVisible = false

  // Reconciliação do inspector: chave de estrutura + updaters por campo.
  private inspectorKey = ''
  private updaters = new Map<string, (f: Field) => void>()

  constructor(container: HTMLElement) {
    this.container = container
  }

  init(): void {
    this.buildShell()
    window.addEventListener('message', (ev) => this.onMessage(ev))
    // Se o projeto para/fecha, o iframe some — esconde os painéis.
    document.addEventListener('play-stopped', () => this.reset())
    document.addEventListener('project-close', () => this.reset())
    // Troca de idioma: reconstrói o shell (re-traduz títulos). O próximo `state`
    // do engine repinta o conteúdo.
    document.addEventListener('locale-change', () => {
      const wasVisible = this.container.style.display !== 'none'
      this.buildShell()
      this.setVisible(wasVisible)
    })
    this.setVisible(false)
  }

  private buildShell(): void {
    this.container.innerHTML = ''
    this.container.classList.add('cge-editor-panels')
    // Estrutura recriada — invalida a reconciliação do inspector.
    this.inspectorKey = ''
    this.updaters = new Map()

    // Cabeçalho com o estado do editor + alternância Editar/Play.
    const header = document.createElement('div')
    header.className = 'cge-ep-header'
    const modeBtn = document.createElement('button')
    modeBtn.className = 'cge-ep-mode'
    modeBtn.addEventListener('click', () => {
      this.send({ type: 'editor', active: !this.editorActive })
    })
    header.appendChild(modeBtn)
    this.headerEl = header
    this.modeBtn = modeBtn

    // Outliner (hierarquia).
    const outliner = document.createElement('div')
    outliner.className = 'cge-ep-section cge-ep-outliner'
    const oTitle = document.createElement('div')
    oTitle.className = 'cge-ep-title'
    oTitle.textContent = t('editor.hierarchy')
    const oList = document.createElement('div')
    oList.className = 'cge-ep-list'
    outliner.append(oTitle, oList)
    this.outlinerListEl = oList

    // Inspector (propriedades).
    const inspector = document.createElement('div')
    inspector.className = 'cge-ep-section cge-ep-inspector'
    const iTitle = document.createElement('div')
    iTitle.className = 'cge-ep-title'
    iTitle.textContent = t('editor.properties')
    const iBody = document.createElement('div')
    iBody.className = 'cge-ep-inspector-body'
    inspector.append(iTitle, iBody)
    this.inspectorEl = iBody

    this.container.append(header, outliner, inspector)
    this.updateModeBtn()
  }

  private setVisible(v: boolean): void {
    document.body.classList.toggle('cge-has-editor-panels', v)
    this.container.style.display = v ? 'flex' : 'none'
    if (v && !this.announcedVisible) {
      this.announcedVisible = true
      document.dispatchEvent(new CustomEvent('editor-panels-visible'))
    }
  }

  private reset(): void {
    this.target = null
    this.inspectorKey = ''
    this.updaters.clear()
    this.outlinerListEl.textContent = ''
    this.inspectorEl.textContent = ''
    this.setVisible(false)
  }

  private onMessage(ev: MessageEvent): void {
    const data = ev.data as { source?: string; type?: string } | null
    if (!data || data.source !== ENGINE) return
    if (data.type === 'hello') {
      // O engine pediu handshake: guarda a janela de origem e responde ack.
      this.target = ev.source as Window
      this.setVisible(true)
      this.send({ type: 'ack' })
      return
    }
    if (data.type === 'state') {
      if (!this.target) this.target = ev.source as Window
      this.setVisible(true)
      this.renderState(data as StateMessage)
    }
  }

  private send(msg: Record<string, unknown>): void {
    this.target?.postMessage({ source: IDE, ...msg }, '*')
  }

  private updateModeBtn(): void {
    // Espelha o botão do engine: em edição mostra "▶ Play"; em play, "⏹ Editar".
    this.modeBtn.textContent = this.editorActive ? t('editor.play') : t('editor.stop')
    this.modeBtn.classList.toggle('is-play', this.editorActive)
  }

  private renderState(state: StateMessage): void {
    this.editorActive = state.editorActive
    this.updateModeBtn()
    this.renderOutliner(state.outliner.items)
    this.renderInspector(state.inspector)
  }

  private renderOutliner(items: OutlinerItem[]): void {
    this.outlinerListEl.textContent = ''
    for (const item of items) {
      const el = document.createElement('div')
      el.className = 'cge-ep-item' + (item.selected ? ' is-selected' : '')
      el.textContent = item.label
      el.title = item.type
      el.addEventListener('click', () => {
        this.send({ type: 'select', id: item.id })
        this.send({ type: 'focus', id: item.id })
      })
      this.outlinerListEl.appendChild(el)
    }
  }

  private structureKey(model: InspectorModel): string {
    const parts: string[] = [model.empty ? 'E' : 'F']
    for (const s of model.sections) for (const f of s.fields) parts.push(`${f.id}|${f.kind}`)
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
      const empty = document.createElement('div')
      empty.className = 'cge-ep-empty'
      empty.textContent = t('editor.nothing_selected')
      this.inspectorEl.appendChild(empty)
      return
    }

    const title = document.createElement('div')
    title.className = 'cge-ep-obj-title'
    title.textContent = model.title
    this.inspectorEl.appendChild(title)

    for (const section of model.sections) {
      if (section.title) {
        const head = document.createElement('div')
        head.className = 'cge-ep-section-head'
        head.textContent = section.title
        this.inspectorEl.appendChild(head)
      }
      for (const f of section.fields) this.inspectorEl.appendChild(this.buildField(f))
    }
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
      case 'note':
      default:
        return this.buildNote(f)
    }
  }

  private buildVec3(f: Field): HTMLElement {
    const wrap = document.createElement('div')
    const head = document.createElement('div')
    head.className = 'cge-ep-section-head'
    head.textContent = f.label ?? ''
    wrap.appendChild(head)
    const vals = (f.value as [number, number, number]) ?? [0, 0, 0]
    const inputs: HTMLInputElement[] = []
    const axes = ['X', 'Y', 'Z']
    const emit = (): void =>
      this.send({
        type: 'field',
        id: f.id,
        value: [Number(inputs[0].value) || 0, Number(inputs[1].value) || 0, Number(inputs[2].value) || 0],
      })
    for (let i = 0; i < 3; i++) {
      const row = document.createElement('div')
      row.className = 'cge-ep-row'
      const lbl = document.createElement('span')
      lbl.className = 'cge-ep-field-label'
      lbl.textContent = axes[i]
      const input = document.createElement('input')
      input.type = 'number'
      input.step = String(f.step ?? 0.1)
      input.value = fmt(vals[i])
      input.className = 'cge-ep-input'
      input.addEventListener('input', emit)
      inputs.push(input)
      row.append(lbl, input)
      wrap.appendChild(row)
    }
    this.updaters.set(f.id, (nf) => {
      const v = nf.value as [number, number, number]
      for (let i = 0; i < 3; i++) {
        if (document.activeElement !== inputs[i]) inputs[i].value = fmt(v[i])
      }
    })
    return wrap
  }

  private buildNumber(f: Field): HTMLElement {
    const row = document.createElement('div')
    row.className = 'cge-ep-row'
    const lbl = document.createElement('span')
    lbl.className = 'cge-ep-field-label'
    lbl.textContent = f.label ?? ''
    const input = document.createElement('input')
    input.type = 'number'
    input.step = String(f.step ?? 0.1)
    input.value = fmt(Number(f.value))
    input.className = 'cge-ep-input'
    input.addEventListener('input', () => {
      const v = parseFloat(input.value)
      if (!Number.isNaN(v)) this.send({ type: 'field', id: f.id, value: v })
    })
    row.append(lbl, input)
    this.updaters.set(f.id, (nf) => {
      if (document.activeElement !== input) input.value = fmt(Number(nf.value))
    })
    return row
  }

  private buildCheckbox(f: Field): HTMLElement {
    const row = document.createElement('label')
    row.className = 'cge-ep-row cge-ep-check'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = Boolean(f.value)
    input.addEventListener('change', () => this.send({ type: 'field', id: f.id, value: input.checked }))
    const lbl = document.createElement('span')
    lbl.textContent = f.label ?? ''
    row.append(input, lbl)
    this.updaters.set(f.id, (nf) => {
      if (document.activeElement !== input) input.checked = Boolean(nf.value)
    })
    return row
  }

  private buildSelect(f: Field): HTMLElement {
    const row = document.createElement('div')
    row.className = 'cge-ep-row'
    const lbl = document.createElement('span')
    lbl.className = 'cge-ep-field-label'
    lbl.textContent = f.label ?? ''
    const sel = document.createElement('select')
    sel.className = 'cge-ep-input'
    for (const opt of f.options ?? []) {
      const o = document.createElement('option')
      o.value = opt.value
      o.textContent = opt.label
      if (opt.value === f.value) o.selected = true
      sel.appendChild(o)
    }
    sel.addEventListener('change', () => this.send({ type: 'field', id: f.id, value: sel.value }))
    row.append(lbl, sel)
    this.updaters.set(f.id, (nf) => {
      if (document.activeElement !== sel) sel.value = String(nf.value)
    })
    return row
  }

  private buildColor(f: Field): HTMLElement {
    const row = document.createElement('div')
    row.className = 'cge-ep-row'
    const lbl = document.createElement('span')
    lbl.className = 'cge-ep-field-label'
    lbl.textContent = f.label ?? ''
    const input = document.createElement('input')
    input.type = 'color'
    input.value = String(f.value)
    input.className = 'cge-ep-color'
    input.addEventListener('input', () => this.send({ type: 'field', id: f.id, value: input.value }))
    row.append(lbl, input)
    this.updaters.set(f.id, (nf) => {
      if (document.activeElement !== input) input.value = String(nf.value)
    })
    return row
  }

  private buildButton(f: Field): HTMLElement {
    const btn = document.createElement('button')
    btn.className = 'cge-ep-btn' + (f.variant === 'danger' ? ' is-danger' : '')
    btn.textContent = f.label ?? ''
    btn.addEventListener('click', () => this.send({ type: 'button', id: f.id }))
    return btn
  }

  private buildNote(f: Field): HTMLElement {
    const note = document.createElement('div')
    note.className = 'cge-ep-note' + (f.tone === 'info' ? ' is-info' : '')
    note.textContent = f.text ?? ''
    return note
  }
}

function fmt(v: number): string {
  return (Math.round(v * 1000) / 1000).toString()
}
