import { h } from './ui'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import { resolveProjectPath, splitPath, type RigEntry } from './characterRigRegistry'
import {
  applySelection,
  buildRows,
  fbxDirOf,
  fileKey,
  filterRows,
  groupRows,
  listFbxRecursive,
  parseConfigObject,
  rebaseRigFile,
  removedGameClips,
  selectionCount,
  selectionFromConfig,
  serializeConfig,
  type FbxGroup,
  type FbxRow,
  type JsonObject,
  type SelectionState,
  fileBaseName,
} from './characterRigSelection'

/**
 * Aba **Pasta** do painel auto-rig (SPEC-0349, adendos 1 e 6): escolhe quais FBX
 * dos pacotes de animação (subpastas de `skinned.fbx`) entram no rig, editando
 * `skinned.clips` da config do personagem. A lógica (nomes, estados, busca, gravação) é do módulo puro
 * `characterRigSelection.ts`; aqui só a lista e o IPC de arquivos.
 */

const SCOPE = 'characterRig'

export interface FbxSelectionHooks {
  /** A seleção mudou (marcar/desmarcar/laço) ou foi recarregada. */
  onChange: () => void
  /** Pediu para tocar um clipe que já está no rig. */
  onPlay: (clipName: string) => void
}

export class RigFbxSelection {
  readonly el: HTMLElement
  private readonly searchInput: HTMLInputElement
  private readonly countEl: HTMLElement
  private readonly dirEl: HTMLElement
  private readonly listEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly saveBtn: HTMLButtonElement
  /** Rodapé (status + Salvar seleção); o painel acrescenta o Gerar rig. */
  readonly footer: HTMLElement

  private configPath = ''
  private projectDir = ''
  /** Config como estava no disco na última carga/gravação. */
  private config: JsonObject | null = null
  private selection: SelectionState = new Map()
  private dirFiles: string[] = []
  /** `skinned.fbx` (ou `animations` do registro): raiz dos pacotes, como está na config. */
  private root: string | null = null
  private rig: RigEntry | null = null
  private rows: FbxRow[] = []
  private loadToken = 0

  constructor(private readonly hooks: FbxSelectionHooks) {
    this.searchInput = h('input', { type: 'search', class: 'gs-input rig-fbx__search', placeholder: t('characterRig.fbx.search') }) as HTMLInputElement
    this.searchInput.addEventListener('input', () => this.render())
    this.countEl = h('span', { class: 'rig-fbx__count' })
    this.dirEl = h('div', { class: 'rig-fbx__dir' })
    this.listEl = h('div', { class: 'rig-fbx__list' })
    this.statusEl = h('div', { class: 'rig-status' })
    this.saveBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void this.save() }, t('characterRig.fbx.save')) as HTMLButtonElement

    this.footer = h('div', { class: 'rig-fbx__foot' }, this.statusEl, h('span', { class: 'spacer', style: { flex: '1' } }), this.saveBtn)
    this.el = h('div', { class: 'rig-fbx' },
      h('div', { class: 'rig-fbx__bar' },
        this.searchInput,
        h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void this.setAll(true) }, t('characterRig.fbx.select_all')),
        h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void this.setAll(false) }, t('characterRig.fbx.select_none')),
        this.countEl),
      this.dirEl,
      this.listEl,
      this.footer,
    )
  }

  /** Selecionadas que ainda não estão no rig (para a lista da prévia). */
  pending(): Array<{ name: string; file: string }> {
    return this.rows.filter((r) => r.state === 'pending').map((r) => ({ name: r.name, file: r.file }))
  }

  /** Lê a config e lista a pasta dos FBX. */
  async load(projectDir: string, configPath: string, rig: RigEntry | null): Promise<void> {
    const token = ++this.loadToken
    this.projectDir = projectDir
    this.configPath = configPath
    this.rig = rig
    this.config = null
    this.selection = new Map()
    this.dirFiles = []
    this.root = null
    this.setStatus('')
    try {
      const cfg = parseConfigObject(await window.electronAPI.readFile(configPath))
      if (token !== this.loadToken) return
      this.config = cfg
      this.selection = selectionFromConfig(cfg)
      const rel = fbxDirOf(cfg) ?? rig?.animations ?? null
      this.root = rel
      if (!rel) {
        this.dirEl.textContent = t('characterRig.fbx.no_dir')
      } else {
        const dir = resolveProjectPath(projectDir, rel)
        this.dirEl.textContent = rel
        this.dirEl.title = dir
        try {
          const files = await listFbxRecursive((d) => window.electronAPI.readDir(d), dir)
          if (token !== this.loadToken) return
          this.dirFiles = files
        } catch (err) {
          this.setStatus(t('characterRig.fbx.dir_failed', { dir: rel, error: err instanceof Error ? err.message : String(err) }), true)
        }
      }
    } catch (err) {
      if (token !== this.loadToken) return
      this.setStatus(t('characterRig.fbx.config_failed', { error: err instanceof Error ? err.message : String(err) }), true)
    }
    this.render()
    this.hooks.onChange()
  }

  /** O registro mudou (depois de Gerar rig): atualiza os estados. */
  setRig(rig: RigEntry | null): void {
    this.rig = rig
    this.render()
    this.hooks.onChange()
  }

  /** Clipes do registro com `file` relativo à raiz da config (registro antigo: o pacote). */
  private rigFiles(): Array<{ file: string }> {
    const rig = this.rig
    if (!rig) return []
    const root = this.root ?? rig.animations
    return rig.clips.map((c) => ({ file: rebaseRigFile(this.projectDir, rig.animations, c.file, root) }))
  }

  private render(): void {
    this.rows = this.config ? buildRows(this.dirFiles, applySelection(this.config, this.selection), this.rigFiles()) : []
    const { selected, total } = selectionCount(this.rows)
    this.countEl.textContent = t('characterRig.fbx.count', { n: selected, m: total })
    this.saveBtn.disabled = !this.config
    this.listEl.textContent = ''
    const groups = groupRows(this.rows, this.searchInput.value)
    if (!groups.length) this.listEl.append(h('div', { class: 'rig-hint' }, t(this.rows.length ? 'characterRig.fbx.no_match' : 'characterRig.fbx.empty')))
    for (const g of groups) {
      this.listEl.append(this.renderGroupHeader(g))
      for (const r of g.rows) this.listEl.append(this.renderRow(r))
    }
  }

  /** Cabeçalho do pacote: nome (a raiz leva o nome da pasta), "N de M" e marcar/desmarcar os filtrados dele. */
  private renderGroupHeader(g: FbxGroup): HTMLElement {
    const label = g.pkg || splitPath((this.root ?? '').replace(/[\/]+$/, '')).name || '.'
    return h('div', { class: 'rig-fbx__group' },
      h('span', { class: 'rig-fbx__group-name', title: g.pkg || this.root || '' }, label),
      h('span', { class: 'rig-fbx__group-count' }, t('characterRig.fbx.count', { n: g.selected, m: g.total })),
      h('span', { style: { flex: '1' } }),
      h('button', { class: 'rig-fbx__group-btn', type: 'button', onClick: () => void this.setRows(g.rows, true) }, t('characterRig.fbx.pkg_select_all')),
      h('button', { class: 'rig-fbx__group-btn', type: 'button', onClick: () => void this.setRows(g.rows, false) }, t('characterRig.fbx.pkg_select_none')),
    )
  }

  private renderRow(r: FbxRow): HTMLElement {
    const check = h('input', { type: 'checkbox', title: t('characterRig.fbx.include') }) as HTMLInputElement
    check.checked = r.selected
    check.addEventListener('change', () => void this.toggle(r, check))
    const loop = h('input', { type: 'checkbox' }) as HTMLInputElement
    loop.disabled = !r.selected
    loop.checked = r.loop
    loop.addEventListener('change', () => {
      this.selection.set(fileKey(r.file), { file: this.selection.get(fileKey(r.file))?.file ?? r.file, loop: loop.checked })
      this.changed()
    })
    const stateKey = r.missing ? 'missing' : r.state === 'unselected' && r.inRig ? 'leaving' : r.state
    const name = h('span', {
      class: `rig-fbx__name${r.state === 'generated' ? ' playable' : ''}`,
      title: r.state === 'generated' ? t('characterRig.fbx.play_hint') : '',
      onClick: () => {
        if (r.state === 'generated') this.hooks.onPlay(r.name)
      },
    }, r.name)
    return h('div', { class: `rig-fbx__row ${r.state}${r.missing ? ' missing' : ''}` },
      check,
      h('span', { class: 'rig-fbx__file', title: r.file }, fileBaseName(r.file)),
      name,
      r.flags.length ? h('span', { class: 'rig-fbx__flags', title: t('characterRig.fbx.flags_hint') }, r.flags.join(', ')) : h('span', {}),
      h('label', { class: 'rig-check rig-fbx__loop' }, loop, h('span', {}, t('characterRig.fbx.loop'))),
      h('span', { class: `rig-fbx__state ${stateKey}` }, t(`characterRig.fbx.state_${stateKey}`)),
    )
  }

  private async toggle(r: FbxRow, check: HTMLInputElement): Promise<void> {
    const key = fileKey(r.file)
    if (check.checked) {
      this.selection.set(key, { file: r.file, loop: false })
    } else {
      if (r.flags.length && !(await this.confirmRemove([r.name]))) {
        check.checked = true
        return
      }
      this.selection.delete(key)
    }
    this.changed()
  }

  /** Marcar/desmarcar todos os filtrados, de todos os pacotes. */
  private setAll(on: boolean): Promise<void> {
    return this.setRows(filterRows(this.rows, this.searchInput.value), on)
  }

  /** Marcar/desmarcar as linhas dadas (uma confirmação só para os clipes do jogo). */
  private async setRows(shown: readonly FbxRow[], on: boolean): Promise<void> {
    if (on) {
      for (const r of shown) if (!r.selected && !r.missing) this.selection.set(fileKey(r.file), { file: r.file, loop: false })
    } else {
      const game = shown.filter((r) => r.selected && r.flags.length).map((r) => r.name)
      if (game.length && !(await this.confirmRemove(game))) return
      for (const r of shown) this.selection.delete(fileKey(r.file))
    }
    this.changed()
  }

  private confirmRemove(names: string[]): Promise<boolean> {
    return window.electronAPI.confirmDialog(t('characterRig.fbx.confirm_remove', { names: names.join(', ') }))
  }

  private changed(): void {
    this.setStatus(t('characterRig.fbx.unsaved'), true)
    this.render()
    this.hooks.onChange()
  }

  /**
   * Relê a config do disco, aplica a seleção e grava (só se o texto mudou).
   * `false` se não conseguiu gravar.
   */
  async save(): Promise<boolean> {
    if (!this.config) return true
    try {
      const before = await window.electronAPI.readFile(this.configPath)
      const fresh = parseConfigObject(before)
      const lost = removedGameClips(fresh, this.selection).filter((c) => !removedGameClips(this.config!, this.selection).some((o) => o.name === c.name))
      if (lost.length && !(await this.confirmRemove(lost.map((c) => c.name)))) return false
      const next = applySelection(fresh, this.selection)
      const text = serializeConfig(next)
      if (text !== before.replace(/^﻿/, '')) {
        await window.electronAPI.writeFile(this.configPath, text)
        debug(SCOPE, 'seleção gravada', this.configPath, [...this.selection.values()].map((s) => s.file))
      }
      this.config = next
      this.selection = selectionFromConfig(next)
      this.setStatus(t('characterRig.fbx.saved', { file: this.configPath.split(/[\\/]/).pop() ?? this.configPath }))
      this.render()
      this.hooks.onChange()
      return true
    } catch (err) {
      this.setStatus(t('characterRig.save_failed', { error: err instanceof Error ? err.message : String(err) }), true)
      return false
    }
  }

  private setStatus(text: string, warn = false): void {
    this.statusEl.textContent = text
    this.statusEl.classList.toggle('warn', warn)
  }
}
