import { RigApplyTo } from './RigApplyTo'
import { h } from './ui'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import { splitPath } from './characterRigRegistry'
import { POSE_BONES, moveKind, quatAngleDeg } from './characterRigPose'
import { FOLLOW_BONES } from './characterRigFollow'
import type { RigPoseEditor } from './RigPoseEditor'

/**
 * Painel "Pose (deste clipe)" do ajuste de pose (SPEC-0349 adendos 8 e 9;
 * SPEC-0703): esqueleto, modos, seletor de arma, ossos posados, ligações, estado e
 * gravação. Lê e chama o `RigPoseEditor`; não guarda estado próprio.
 */

const SCOPE = 'characterRig'
/** Seleção da arma (não é nome de osso: tem `@`). */
export const WEAPON_SELECTION = '@weapon'
const BTN = 'export-modal__btn export-modal__btn--secondary'

/** Nome do osso para o usuário ("Mão direita"); sem tradução, o nome Mixamo. */
export function boneLabel(bone: string): string {
  const key = `characterRig.bone.${bone}`
  const label = t(key)
  return label === key ? bone : label
}

export class RigPosePanel {
  readonly el: HTMLElement
  readonly skeletonInput: HTMLInputElement
  private readonly moveBtn: HTMLButtonElement
  private readonly rotateBtn: HTMLButtonElement
  private readonly spaceBtn: HTMLButtonElement
  private readonly weaponSelect: HTMLSelectElement
  private readonly supportBtn: HTMLButtonElement
  private readonly gripResetBtn: HTMLButtonElement
  private readonly selectedEl: HTMLElement
  private readonly modeHintEl: HTMLElement
  private readonly bonesEl: HTMLElement
  private readonly resetClipBtn: HTMLButtonElement
  private readonly stateEl: HTMLElement
  private readonly saveBtn: HTMLButtonElement
  /** "Aplicar a" (SPEC-0708): o painel mostra quando a config tem personagens. */
  readonly applyTo = new RigApplyTo()
  private readonly allBtn: HTMLButtonElement
  private readonly followBtn: HTMLButtonElement
  private readonly followHintEl: HTMLElement
  private readonly followsEl: HTMLElement
  /** Lista mostrada no seletor (`null` = ainda não montado). */
  private weaponCodes: string | null = null

  constructor(private readonly ed: RigPoseEditor) {
    const btn = (label: string, onClick: () => void, extra = '', title = ''): HTMLButtonElement =>
      h('button', { class: `${BTN}${extra ? ` ${extra}` : ''}`, type: 'button', ...(title ? { title } : {}), onClick }, label) as HTMLButtonElement
    this.skeletonInput = h('input', { type: 'checkbox' }) as HTMLInputElement
    this.skeletonInput.addEventListener('change', () => ed.setSkeleton(this.skeletonInput.checked))
    this.moveBtn = btn(t('characterRig.pose.move'), () => ed.setMode(ed.mode === 'move' ? 'off' : 'move'), 'rig-pose__mode')
    this.rotateBtn = btn(t('characterRig.pose.rotate'), () => ed.setMode(ed.mode === 'rotate' ? 'off' : 'rotate'), 'rig-pose__mode')
    this.spaceBtn = btn('', () => ed.toggleSpace(), 'rig-pose__space')
    this.weaponSelect = h('select', { class: 'gs-input', title: t('characterRig.weapon.hint') }) as HTMLSelectElement
    this.weaponSelect.addEventListener('change', () => void this.changeWeapon())
    this.supportBtn = btn(t('characterRig.weapon.support'), () => ed.supportHand(), '', t('characterRig.weapon.support_hint'))
    this.gripResetBtn = btn(t('characterRig.weapon.grip_reset'), () => ed.resetGrip())
    this.selectedEl = h('div', { class: 'rig-pose__selected' })
    this.modeHintEl = h('div', { class: 'rig-pose__hint' })
    this.bonesEl = h('div', { class: 'rig-pose__bones' })
    this.resetClipBtn = btn(t('characterRig.pose.reset_clip'), () => ed.resetClip())
    this.stateEl = h('div', { class: 'rig-arm__state rig-pose__state' })
    this.saveBtn = btn(t('characterRig.pose.save'), () => void this.save())
    this.allBtn = btn(t('characterRig.pose.apply_all'), () => void this.applyToAll(), '', t('characterRig.pose.apply_all_hint'))
    this.followBtn = btn(t('characterRig.pose.follow'), () => ed.toggleFollowPick(), 'rig-pose__mode', t('characterRig.pose.follow_hint'))
    this.followHintEl = h('div', { class: 'rig-pose__hint' })
    this.followsEl = h('div', { class: 'rig-pose__bones' })

    this.el = h('aside', { class: 'rig-side rig-pose', title: t('characterRig.pose.hint') },
      h('div', { class: 'rig-side__title' }, t('characterRig.pose.title')),
      h('label', { class: 'rig-check rig-pose__row' }, this.skeletonInput, h('span', {}, t('characterRig.pose.skeleton'))),
      h('div', { class: 'rig-pose__row' }, this.moveBtn, this.rotateBtn),
      h('div', { class: 'rig-pose__row' }, this.spaceBtn),
      h('div', { class: 'rig-side__title' }, t('characterRig.weapon.title')),
      this.weaponSelect,
      h('div', { class: 'rig-pose__row' }, this.supportBtn, this.gripResetBtn),
      this.selectedEl,
      this.modeHintEl,
      this.bonesEl,
      h('div', { class: 'rig-pose__row' }, this.resetClipBtn),
      h('div', { class: 'rig-side__title' }, t('characterRig.pose.follows_title')),
      h('div', { class: 'rig-pose__row' }, this.followBtn),
      this.followHintEl,
      this.followsEl,
      this.stateEl,
      this.applyTo.el,
      h('div', { class: 'rig-pose__row' }, this.allBtn, this.saveBtn))
  }

  /** Troca de arma: com edição não salva da chave mostrada, confirma antes. */
  private async changeWeapon(): Promise<void> {
    const code = this.weaponSelect.value || null
    if (this.ed.isUnsaved() && !(await window.electronAPI.confirmDialog(t('characterRig.weapon.switch_confirm')))) {
      this.weaponSelect.value = this.ed.weapon.weapon ?? ''
      return
    }
    this.ed.chooseWeapon(code)
  }

  private renderWeapons(): void {
    const codes = this.ed.weapon.codes
    if (codes.join() !== this.weaponCodes) {
      this.weaponCodes = codes.join()
      this.weaponSelect.textContent = ''
      this.weaponSelect.append(h('option', { value: '' }, t('characterRig.weapon.none')), ...codes.map((c) => h('option', { value: c }, c)))
    }
    this.weaponSelect.value = this.ed.weapon.weapon ?? ''
    this.weaponSelect.disabled = !codes.length || !this.ed.hasModel
  }

  /** Teclas da aba (W, E, Esc, Ctrl+Z). `true` se usou a tecla. */
  handleKey(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return false
    const key = e.key.toLowerCase()
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') return this.ed.undoLast()
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    if (key === 'escape' && this.ed.pickingFollow) {
      this.ed.pickingFollow = false
      this.ed.followWarn = ''
      this.ed.refresh()
      return true
    }
    if (key === 'escape' && this.ed.selected) {
      this.ed.select(null)
      return true
    }
    if (!this.ed.editable) return false
    if (key === 'w') this.ed.setMode('move')
    else if (key === 'e') this.ed.setMode('rotate')
    else return false
    return true
  }

  render(): void {
    const ed = this.ed
    const key = ed.key
    const editable = ed.editable
    const armed = !!ed.weapon.weapon
    const sel = ed.selected
    const onWeapon = sel === WEAPON_SELECTION
    this.renderWeapons()
    this.moveBtn.classList.toggle('on', ed.mode === 'move')
    this.rotateBtn.classList.toggle('on', ed.mode === 'rotate')
    this.spaceBtn.textContent = t(ed.space === 'world' ? 'characterRig.pose.space_world' : 'characterRig.pose.space_local')
    this.moveBtn.disabled = this.rotateBtn.disabled = this.spaceBtn.disabled = !editable
    this.skeletonInput.disabled = !ed.hasModel
    this.supportBtn.disabled = this.gripResetBtn.disabled = !editable || !armed
    this.selectedEl.textContent = onWeapon
      ? t('characterRig.weapon.selected', { weapon: ed.weapon.weapon ?? '' })
      : sel ? t('characterRig.pose.selected', { bone: sel }) : t('characterRig.pose.none_selected')
    const hipsMove = ed.mode === 'move' && !!sel && !onWeapon && moveKind(sel).kind === 'none'
    const locked = ed.isFollower(sel)
    this.modeHintEl.textContent = locked && ed.mode !== 'off'
      ? t('characterRig.pose.follow_locked', { bone: boneLabel(sel!) })
      : hipsMove ? t('characterRig.pose.hips_fixed')
        : onWeapon && ed.mode !== 'off' ? t('characterRig.weapon.grip_hint')
          : ed.mode === 'move' ? t('characterRig.pose.move_hint') : ed.mode === 'rotate' ? t('characterRig.pose.rotate_hint') : ''
    this.modeHintEl.classList.toggle('warn', hipsMove || (locked && ed.mode !== 'off'))
    this.followBtn.disabled = !editable || !sel || !FOLLOW_BONES.includes(sel)
    this.followBtn.classList.toggle('on', ed.pickingFollow)
    this.followHintEl.textContent = ed.followWarn || (ed.pickingFollow && sel ? t('characterRig.pose.follow_pick', { bone: boneLabel(sel) }) : '')
    this.followHintEl.classList.toggle('warn', !!ed.followWarn)

    const pose = key ? ed.store.wanted(key) : new Map()
    this.bonesEl.textContent = ''
    if (editable && !pose.size) this.bonesEl.append(h('div', { class: 'rig-pose__empty' }, t('characterRig.pose.bones_empty')))
    for (const bone of POSE_BONES) {
      const q = pose.get(bone)
      if (!q || !editable) continue
      this.bonesEl.append(h('div', { class: `rig-pose__bone${bone === sel ? ' on' : ''}` },
        h('button', { class: 'rig-pose__bone-name', type: 'button', onClick: () => ed.select(bone) }, bone),
        h('span', { class: 'rig-anim__tcode' }, `${quatAngleDeg(q).toFixed(1)}°`),
        h('button', { class: `${BTN} rig-arm__reset`, type: 'button', onClick: () => ed.resetBone(bone) }, t('characterRig.pose.reset_bone'))))
    }
    this.followsEl.textContent = ''
    const links = key && editable ? ed.store.wantedFollow(key) : []
    if (editable && !links.length) this.followsEl.append(h('div', { class: 'rig-pose__empty' }, t('characterRig.pose.follows_empty')))
    for (const c of links) {
      this.followsEl.append(h('div', { class: `rig-pose__bone${c.bone === sel ? ' on' : ''}` },
        h('button', { class: 'rig-pose__bone-name rig-pose__link', type: 'button', title: `${c.bone} → ${c.target}`, onClick: () => ed.select(c.bone) },
          t('characterRig.pose.follow_item', { bone: boneLabel(c.bone), target: boneLabel(c.target) })),
        h('button', { class: `${BTN} rig-arm__reset`, type: 'button', onClick: () => ed.removeFollow(c.bone) }, t('characterRig.pose.follow_remove'))))
    }
    this.resetClipBtn.disabled = !editable || !pose.size
    this.saveBtn.disabled = !ed.store.anyUnsaved()
    this.allBtn.disabled = !editable || ed.store.clipCount < 2
    this.renderState()
  }

  private renderState(): void {
    const ed = this.ed
    const name = ed.clip
    this.stateEl.classList.remove('warn')
    if (!name) {
      this.stateEl.textContent = t('characterRig.pose.no_clip')
      return
    }
    if (!ed.store.editable(name)) {
      this.stateEl.textContent = t('characterRig.pose.not_in_config', { name })
      this.stateEl.classList.add('warn')
      return
    }
    const parts = [t('characterRig.pose.generated', ed.generatedCounts())]
    const regen = ed.shownNeedsRegen()
    if (regen.pose) {
      parts.push(t(regen.follow ? 'characterRig.pose.follow_regen' : 'characterRig.pose.regen'))
      this.stateEl.classList.add('warn')
    }
    if (ed.isUnsaved()) parts.push(t('characterRig.pose.unsaved'))
    this.stateEl.textContent = parts.join(' ')
  }

  private fail(err: unknown): false {
    this.stateEl.textContent = t('characterRig.save_failed', { error: err instanceof Error ? err.message : String(err) })
    this.stateEl.classList.add('warn')
    return false
  }

  /** Grava o pendente de todas as chaves. `false` se não conseguiu gravar. */
  async save(): Promise<boolean> {
    const path = this.ed.store.path
    try {
      const key = this.ed.key
      if (key) this.applyTo.commit(this.ed.store, key)
      const count = await this.ed.store.save()
      if (!count) return true
      debug(SCOPE, 'pose gravada', path, { count })
      this.ed.changed()
      this.stateEl.textContent = `${this.stateEl.textContent} ${t('characterRig.pose.saved', { file: splitPath(path).name })}`
      return true
    } catch (err) {
      return this.fail(err)
    }
  }

  /** A pose da chave mostrada em todos os clipes (na variante da arma, se há arma). */
  private async applyToAll(): Promise<boolean> {
    const key = this.ed.key
    const path = this.ed.store.path
    if (!key) return false
    try {
      const count = await this.ed.store.applyToAll(key, (n, bones) => window.electronAPI.confirmDialog(t('characterRig.pose.apply_all_confirm', { name: key, count: n, bones })))
      if (count === null) return false
      debug(SCOPE, 'pose aplicada a todos os clipes', path, { from: key, count })
      this.ed.changed()
      this.stateEl.textContent = `${this.stateEl.textContent} ${t('characterRig.pose.applied_all', { count, file: splitPath(path).name })}`
      return true
    } catch (err) {
      return this.fail(err)
    }
  }
}
