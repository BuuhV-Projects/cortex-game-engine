import { h } from './ui'
import { t } from './i18n'
import { applyChoices, applyTargets, fullKey, isNpcTarget, splitKey, visibleApplyCodes, type ApplyTo, type CharactersConfig } from './characterRigCharacters'
import type { PoseStore } from './rigPoseStore'

const BTN = 'export-modal__btn export-modal__btn--secondary'

/**
 * "Aplicar a" do ajuste de pose (SPEC-0708, ADR-0707): as opções dependem de quem se edita (no player: player e todos
 * os NPCs, só o player, selecionados; num NPC: só este, NPCs selecionados, todos os NPCs). Na hora de gravar, a edição
 * da chave atual vai para as chaves dos alvos; se a própria chave não é alvo, a edição dela não é gravada.
 *
 * "Selecionados" é uma lista pesquisável (SPEC-0718): os marcados vivem em `checked`, à parte da lista filtrada.
 */
export class RigApplyTo {
  readonly el: HTMLElement
  private readonly choice: HTMLSelectElement
  private readonly picker: HTMLElement
  private readonly search: HTMLInputElement
  private readonly onlyChecked: HTMLInputElement
  private readonly countEl: HTMLElement
  private readonly list: HTMLElement
  private readonly checked = new Set<string>()
  private codes: string[] = []
  private chars: CharactersConfig | null = null
  private player = ''
  private editing = ''

  constructor() {
    this.choice = h('select', { class: 'gs-input', title: t('characterRig.apply.hint') }) as HTMLSelectElement
    this.choice.addEventListener('change', () => this.renderList())
    this.search = h('input', { type: 'search', class: 'gs-input', placeholder: t('characterRig.apply.search') }) as HTMLInputElement
    this.search.addEventListener('input', () => this.renderList())
    this.onlyChecked = h('input', { type: 'checkbox' }) as HTMLInputElement
    this.onlyChecked.addEventListener('change', () => this.renderList())
    this.countEl = h('span', { class: 'rig-apply__count' })
    this.list = h('div', { class: 'rig-apply__list' })
    const checkVisible = (): void => {
      for (const c of this.visible()) this.checked.add(c)
      this.renderList()
    }
    const clear = (): void => {
      this.checked.clear()
      this.renderList()
    }
    this.picker = h('div', { class: 'rig-apply__picker' },
      this.search,
      h('div', { class: 'rig-apply__bar' },
        this.countEl,
        h('label', { class: 'rig-check' }, this.onlyChecked, t('characterRig.apply.only_checked'))),
      h('div', { class: 'rig-apply__bar' },
        h('button', { class: BTN, type: 'button', onClick: checkVisible }, t('characterRig.apply.check_visible')),
        h('button', { class: BTN, type: 'button', onClick: clear }, t('characterRig.apply.clear'))),
      this.list)
    this.el = h('div', { class: 'rig-apply' }, h('label', {}, t('characterRig.apply.label')), this.choice, this.picker)
    this.el.hidden = true
  }

  /** Personagens da config, o código do player e quem se edita agora (`null` = o player). */
  setContext(chars: CharactersConfig | null, player: string, editing: string | null): void {
    this.chars = chars
    this.player = player
    this.editing = editing ?? player
    this.el.hidden = !chars
    if (!chars) return
    const npc = this.editingNpc
    const prev = this.choice.value as ApplyTo
    this.choice.textContent = ''
    for (const c of applyChoices(npc)) this.choice.append(h('option', { value: c }, t(`characterRig.apply.${npc ? 'npc' : 'player'}_${c}`)))
    if (applyChoices(npc).includes(prev)) this.choice.value = prev
    this.codes = npc ? chars.codes : [player, ...chars.codes]
    this.checked.clear()
    if (this.codes.includes(this.editing)) this.checked.add(this.editing)
    this.renderList()
  }

  private get editingNpc(): boolean {
    return isNpcTarget(this.chars, this.editing) && this.editing !== this.player
  }

  private visible(): string[] {
    return visibleApplyCodes(this.codes, this.search.value, this.checked, this.onlyChecked.checked)
  }

  private renderList(): void {
    this.picker.hidden = this.choice.value !== 'selected'
    this.countEl.textContent = t('characterRig.apply.count', { n: this.checked.size })
    const shown = this.visible()
    this.list.textContent = ''
    if (!shown.length) this.list.append(h('div', { class: 'rig-hint' }, t('characterRig.apply.empty')))
    for (const code of shown) {
      const box = h('input', { type: 'checkbox' }) as HTMLInputElement
      box.checked = this.checked.has(code)
      // sem redesenhar a lista: o item não pula para o topo enquanto se marca (a ordem se refaz ao filtrar)
      box.addEventListener('change', () => {
        if (box.checked) this.checked.add(code)
        else this.checked.delete(code)
        this.countEl.textContent = t('characterRig.apply.count', { n: this.checked.size })
      })
      this.list.append(h('label', { class: 'rig-apply__item' }, box, h('span', {}, code)))
    }
  }

  /** Antes de gravar: leva a edição da chave `key` (a mostrada) para as chaves dos alvos escolhidos. */
  commit(store: PoseStore, key: string): void {
    if (!this.chars) return
    const { clip, weapon } = splitKey(key)
    const selected = this.codes.filter((c) => this.checked.has(c))
    const targets = applyTargets(this.editing, this.choice.value as ApplyTo, selected, this.chars, this.player)
    // o alvo "todos" do player é a chave sem personagem; o do próprio player e o dos NPCs, com
    const keys = targets.map((tg) => fullKey(clip, weapon, tg))
    store.applyEditTo(key, keys, this.editingNpc ? 'own' : 'player', this.player)
    // a pegada do player é a de `ARMA`, a da chave mostrada no player: com ele entre os alvos, ela fica (SPEC-0719)
    if (!keys.includes(key)) store.discardEdit(key, !this.editingNpc && targets.includes(this.player))
  }
}
