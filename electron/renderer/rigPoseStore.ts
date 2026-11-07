/**
 * Estado da pose por clipe do auto-rig (SPEC-0349 adendos 8 e 9; SPEC-0703): o que
 * está na config do disco, a edição não salva, o que o build gerou, o desfazer da
 * sessão e a gravação. Sem DOM e sem three.js.
 *
 * Chave = clipe (`idle`), variante por arma (`idle@ARM-02`) ou por personagem (`idle@ARM-02#npc-001`,
 * SPEC-0708). A chave sem nada salvo nem editado herda pela cadeia da `inheritChain`. A pegada é por arma (vale para todos os
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
import { charactersOf, inheritChain, isNpcTarget, splitKey, type CharactersConfig } from './characterRigCharacters.js'
import { applyCharacterVariants, characterFollowsFromConfig, characterPosesFromConfig, characterSpacesFromConfig, type EditSpace } from './characterRigCharacterConfig.js'

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
  /** Personagens da config (`null` = um só, como antes) e o espaço das chaves de NPC (salvo e pendente). */
  private chars: CharactersConfig | null = null
  private spaces = new Map<string, EditSpace>()
  private editedSpaces = new Map<string, EditSpace>()

  constructor(private readonly io: ConfigIO) {}

  /** Config do disco. Mesma config: edição ainda não salva continua; outra: começa do disco. */
  setConfig(path: string, cfg: JsonObject | null): void {
    this.readSaved(cfg)
    if (path !== this.path) {
      this.edited = new Map()
      this.editedFollow = new Map()
      this.editedGrips = new Map()
      this.editedSpaces = new Map()
      this.undo.clear()
    } else {
      for (const k of [...this.edited.keys()]) if (!this.poseUnsaved(k)) this.edited.delete(k)
      for (const k of [...this.editedFollow.keys()]) if (!this.followUnsaved(k)) this.editedFollow.delete(k)
      for (const w of [...this.editedGrips.keys()]) if (!this.gripUnsaved(w)) this.editedGrips.delete(w)
    }
    this.path = path
  }

  private readSaved(cfg: JsonObject | null): void {
    this.saved = cfg ? new Map([...posesFromConfig(cfg), ...variantPosesFromConfig(cfg), ...characterPosesFromConfig(cfg)]) : new Map()
    this.savedFollow = cfg ? new Map([...followsFromConfig(cfg), ...variantFollowsFromConfig(cfg), ...characterFollowsFromConfig(cfg)]) : new Map()
    this.savedGrips = cfg ? gripsFromConfig(cfg) : new Map()
    this.chars = charactersOf(cfg)
    this.spaces = cfg ? characterSpacesFromConfig(cfg) : new Map()
  }

  /** Os personagens da config (SPEC-0708; `null` = só o da config). */
  get characters(): CharactersConfig | null {
    return this.chars
  }

  /** Espaço da edição da chave de NPC (`player` = veio do player; o assado retargeta). */
  spaceOf(key: string): EditSpace {
    return this.editedSpaces.get(key) ?? this.spaces.get(key) ?? 'own'
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

  /** Clipes base da config (sem arma nem personagem). */
  baseClips(): string[] {
    return [...this.saved.keys()].filter((k) => {
      const p = splitKey(k)
      return !p.weapon && !p.target
    })
  }

  /** Variantes salvas na config (por arma e/ou por personagem; pose ou ligações próprias). */
  variantKeys(): string[] {
    return [...new Set([...this.saved.keys(), ...this.savedFollow.keys()])].filter((k) => {
      const p = splitKey(k)
      return (!!p.weapon || !!p.target) && this.editable(k)
    })
  }

  /** Clipes base na config (para "aplicar a todos"). */
  get clipCount(): number {
    return this.baseClips().length
  }

  /** O primeiro da cadeia de herança da chave que `get` tem (a própria, a da arma, a do clipe…). */
  private inherited<T>(key: string, get: (k: string) => T | undefined): T | undefined {
    for (const k of inheritChain(key, this.chars)) {
      const v = get(k)
      if (v !== undefined) return v
    }
    return undefined
  }

  private savedPose(key: string): ReadonlyMap<string, Quat> {
    return this.inherited(key, (k) => this.saved.get(k)) ?? EMPTY
  }

  private savedLinks(key: string): readonly FollowLink[] {
    return this.inherited(key, (k) => this.savedFollow.get(k)) ?? []
  }

  /** Pose desejada: a edição ou a salva da chave, ou a primeira da cadeia de herança. */
  wanted(key: string): Map<string, Quat> {
    return new Map(this.inherited(key, (k) => this.edited.get(k) ?? this.saved.get(k)) ?? EMPTY)
  }

  wantedFollow(key: string): FollowLink[] {
    return [...(this.inherited(key, (k) => this.editedFollow.get(k) ?? this.savedFollow.get(k)) ?? [])]
  }

  /** Descarta a edição não salva da chave (o "aplicar a" levou para outras chaves). */
  discardEdit(key: string): void {
    this.edited.delete(key)
    this.editedFollow.delete(key)
  }

  /**
   * "Aplicar a" (SPEC-0708): a pose e as ligações desejadas de `from` viram a edição de cada chave de `to`, com o espaço
   * de onde vieram (`player` = editado no player, para um NPC). Grava no próximo `save`.
   */
  applyEditTo(from: string, to: readonly string[], space: EditSpace): void {
    const pose = this.wanted(from)
    const links = this.wantedFollow(from)
    for (const k of to) {
      // a própria chave também leva o espaço (reeditada num NPC, deixa de ser "do player")
      if (isNpcTarget(this.chars, splitKey(k).target)) this.editedSpaces.set(k, space)
      if (k === from) continue
      this.edited.set(k, new Map(pose))
      this.editedFollow.set(k, [...links])
    }
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
    // base (sem arma nem alvo), variante por arma, variante por personagem (SPEC-0708)
    const kindOf = (k: string): 'base' | 'weapon' | 'character' => {
      const p = splitKey(k)
      return p.target ? 'character' : p.weapon ? 'weapon' : 'base'
    }
    const part = <T>(m: Map<string, T>, kind: ReturnType<typeof kindOf>): Map<string, T> => new Map([...m].filter(([k]) => kindOf(k) === kind))
    const before = stripBom(await this.io.read(this.path))
    let next = applyFollows(applyPoses(parseConfigObject(before), part(pending, 'base')), part(pendingFollow, 'base'))
    next = applyGrips(applyVariants(next, part(pending, 'weapon'), part(pendingFollow, 'weapon')), pendingGrips)
    next = applyCharacterVariants(next, part(pending, 'character'), part(pendingFollow, 'character'), this.editedSpaces)
    const text = serializeConfig(next)
    if (text !== before) await this.io.write(this.path, text)
    this.readSaved(next)
    this.edited = new Map()
    this.editedFollow = new Map()
    this.editedGrips = new Map()
    this.editedSpaces = new Map()
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
