import { t } from './i18n'
import { h, icon } from './ui'

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
  paused?: boolean
  outliner: { items: OutlinerItem[] }
  inspector: InspectorModel
}

const ENGINE = 'cortex-editor'
const IDE = 'cortex-ide'

export class EditorPanels {
  private container: HTMLElement
  private outlinerListEl!: HTMLElement
  private inspectorEl!: HTMLElement

  /** Janela do iframe que fez o handshake (destino dos comandos). */
  private target: Window | null = null
  private editorActive = true
  private paused = false
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
    // Transport da toolbar (Shell) controla a gameplay via a ponte (Unity-style):
    // Play/Stop alterna edição↔play; Pause congela a gameplay durante o play.
    document.addEventListener('request-editor-play', () => {
      this.send({ type: 'editor', active: !this.editorActive })
    })
    document.addEventListener('request-editor-pause', () => {
      this.send({ type: 'pause' })
    })
    this.setVisible(false)
  }

  private buildShell(): void {
    this.container.innerHTML = ''
    this.container.classList.add('cge-editor-panels')
    // Estrutura recriada — invalida a reconciliação do inspector.
    this.inspectorKey = ''
    this.updaters = new Map()

    // Hierarquia (outliner) — painel com header + lista de nós.
    const oList = h('div', { class: 'tree scroll' })
    const outliner = h('div', { class: 'panel cge-ep-outliner' },
      h('div', { class: 'panel-h' }, h('span', { class: 'ttl lit' }, t('editor.hierarchy'))),
      oList,
    )
    this.outlinerListEl = oList

    // Inspector (propriedades) — painel com header + corpo.
    const iBody = h('div', { class: 'insp scroll' })
    const inspector = h('div', { class: 'panel cge-ep-inspector' },
      h('div', { class: 'panel-h' }, h('span', { class: 'ttl lit' }, t('editor.properties'))),
      iBody,
    )
    this.inspectorEl = iBody

    this.container.append(outliner, inspector)
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

  private renderState(state: StateMessage): void {
    this.editorActive = state.editorActive
    this.paused = state.paused ?? false
    // Avisa a toolbar (Shell) do estado de play/pause pra refletir o transport.
    document.dispatchEvent(
      new CustomEvent('editor-active-change', { detail: { active: this.editorActive, paused: this.paused } }),
    )
    this.renderOutliner(state.outliner.items)
    this.renderInspector(state.inspector)
  }

  private renderOutliner(items: OutlinerItem[]): void {
    this.outlinerListEl.textContent = ''
    for (const item of items) {
      const m = typeMeta(item.type)
      const dim = item.label.startsWith('(') || item.label.startsWith('__')
      const el = h('div', { class: 'node' + (item.selected ? ' sel' : '') + (dim ? ' dim' : ''), title: item.type },
        icon('chevR', { size: 11, color: 'var(--tx-dim)' }),
        h('span', { class: 'ico', style: { color: item.selected ? 'var(--accent)' : m.color } }, icon(m.icon, { size: 13 })),
        h('span', { class: 'nm' }, item.label),
      )
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
      for (const f of section.fields) body.append(this.buildField(f))
      const sec = h('div', { class: 'sec' })
      if (section.title) {
        sec.append(h('div', { class: 'sec-h' }, icon('chevD', { size: 12 }), h('span', { class: 'lbl' }, section.title)))
      }
      sec.append(body)
      this.inspectorEl.append(sec)
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

  private buildSelect(f: Field): HTMLElement {
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
    return h('div', { class: 'field' }, h('span', { class: 'k' }, f.label ?? ''), h('label', { class: 'num cge-insp-select' }, sel))
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

  private buildButton(f: Field): HTMLElement {
    return h('button', {
      class: 'btn ghost sm cge-insp-btn' + (f.variant === 'danger' ? ' stop' : ''),
      onClick: () => this.send({ type: 'button', id: f.id }),
    }, f.label ?? '')
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
