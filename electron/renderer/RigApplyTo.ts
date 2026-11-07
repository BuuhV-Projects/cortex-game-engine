import { h } from './ui'
import { t } from './i18n'
import { applyChoices, applyTargets, fullKey, isNpcTarget, splitKey, type ApplyTo, type CharactersConfig } from './characterRigCharacters'
import type { PoseStore } from './rigPoseStore'

/**
 * "Aplicar a" do ajuste de pose (SPEC-0708, ADR-0707): as opções dependem de quem se edita (no player: player e todos
 * os NPCs, só o player, selecionados; num NPC: só este, NPCs selecionados, todos os NPCs). Na hora de gravar, a edição
 * da chave atual vai para as chaves dos alvos; se a própria chave não é alvo, a edição dela não é gravada.
 */
export class RigApplyTo {
  readonly el: HTMLElement
  private readonly choice: HTMLSelectElement
  private readonly list: HTMLElement
  private readonly checks = new Map<string, HTMLInputElement>()
  private chars: CharactersConfig | null = null
  private player = ''
  private editing = ''

  constructor() {
    this.choice = h('select', { class: 'gs-input', title: t('characterRig.apply.hint') }) as HTMLSelectElement
    this.choice.addEventListener('change', () => this.renderList())
    this.list = h('div', { class: 'rig-apply__list' })
    this.el = h('div', { class: 'rig-apply' }, h('label', {}, t('characterRig.apply.label')), this.choice, this.list)
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
    this.checks.clear()
    this.list.textContent = ''
    for (const code of npc ? chars.codes : [player, ...chars.codes]) {
      const box = h('input', { type: 'checkbox' }) as HTMLInputElement
      box.checked = code === this.editing
      this.checks.set(code, box)
      this.list.append(h('label', { class: 'rig-apply__item' }, box, code))
    }
    this.renderList()
  }

  private get editingNpc(): boolean {
    return isNpcTarget(this.chars, this.editing) && this.editing !== this.player
  }

  private renderList(): void {
    this.list.hidden = this.choice.value !== 'selected'
  }

  /** Antes de gravar: leva a edição da chave `key` (a mostrada) para as chaves dos alvos escolhidos. */
  commit(store: PoseStore, key: string): void {
    if (!this.chars) return
    const { clip, weapon } = splitKey(key)
    const selected = [...this.checks].filter(([, b]) => b.checked).map(([c]) => c)
    const targets = applyTargets(this.editing, this.choice.value as ApplyTo, selected, this.chars, this.player)
    // o alvo "todos" do player é a chave sem personagem; o do próprio player e o dos NPCs, com
    const keys = targets.map((tg) => fullKey(clip, weapon, tg))
    store.applyEditTo(key, keys, this.editingNpc ? 'own' : 'player')
    if (!keys.includes(key)) store.discardEdit(key)
  }
}
