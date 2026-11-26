import * as THREE from 'three'
import { debug } from '../../src/core/debug'
import { GRIP_BONE, PALM, type Grip } from './characterRigWeapon'
import { WEAPON_SELECTION } from './RigPosePanel'
import { gripView, keyNudge, nudgeGrip, patchGrip, readQuat4, readVec3 } from './rigRemoteGrip'
import { TRI_FLOATS, measureHand, worldTriangles, type HandMeasure } from './rigMeasure'
import { serialQueue } from './serialQueue'
import { VIEW_DIRECTIONS, type RigView } from './rigViewKeys'
import type { RigPoseEditor } from './RigPoseEditor'
import type { RigPlaybar } from './RigPlaybar'
import type { RigViewCamera } from './RigViewCamera'
import type { RigCharacterSource } from './RigCharacterSource'

/**
 * Comandos da ponte local no painel de auto-rig (SPEC-0746, ADR-0747) e os atalhos de teclado da pegada. Só mexe pela
 * API pública do editor de pose: a pegada vai para a store com o desfazer, como o gizmo.
 */

const SCOPE = 'rig-remote'
/** Distância padrão da câmera no foco (m). */
const FOCUS_DISTANCE = 0.6
const PNG_PREFIX = /^data:image\/png;base64,/
/** Mãos medidas e o prefixo dos ossos de cada uma. */
const HANDS = { right: 'RightHand', left: 'LeftHand' } as const
const VIEWS = Object.keys(VIEW_DIRECTIONS) as RigView[]

/** O que o painel dá ao controle remoto. */
export interface RigRemoteHost {
  readonly pose: RigPoseEditor
  readonly bar: RigPlaybar
  readonly chars: RigCharacterSource
  view(): RigViewCamera | null
  canvas(): HTMLCanvasElement | null
  /** A aba Animações à mostra. */
  isOpen(): boolean
  currentClip(): string | null
  currentAnim(): string | null
  clipNames(): string[]
  play(name: string): void
  /** Um quadro sem avançar o tempo: aplica braços, pose e arma e desenha. */
  frame(): void
  bake(confirm: (message: string) => Promise<boolean>): Promise<{ text: string; warn: boolean } | null>
  status(): string
}

type Args = Record<string, unknown>

export class RigRemote {
  private readonly detach: () => void

  /** Já assina os comandos do main (`dispose` desliga). */
  constructor(private readonly host: RigRemoteHost) {
    this.detach = this.attach()
  }

  dispose(): void {
    this.detach()
  }

  private get pose(): RigPoseEditor {
    return this.host.pose
  }

  /** Assina os comandos do main; devolve a função que desliga. */
  private attach(): () => void {
    const api = window.electronAPI
    if (!api.onRigRemote) return () => undefined
    const enqueue = serialQueue()
    return api.onRigRemote(async ({ id, cmd, args }) => {
      try {
        api.rigRemoteReply(id, { ok: true, result: await enqueue(() => this.run(cmd, args ?? {})) })
      } catch (err) {
        api.rigRemoteReply(id, { ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  /** Executa um comando (lança com a mensagem para quem chamou). */
  async run(cmd: string, args: Args): Promise<unknown> {
    if (!this.host.isOpen()) throw new Error('abra o painel Auto-rig de personagem, aba Animações')
    if (!this.pose.hasModel) throw new Error('o painel não tem modelo carregado')
    debug(SCOPE, cmd, args)
    switch (cmd) {
      case 'state':
        return this.state()
      case 'setGrip':
        return this.editGrip((g) => patchGrip(g, { offsetCm: readVec3(args['offsetCm'], 'offsetCm'), rotationDeg: readVec3(args['rotationDeg'], 'rotationDeg'), rotation: readQuat4(args['rotation'], 'rotation') }))
      case 'nudgeGrip':
        return this.editGrip((g) => nudgeGrip(g, readVec3(args['moveCm'], 'moveCm'), readVec3(args['rotateDeg'], 'rotateDeg')))
      case 'supportHand':
        this.needWeapon()
        this.pose.supportHand()
        return this.state()
      case 'clip':
        return this.clip(args)
      case 'camera':
        return this.camera(args)
      case 'snapshot':
        return this.snapshot()
      case 'measure':
        return this.measure()
      case 'save':
        return this.save(args['target'])
      default:
        throw new Error(`comando desconhecido: ${cmd}`)
    }
  }

  /** Setas e PgUp/PgDn movem a arma 1 mm (com Alt, giram 1°); F foca. `true` se usou a tecla. */
  handleKey(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return false
    if (e.ctrlKey || e.metaKey || e.shiftKey) return false
    if (e.key.toLowerCase() === 'f' && !e.altKey) return this.focusSelected()
    const nudge = keyNudge(e.key, e.altKey)
    if (!nudge || !this.pose.weapon.weapon || !this.pose.editable) return false
    this.editGrip((g) => nudgeGrip(g, nudge.moveCm, nudge.rotateDeg))
    return true
  }

  private needWeapon(): string {
    const code = this.pose.weapon.weapon
    if (!code) throw new Error('sem arma na mão: escolha uma em "Arma na mão" ou pelo comando clip { weapon }')
    return code
  }

  /** Muda a pegada da chave mostrada com o desfazer empilhado. */
  private editGrip(fn: (g: Grip) => Grip): unknown {
    this.needWeapon()
    const key = this.pose.key
    if (!key || !this.pose.editable) throw new Error('a chave mostrada não é editável')
    const store = this.pose.store
    store.pushUndo(key, true)
    store.setGrip(key, fn(store.previewGrip(key)))
    this.pose.changed()
    return this.state()
  }

  private state(): unknown {
    const key = this.pose.key
    const weapon = this.pose.weapon.weapon
    return {
      character: this.host.chars.character,
      player: this.host.chars.player,
      weapon,
      weapons: this.pose.weapon.codes,
      clip: this.host.currentClip(),
      anim: this.host.currentAnim(),
      clips: this.host.clipNames(),
      time: this.host.bar.time,
      duration: this.host.bar.clip?.duration ?? 0,
      playing: this.host.bar.playing,
      key,
      grip: key && weapon ? { key: this.pose.store.gripKeyFor(key), ...gripView(this.pose.store.previewGrip(key)) } : null,
      selected: this.pose.selected,
      unsaved: this.pose.isUnsaved(),
      status: this.host.status(),
    }
  }

  private clip(args: Args): unknown {
    if (args['weapon'] !== undefined) {
      const code = args['weapon'] === null || args['weapon'] === '' ? null : String(args['weapon'])
      if (code && !this.pose.weapon.codes.includes(code)) throw new Error(`arma ${code} não existe (há: ${this.pose.weapon.codes.join(', ')})`)
      this.pose.chooseWeapon(code)
    }
    if (typeof args['name'] === 'string') {
      if (!this.host.clipNames().includes(args['name'])) throw new Error(`clipe ${args['name']} não existe no build mostrado`)
      this.host.play(args['name'])
    }
    if (typeof args['time'] === 'number') this.host.bar.seekTo(Math.max(0, args['time']))
    if (typeof args['playing'] === 'boolean') this.host.bar.setPlaying(args['playing'])
    this.host.frame()
    return this.state()
  }

  /** Posição de mundo do foco: um osso pelo nome, ou `weapon` (o centro da caixa da arma). */
  private focusPoint(focus: string): THREE.Vector3 {
    if (focus === 'weapon' || focus === WEAPON_SELECTION) {
      this.needWeapon()
      return new THREE.Box3().setFromObject(this.pose.weapon.holder).getCenter(new THREE.Vector3())
    }
    const bone = this.pose.skeleton.bones.get(focus) ?? this.pose.skeleton.model?.getObjectByName(focus)
    if (!bone) throw new Error(`osso ${focus} não existe no modelo`)
    return bone.getWorldPosition(new THREE.Vector3())
  }

  private camera(args: Args): unknown {
    const view = this.host.view()
    if (!view) throw new Error('a prévia está sem WebGL')
    const name = args['view']
    if (name !== undefined && !VIEWS.includes(name as RigView)) throw new Error(`vista ${String(name)}: use ${VIEWS.join(', ')}`)
    const distance = typeof args['distance'] === 'number' && args['distance'] > 0 ? args['distance'] : FOCUS_DISTANCE
    this.host.frame()
    const focus = typeof args['focus'] === 'string' ? args['focus'] : GRIP_BONE
    view.place(this.focusPoint(focus), (name as RigView | undefined) ?? null, distance)
    this.host.frame()
    return { view: name ?? null, focus, distance }
  }

  /** F: foca o osso selecionado (a arma, se é ela; sem seleção, a mão da arma). */
  private focusSelected(): boolean {
    const view = this.host.view()
    if (!view) return false
    const sel = this.pose.selected ?? GRIP_BONE
    try {
      view.place(this.focusPoint(sel), null, FOCUS_DISTANCE)
      return true
    } catch (err) {
      debug(SCOPE, 'F sem alvo', sel, err)
      return false
    }
  }

  private snapshot(): unknown {
    const canvas = this.host.canvas()
    if (!canvas) throw new Error('a prévia está sem WebGL')
    this.host.frame() // desenha e lê no mesmo quadro (o buffer do WebGL não é preservado)
    const png = canvas.toDataURL('image/png').replace(PNG_PREFIX, '')
    return { png, width: canvas.width, height: canvas.height }
  }

  private measure(): unknown {
    this.needWeapon()
    this.host.frame()
    const tris = worldTriangles(this.pose.weapon.holder)
    const model = this.pose.skeleton.model
    if (!model) throw new Error('o painel não tem modelo carregado')
    const hands: Record<string, HandMeasure> = {}
    for (const [side, prefix] of Object.entries(HANDS)) {
      const points: Array<{ name: string; pos: THREE.Vector3 }> = []
      model.traverse((o) => {
        if ((o as THREE.Bone).isBone && o.name.startsWith(prefix)) points.push({ name: o.name, pos: o.getWorldPosition(new THREE.Vector3()) })
      })
      const hand = model.getObjectByName(prefix)
      if (hand) points.push({ name: `${prefix}.palm`, pos: hand.localToWorld(new THREE.Vector3(...PALM)) })
      hands[side] = measureHand(points, tris)
    }
    return { weapon: this.pose.weapon.weapon, triangles: tris.length / TRI_FLOATS, hands }
  }

  private async save(target: unknown): Promise<unknown> {
    if (target === 'pose') {
      const ok = await this.pose.ui.save()
      if (!ok) throw new Error(this.host.status() || 'não gravou a pose')
      return { saved: 'pose', state: this.state() }
    }
    if (target !== 'glb') throw new Error('target: use pose ou glb')
    const msg = await this.host.bake(async () => true)
    if (!msg) throw new Error('não gravou: sem build carregado ou com o pipeline rodando')
    if (msg.warn) throw new Error(msg.text)
    return { saved: 'glb', message: msg.text, state: this.state() }
  }
}
