/**
 * Estado da pose por clipe do auto-rig (SPEC-0349 adendos 8 e 9; SPEC-0703): o que
 * está na config do disco, a edição não salva, o que o build gerou, o desfazer da
 * sessão e a gravação. Sem DOM e sem three.js.
 *
 * Chave = clipe (`idle`) ou variante por arma (`idle@ARM-02`). A variante sem nada
 * salvo nem editado parte do clipe base. A pegada é por arma (vale para todos os
 * clipes dela) e entra no desfazer da chave editada.
 */

import type { JsonObject } from './characterRigSelection.js'
import { parseConfigObject, serializeConfig } from './characterRigSelection.js'
import type { Quat } from './characterRigArmSpace.js'
import { applyPoseToAll, applyPoses, posesFromConfig, posesFromSkin, samePose, type Pose } from './characterRigPose.js'
import { applyFollows, followsFromConfig, followsFromSkin, sameFollows, type FollowLink } from './characterRigFollow.js'
import {
  DEFAULT_GRIP,
  applyGrips,
  applyVariants,
  gripsFromConfig,
  sameGrip,
  splitVariant,
  variantFollowsFromConfig,
  variantKey,
  variantPosesFromConfig,
  type Grip,
} from './characterRigWeapon.js'

/**
 * O que o Ctrl+Z devolve: a edição crua de pose e ligações da chave (`undefined` =
 * sem edição, herda) e a pegada, se a edição foi nela.
 */
interface UndoEntry {
  pose: Map<string, Quat> | undefined
  follow: FollowLink[] | undefined
  grip?: { weapon: string; grip: Grip | null }
}

/** Leitura e gravação do arquivo (a janela do Electron, trocável nos testes). */
export interface ConfigIO {
  read(path: string): Promise<string>
  write(path: string, text: string): Promise<void>
}

const EMPTY: ReadonlyMap<string, Quat> = new Map()

/** Tira o BOM do começo do texto. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export class PoseStore {
  path = ''
  private saved = new Map<string, Map<string, Quat>>()
  private edited = new Map<string, Map<string, Quat>>()
  private generated = new Map<string, Map<string, Quat>>()
  private savedFollow = new Map<string, FollowLink[]>()
  private editedFollow = new Map<string, FollowLink[]>()
  private generatedFollow = new Map<string, FollowLink[]>()
  private savedGrips = new Map<string, Grip>()
  private editedGrips = new Map<string, Grip>()
  private readonly undo = new Map<string, UndoEntry[]>()

  constructor(private readonly io: ConfigIO) {}

  /** Config do disco. Mesma config: edição ainda não salva continua; outra: começa do disco. */
  setConfig(path: string, cfg: JsonObject | null): void {
    this.readSaved(cfg)
    if (path !== this.path) {
      this.edited = new Map()
      this.editedFollow = new Map()
      this.editedGrips = new Map()
      this.undo.clear()
    } else {
      for (const k of [...this.edited.keys()]) if (!this.poseUnsaved(k)) this.edited.delete(k)
      for (const k of [...this.editedFollow.keys()]) if (!this.followUnsaved(k)) this.editedFollow.delete(k)
      for (const w of [...this.editedGrips.keys()]) if (!this.gripUnsaved(w)) this.editedGrips.delete(w)
    }
    this.path = path
  }

  private readSaved(cfg: JsonObject | null): void {
    this.saved = cfg ? new Map([...posesFromConfig(cfg), ...variantPosesFromConfig(cfg)]) : new Map()
    this.savedFollow = cfg ? new Map([...followsFromConfig(cfg), ...variantFollowsFromConfig(cfg)]) : new Map()
    this.savedGrips = cfg ? gripsFromConfig(cfg) : new Map()
  }

  /** `poseOffsets` e `follow` por animação do JSON do skin do build (`null` = vazio). */
  setGenerated(skin: unknown): void {
    this.generated = posesFromSkin(skin)
    this.generatedFollow = followsFromSkin(skin)
  }

  /** O clipe base da chave está na config (só ele tem pose editável). */
  editable(key: string): boolean {
    return this.saved.has(splitVariant(key).clip)
  }

  /** Clipes base da config. */
  baseClips(): string[] {
    return [...this.saved.keys()].filter((k) => !splitVariant(k).weapon)
  }

  /** Variantes `clipe@ARMA` salvas na config (pose ou ligações próprias). */
  variantKeys(): string[] {
    return [...new Set([...this.saved.keys(), ...this.savedFollow.keys()])].filter((k) => !!splitVariant(k).weapon && this.editable(k))
  }

  /** Clipes base na config (para "aplicar a todos"). */
  get clipCount(): number {
    return [...this.saved.keys()].filter((k) => !splitVariant(k).weapon).length
  }

  private savedPose(key: string): ReadonlyMap<string, Quat> {
    const { clip, weapon } = splitVariant(key)
    return this.saved.get(key) ?? (weapon ? this.saved.get(clip) : undefined) ?? EMPTY
  }

  private savedLinks(key: string): readonly FollowLink[] {
    const { clip, weapon } = splitVariant(key)
    return this.savedFollow.get(key) ?? (weapon ? this.savedFollow.get(clip) : undefined) ?? []
  }

  /** Pose desejada: a edição, a salva ou (variante sem nada) a do clipe base. */
  wanted(key: string): Map<string, Quat> {
    const { clip, weapon } = splitVariant(key)
    const own = this.edited.get(key) ?? this.saved.get(key)
    return new Map(own ?? (weapon ? this.wanted(clip) : EMPTY))
  }

  wantedFollow(key: string): FollowLink[] {
    const { clip, weapon } = splitVariant(key)
    const own = this.editedFollow.get(key) ?? this.savedFollow.get(key)
    return [...(own ?? (weapon ? this.wantedFollow(clip) : []))]
  }

  generatedPose(anim: string): ReadonlyMap<string, Quat> {
    return this.generated.get(anim) ?? EMPTY
  }

  generatedLinks(anim: string): readonly FollowLink[] {
    return this.generatedFollow.get(anim) ?? []
  }

  /** As ligações gravadas na animação `anim` do build diferem das desejadas para `key`. */
  followNeedsRegen(key: string, anim: string): boolean {
    return this.editable(key) && !sameFollows(this.wantedFollow(key), this.generatedLinks(anim))
  }

  /** A pose ou as ligações desejadas (`key`) diferem do gerado na animação mostrada (`anim`). */
  needsRegen(key: string, anim: string): boolean {
    if (!this.editable(key)) return false
    // variante salva que o build ainda não tem: sempre "gere de novo"
    if (key !== anim && (this.saved.has(key) || this.savedFollow.has(key))) return true
    return !samePose(this.wanted(key), this.generatedPose(anim)) || this.followNeedsRegen(key, anim)
  }

  private poseUnsaved(key: string): boolean {
    const v = this.edited.get(key)
    return !!v && !samePose(v, this.savedPose(key))
  }

  private followUnsaved(key: string): boolean {
    const v = this.editedFollow.get(key)
    return !!v && !sameFollows(v, this.savedLinks(key))
  }

  private gripUnsaved(weapon: string): boolean {
    const g = this.editedGrips.get(weapon)
    return !!g && !sameGrip(g, this.savedGrips.get(weapon) ?? DEFAULT_GRIP)
  }

  /** Pose ou ligações da chave (ou a pegada da arma dela) ainda não gravadas. */
  isUnsaved(key: string): boolean {
    const w = splitVariant(key).weapon
    return this.poseUnsaved(key) || this.followUnsaved(key) || (!!w && this.gripUnsaved(w))
  }

  anyUnsaved(): boolean {
    return [...this.edited.keys()].some((k) => this.poseUnsaved(k))
      || [...this.editedFollow.keys()].some((k) => this.followUnsaved(k))
      || [...this.editedGrips.keys()].some((w) => this.gripUnsaved(w))
  }

  grip(weapon: string): Grip {
    return this.editedGrips.get(weapon) ?? this.savedGrips.get(weapon) ?? DEFAULT_GRIP
  }

  // ── Edição ────────────────────────────────────────────────────────────────

  setPose(key: string, pose: Map<string, Quat>): void {
    this.edited.set(key, pose)
  }

  setFollow(key: string, links: FollowLink[]): void {
    this.editedFollow.set(key, links)
  }

  setGrip(weapon: string, grip: Grip): void {
    this.editedGrips.set(weapon, grip)
  }

  /** Empilha o estado atual da chave (antes de uma edição); `weapon` = a edição é na pegada. */
  pushUndo(key: string, weapon?: string): void {
    const stack = this.undo.get(key) ?? []
    stack.push({
      pose: this.edited.get(key),
      follow: this.editedFollow.get(key),
      ...(weapon ? { grip: { weapon, grip: this.editedGrips.get(weapon) ?? null } } : {}),
    })
    this.undo.set(key, stack)
  }

  /** Tira a última entrada sem aplicar (arrasto que não mudou nada). */
  dropUndo(key: string): void {
    this.undo.get(key)?.pop()
  }

  /** Ctrl+Z: volta a chave ao estado de antes da última edição. */
  undoLast(key: string): boolean {
    const prev = this.undo.get(key)?.pop()
    if (!prev) return false
    if (prev.pose) this.edited.set(key, prev.pose)
    else this.edited.delete(key)
    if (prev.follow) this.editedFollow.set(key, prev.follow)
    else this.editedFollow.delete(key)
    if (prev.grip) {
      if (prev.grip.grip) this.editedGrips.set(prev.grip.weapon, prev.grip.grip)
      else this.editedGrips.delete(prev.grip.weapon)
    }
    return true
  }

  // ── Gravação ──────────────────────────────────────────────────────────────

  /**
   * Relê a config do disco e grava o pendente (poses, ligações, variantes e
   * pegadas), só se o texto muda. Devolve quantos itens gravou; lança se não gravou.
   */
  async save(): Promise<number> {
    const pending = new Map([...this.edited].filter(([k]) => this.poseUnsaved(k)))
    const pendingFollow = new Map([...this.editedFollow].filter(([k]) => this.followUnsaved(k)))
    const pendingGrips = new Map([...this.editedGrips].filter(([w]) => this.gripUnsaved(w)))
    if (!this.path || (!pending.size && !pendingFollow.size && !pendingGrips.size)) return 0
    const base = <T>(m: Map<string, T>, variant: boolean): Map<string, T> => new Map([...m].filter(([k]) => !!splitVariant(k).weapon === variant))
    const before = stripBom(await this.io.read(this.path))
    let next = applyFollows(applyPoses(parseConfigObject(before), base(pending, false)), base(pendingFollow, false))
    next = applyGrips(applyVariants(next, base(pending, true), base(pendingFollow, true)), pendingGrips)
    const text = serializeConfig(next)
    if (text !== before) await this.io.write(this.path, text)
    this.readSaved(next)
    this.edited = new Map()
    this.editedFollow = new Map()
    this.editedGrips = new Map()
    return pending.size + pendingFollow.size + pendingGrips.size
  }

  /**
   * A pose da chave em todos os clipes de `skinned.clips` (na variante da mesma
   * arma, se a chave tem arma). `confirm` recebe o número de clipes; `false` = não
   * gravou. Edições pendentes de pose são substituídas.
   */
  async applyToAll(key: string, confirm: (count: number, bones: number) => Promise<boolean>): Promise<number | null> {
    if (!this.path || !this.editable(key)) return null
    const pose: Pose = this.wanted(key)
    const before = stripBom(await this.io.read(this.path))
    const cfg = parseConfigObject(before)
    const clips = [...posesFromConfig(cfg).keys()]
    if (!(await confirm(clips.length, pose.size))) return null
    const weapon = splitVariant(key).weapon
    const next = weapon
      ? applyVariants(cfg, new Map(clips.map((c) => [variantKey(c, weapon), pose])), new Map())
      : applyPoseToAll(cfg, pose)
    const text = serializeConfig(next)
    if (text !== before) await this.io.write(this.path, text)
    this.readSaved(next)
    this.edited = new Map()
    return clips.length
  }
}
