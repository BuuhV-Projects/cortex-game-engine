import * as THREE from 'three'
import { h } from './ui'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import { splitPath } from './characterRigRegistry'
import { parseConfigObject, serializeConfig, type JsonObject } from './characterRigSelection'
import {
  ARM_OFFSET_KEYS,
  ARM_OFFSET_LIMITS,
  ARM_SIDES,
  CHEST_BONE,
  ZERO_OFFSETS,
  applyArmOffsets,
  applyArmOffsetsToAll,
  armOffsetsFromConfig,
  armOffsetsFromSkin,
  chestAxis,
  chestUp,
  clampOffset,
  configClipNames,
  localAfterWorldRotation,
  offsetDelta,
  sameOffsets,
  sideRotations,
  twistRotation,
  undoInReverse,
  type ArmOffsetKey,
  type ArmOffsets,
  type Quat,
  type Vec3,
} from './characterRigArmSpace'
import { stripBom } from './rigPoseStore'

/**
 * Ajuste dos braços por clipe na aba Animações (SPEC-0349 adendos 4, 5 e 7):
 * `shoulderLift`/`armSpace`/`elbowSpace`/`shoulderBack`/`armTwist`/`foreArmTwist` da
 * config, o "Character Arm-Space" do Mixamo. A prévia aplica por cima do GLB só a
 * diferença entre o slider e o `armOffsets` gravado no JSON do skin do build.
 */

const SCOPE = 'characterRig'

const ARM_LABEL: Record<ArmOffsetKey, string> = {
  shoulderLift: 'characterRig.arm.shoulder',
  armSpace: 'characterRig.arm.space',
  elbowSpace: 'characterRig.arm.elbow',
  shoulderBack: 'characterRig.arm.back',
  armTwist: 'characterRig.arm.arm_twist',
  foreArmTwist: 'characterRig.arm.forearm_twist',
}

function toQuat(q: THREE.Quaternion): Quat {
  return [q.x, q.y, q.z, q.w]
}

function formatDeg(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}°`
}

/** Parâmetros `{lift, space, elbow, back, armTwist, foreTwist}` das mensagens de estado. */
function degParams(o: ArmOffsets): Record<string, string> {
  return { lift: formatDeg(o.shoulderLift), space: formatDeg(o.armSpace), elbow: formatDeg(o.elbowSpace), back: formatDeg(o.shoulderBack), armTwist: formatDeg(o.armTwist), foreTwist: formatDeg(o.foreArmTwist) }
}

interface ArmControl {
  range: HTMLInputElement
  num: HTMLInputElement
  reset: HTMLButtonElement
}

interface ArmBones {
  model: THREE.Object3D
  chest: THREE.Object3D
  /** Rotação do peito no repouso, no espaço do modelo. */
  chestRest: Quat
  sides: Array<{ sign: number; shoulder: THREE.Object3D; arm: THREE.Object3D; foreArm: THREE.Object3D; hand: THREE.Object3D }>
}

export class RigArmAdjust {
  readonly el: HTMLElement
  private readonly controls = new Map<ArmOffsetKey, ArmControl>()
  private readonly stateEl: HTMLElement
  private readonly saveBtn: HTMLButtonElement
  private readonly allBtn: HTMLButtonElement
  private configPath = ''
  /** Na config do disco, por clipe de `skinned.clips` (só os que existem na config). */
  private saved = new Map<string, ArmOffsets>()
  /** Editados no painel (pendentes de gravar). */
  private edited = new Map<string, ArmOffsets>()
  /** Gravados no build mostrado (`clips[nome].armOffsets` do JSON do skin). */
  private generated = new Map<string, ArmOffsets>()
  private bones: ArmBones | null = null
  /** Há um build carregado (o gerado é o dele). */
  private loaded = false
  /**
   * Pose do mixer nos ossos girados, antes do ajuste (e da pose do adendo 8). O
   * `PropertyMixer` do three só reescreve o osso quando o valor do clipe muda: sem
   * restaurar antes de cada `mixer.update`, o ajuste somaria a cada quadro.
   */
  readonly undoStack: Array<[THREE.Object3D, THREE.Quaternion]> = []
  private readonly tmpQ = new THREE.Quaternion()
  private readonly tmpQ2 = new THREE.Quaternion()
  private readonly tmpV = new THREE.Vector3()
  private readonly tmpV2 = new THREE.Vector3()

  /** `clip()` = clipe mostrado; `onChange` = selos da lista. */
  constructor(private readonly clip: () => string | null, private readonly onChange: () => void) {
    for (const key of ARM_OFFSET_KEYS) {
      const { min, max, step } = ARM_OFFSET_LIMITS[key]
      const range = h('input', { type: 'range', class: 'rig-arm__range' }) as HTMLInputElement
      const num = h('input', { type: 'number', class: 'gs-input rig-arm__num' }) as HTMLInputElement
      for (const el of [range, num]) Object.assign(el, { min: String(min), max: String(max), step: String(step), value: '0' })
      range.addEventListener('input', () => this.setOffset(key, Number(range.value)))
      num.addEventListener('change', () => this.setOffset(key, Number(num.value)))
      const reset = h('button', { class: 'export-modal__btn export-modal__btn--secondary rig-arm__reset', type: 'button', onClick: () => this.setOffset(key, 0) }, t('characterRig.arm.reset')) as HTMLButtonElement
      this.controls.set(key, { range, num, reset })
    }
    this.stateEl = h('div', { class: 'rig-arm__state' })
    this.saveBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void this.save() }, t('characterRig.arm.save')) as HTMLButtonElement
    this.allBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', title: t('characterRig.arm.apply_all_hint'), onClick: () => void this.applyToAll() }, t('characterRig.arm.apply_all')) as HTMLButtonElement
    const rows = ARM_OFFSET_KEYS.map((key) => {
      const c = this.controls.get(key)!
      const { min, max } = ARM_OFFSET_LIMITS[key]
      return h('label', { class: 'rig-arm__row', title: t('characterRig.arm.range', { min, max }) },
        h('span', { class: 'rig-anim__lbl rig-arm__lbl' }, t(ARM_LABEL[key])), c.range, c.num, h('span', { class: 'rig-anim__lbl' }, '°'), c.reset)
    })
    this.el = h('div', { class: 'rig-arm', title: t('characterRig.arm.hint') },
      h('div', { class: 'rig-side__title' }, t('characterRig.arm.title')),
      h('div', { class: 'rig-arm__rows' }, ...rows),
      h('div', { class: 'rig-arm__foot' }, this.stateEl, this.allBtn, this.saveBtn))
  }

  /** Novo GLB (ossos do ajuste) e o JSON do skin dele; `null` limpa. */
  setModel(model: THREE.Object3D | null, skin: unknown): void {
    this.undoStack.length = 0
    this.loaded = !!model
    this.bones = model ? this.findBones(model) : null
    this.generated = model ? armOffsetsFromSkin(skin) : new Map()
    this.render()
  }

  /** Ajustes da config no disco. Mesma config: ajuste ainda não salvo continua; outra: começa do disco. */
  setConfig(path: string, cfg: JsonObject | null): void {
    const saved = cfg ? armOffsetsFromConfig(cfg) : new Map<string, ArmOffsets>()
    if (path !== this.configPath) this.edited = new Map()
    else for (const name of [...this.edited.keys()]) if (!this.isUnsaved(name)) this.edited.delete(name)
    this.configPath = path
    this.saved = saved
    this.render()
  }

  private wanted(name: string): ArmOffsets {
    return this.edited.get(name) ?? this.saved.get(name) ?? ZERO_OFFSETS
  }

  private generatedOf(name: string): ArmOffsets {
    return this.generated.get(name) ?? ZERO_OFFSETS
  }

  /** O ajuste desejado difere do que está no GLB mostrado. */
  needsRegen(name: string): boolean {
    return this.loaded && this.saved.has(name) && !sameOffsets(this.wanted(name), this.generatedOf(name))
  }

  private isUnsaved(name: string): boolean {
    const v = this.edited.get(name)
    return !!v && !sameOffsets(v, this.saved.get(name) ?? ZERO_OFFSETS)
  }

  private setOffset(key: ArmOffsetKey, value: number): void {
    const name = this.clip()
    if (!name || !this.saved.has(name)) return
    this.edited.set(name, { ...this.wanted(name), [key]: clampOffset(key, value) })
    this.render()
    this.onChange()
  }

  render(): void {
    const name = this.clip()
    const editable = !!name && this.saved.has(name)
    const v = name ? this.wanted(name) : ZERO_OFFSETS
    for (const [key, c] of this.controls) {
      c.range.value = String(v[key])
      c.num.value = String(v[key])
      c.range.disabled = c.num.disabled = !editable
      c.reset.disabled = !editable || v[key] === 0
    }
    this.saveBtn.disabled = ![...this.edited.keys()].some((n) => this.isUnsaved(n))
    this.allBtn.disabled = !editable || this.saved.size < 2
    this.stateEl.classList.remove('warn')
    if (!name) {
      this.stateEl.textContent = t('characterRig.arm.no_clip')
      return
    }
    if (!editable) {
      this.stateEl.textContent = t('characterRig.arm.not_in_config', { name })
      this.stateEl.classList.add('warn')
      return
    }
    const gen = this.generatedOf(name)
    const parts = [t('characterRig.arm.generated', degParams(gen))]
    if (this.needsRegen(name)) {
      parts.push(t('characterRig.arm.regen', degParams(offsetDelta(v, gen))))
      this.stateEl.classList.add('warn')
    }
    if (this.isUnsaved(name)) parts.push(t('characterRig.arm.unsaved'))
    this.stateEl.textContent = parts.join(' ')
  }

  /** Relê a config, aplica `edit` e grava só se o texto muda; mensagem `done` no estado. */
  private async write(edit: (cfg: JsonObject) => Promise<JsonObject | null>, done: (file: string) => string): Promise<boolean> {
    const path = this.configPath
    try {
      const before = stripBom(await window.electronAPI.readFile(path))
      const next = await edit(parseConfigObject(before))
      if (!next) return false
      const text = serializeConfig(next)
      if (text !== before) await window.electronAPI.writeFile(path, text)
      this.saved = armOffsetsFromConfig(next)
      this.edited = new Map()
      this.onChange()
      this.render()
      this.stateEl.textContent = `${this.stateEl.textContent} ${done(splitPath(path).name)}`
      return true
    } catch (err) {
      this.stateEl.textContent = t('characterRig.save_failed', { error: err instanceof Error ? err.message : String(err) })
      this.stateEl.classList.add('warn')
      return false
    }
  }

  /** Grava os ajustes pendentes (campo 0 sai). `false` se não conseguiu gravar. */
  async save(): Promise<boolean> {
    const pending = new Map([...this.edited].filter(([n]) => this.isUnsaved(n)))
    if (!this.configPath || !pending.size) return true
    debug(SCOPE, 'ajuste dos braços gravado', this.configPath, Object.fromEntries(pending))
    return this.write(async (cfg) => applyArmOffsets(cfg, pending), (file) => t('characterRig.arm.saved', { file }))
  }

  /** Os valores do clipe atual em todos os clipes de `skinned.clips` (adendo 5; confirma e grava). */
  async applyToAll(): Promise<boolean> {
    const name = this.clip()
    if (!this.configPath || !name || !this.saved.has(name)) return false
    const offsets = this.wanted(name)
    let count = 0
    return this.write(async (cfg) => {
      count = configClipNames(cfg).length
      if (!(await window.electronAPI.confirmDialog(t('characterRig.arm.apply_all_confirm', { name, count, ...degParams(offsets) })))) return null
      debug(SCOPE, 'ajuste dos braços aplicado a todos os clipes', this.configPath, { from: name, count, offsets })
      return applyArmOffsetsToAll(cfg, offsets)
    }, (file) => t('characterRig.arm.applied_all', { count, file }))
  }

  /** Direção `from` → `to` no espaço do modelo (getWorldPosition recalcula a cadeia já girada). */
  private boneDir(from: THREE.Object3D, to: THREE.Object3D, model: THREE.Object3D): Vec3 {
    const a = model.worldToLocal(from.getWorldPosition(this.tmpV))
    const c = model.worldToLocal(to.getWorldPosition(this.tmpV2))
    return [c.x - a.x, c.y - a.y, c.z - a.z]
  }

  /** Rotação de mundo de `o` no espaço do modelo. */
  private modelQuat(o: THREE.Object3D, model: THREE.Object3D): Quat {
    model.getWorldQuaternion(this.tmpQ2).invert()
    return toQuat(this.tmpQ2.multiply(o.getWorldQuaternion(this.tmpQ)))
  }

  private findBones(model: THREE.Object3D): ArmBones | null {
    const chest = model.getObjectByName(CHEST_BONE)
    const sides = ARM_SIDES.map((s) => ({ sign: s.sign, shoulder: model.getObjectByName(s.shoulder), arm: model.getObjectByName(s.arm), foreArm: model.getObjectByName(s.foreArm), hand: model.getObjectByName(s.hand) }))
    if (!chest || sides.some((s) => !s.shoulder?.parent || !s.arm?.parent || !s.foreArm?.parent || !s.hand)) {
      debug(SCOPE, 'rig sem os ossos do ajuste dos braços', { chest: !!chest })
      return null
    }
    model.updateMatrixWorld(true)
    return {
      model,
      chest,
      chestRest: this.modelQuat(chest, model),
      sides: sides.map((s) => ({ sign: s.sign, shoulder: s.shoulder!, arm: s.arm!, foreArm: s.foreArm!, hand: s.hand! })),
    }
  }

  /** Devolve aos ossos a pose do mixer (desfaz o ajuste e a pose do quadro anterior). */
  restore(): void {
    undoInReverse(this.undoStack, (bone, q) => bone.quaternion.copy(q))
  }

  /** Depois do mixer: gira clavícula e braço pela diferença (mesma conta do `arm_offsets` do jogo). */
  apply(): void {
    const b = this.bones
    const name = this.clip()
    if (!b || !name) return
    const d = offsetDelta(this.wanted(name), this.generatedOf(name))
    if (ARM_OFFSET_KEYS.every((k) => !d[k])) return
    const chest = this.modelQuat(b.chest, b.model)
    const axis = chestAxis(chest, b.chestRest)
    const up = chestUp(chest, b.chestRest)
    for (const side of b.sides) {
      const r = sideRotations(axis, up, side.sign, d)
      // clavícula, braço, antebraço: cada um lê o pai já girado (getWorldQuaternion recalcula a cadeia)
      // a torção usa a direção do osso já girado (pivô dele → pivô do filho), como o `arm_offsets`
      const steps: Array<[THREE.Object3D, () => Quat | null]> = [
        [side.shoulder, () => r.shoulder],
        [side.arm, () => r.arm],
        [side.arm, () => (d.armTwist ? twistRotation(this.boneDir(side.arm, side.foreArm, b.model), side.sign, d.armTwist) : null)],
        [side.foreArm, () => r.foreArm],
        [side.foreArm, () => (d.foreArmTwist ? twistRotation(this.boneDir(side.foreArm, side.hand, b.model), side.sign, d.foreArmTwist) : null)],
      ]
      for (const [bone, rotOf] of steps) {
        const rot = rotOf()
        if (!rot) continue
        this.undoStack.push([bone, bone.quaternion.clone()])
        const local = localAfterWorldRotation(this.modelQuat(bone.parent!, b.model), toQuat(bone.quaternion), rot)
        bone.quaternion.set(local[0], local[1], local[2], local[3])
      }
    }
  }
}
