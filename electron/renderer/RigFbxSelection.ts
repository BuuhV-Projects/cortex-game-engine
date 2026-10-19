import { h } from './ui'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import { resolveProjectPath, type RigEntry } from './characterRigRegistry'
import {
  applySelection,
  buildRows,
  fbxDirOf,
  fileKey,
  filterRows,
  parseConfigObject,
  removedGameClips,
  selectionCount,
  selectionFromConfig,
  serializeConfig,
  type FbxRow,
  type JsonObject,
  type SelectionState,
} from './characterRigSelection'

/**
 * Aba **Pasta** do painel auto-rig (SPEC-0349, adendo 1): escolhe quais FBX da
 * pasta de animações entram no rig, editando `skinned.clips` da config do
 * personagem. A lógica (nomes, estados, busca, gravação) é do módulo puro
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
    this.setStatus('')
    try {
      const cfg = parseConfigObject(await window.electronAPI.readFile(configPath))
      if (token !== this.loadToken) return
      this.config = cfg
      this.selection = selectionFromConfig(cfg)
      const rel = fbxDirOf(cfg) ?? rig?.animations ?? null
      if (!rel) {
        this.dirEl.textContent = t('characterRig.fbx.no_dir')
      } else {
        const dir = resolveProjectPath(projectDir, rel)
        this.dirEl.textContent = rel
        this.dirEl.title = dir
        try {
          const entries = await window.electronAPI.readDir(dir)
          if (token !== this.loadToken) return
          this.dirFiles = entries.filter((e) => !e.isDir).map((e) => e.name)
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

  private render(): void {
    this.rows = this.config ? buildRows(this.dirFiles, applySelection(this.config, this.selection), this.rig?.clips ?? []) : []
    const { selected, total } = selectionCount(this.rows)
    this.countEl.textContent = t('characterRig.fbx.count', { n: selected, m: total })
    this.saveBtn.disabled = !this.config
    this.listEl.textContent = ''
    const shown = filterRows(this.rows, this.searchInput.value)
    if (!shown.length) this.listEl.append(h('div', { class: 'rig-hint' }, t(this.rows.length ? 'characterRig.fbx.no_match' : 'characterRig.fbx.empty')))
    for (const r of shown) this.listEl.append(this.renderRow(r))
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
      h('span', { class: 'rig-fbx__file', title: r.file }, r.file),
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

  /** Marcar/desmarcar todos os filtrados (uma confirmação só para os do jogo). */
  private async setAll(on: boolean): Promise<void> {
    const shown = filterRows(this.rows, this.searchInput.value)
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
