import type * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { h } from './ui'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import { resolveProjectPath } from './characterRigRegistry'
import { fullKey, type CharactersConfig } from './characterRigCharacters'
import { retargetAnimation, retargetRig } from './characterRigRetarget'
import { readSkinJson } from './RigBakeRun'

/**
 * Personagem da prévia (SPEC-0708, ADR-0707): o player (o GLB do build) ou um NPC — a malha de prévia dele, os clipes
 * do player retargetados para o esqueleto dele e, por cima, as variantes que o GLB dos NPCs já tem. O "gerado" do NPC
 * (o que o selo "gere de novo" compara) é o JSON do skin dos NPCs.
 */

const SCOPE = 'characterRig'

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

/** Lê e parseia um GLB do disco. */
export async function loadGlb(path: string): Promise<GLTF> {
  const b64 = await window.electronAPI.readFileBase64(path)
  return new Promise((res, rej) => new GLTFLoader().parse(base64ToArrayBuffer(b64), '', res, rej))
}

/** O que a prévia mostra para o personagem escolhido. */
export interface CharacterView {
  gltf: GLTF
  clips: Map<string, THREE.AnimationClip>
  /** JSON do skin que vale como "gerado". */
  skin: unknown
}

export class RigCharacterSource {
  readonly select: HTMLSelectElement
  private chars: CharactersConfig | null = null
  /** Código do player (o personagem da config). */
  player = ''

  constructor(onChange: () => void) {
    this.select = h('select', { class: 'gs-input', title: t('characterRig.character.hint') }) as HTMLSelectElement
    this.select.addEventListener('change', onChange)
    this.select.hidden = true
  }

  /** O NPC escolhido (`null` = o player). */
  get character(): string | null {
    return this.chars && this.select.value ? this.select.value : null
  }

  get characters(): CharactersConfig | null {
    return this.chars
  }

  /** Lista o player (`code`) e os NPCs da config; sem personagens na config, o seletor some. */
  setContext(chars: CharactersConfig | null, code: string): void {
    const prev = this.select.value
    this.chars = chars
    this.player = code
    this.select.hidden = !chars
    this.select.textContent = ''
    this.select.append(h('option', { value: '' }, t('characterRig.character.player', { code })))
    for (const c of chars?.codes ?? []) this.select.append(h('option', { value: c }, c))
    this.select.value = chars?.codes.includes(prev) ? prev : ''
  }

  /** O player: o próprio GLB. Um NPC: a malha dele com os clipes do player retargetados e as variantes dele. */
  async view(projectDir: string, player: GLTF, playerSkin: unknown): Promise<CharacterView> {
    const code = this.character
    const chars = this.chars
    if (!code || !chars) return { gltf: player, clips: new Map(player.animations.map((a) => [a.name, a])), skin: playerSkin }
    const npc = await loadGlb(resolveProjectPath(projectDir, `${chars.preview}/${code}.glb`)).catch(() => {
      throw new Error(t('characterRig.character.no_preview', { code }))
    })
    const from = retargetRig(player.scene)
    const to = retargetRig(npc.scene)
    const clips = new Map(player.animations.map((a) => [a.name, retargetAnimation(a, from, to)]))
    try {
      const variants = await loadGlb(resolveProjectPath(projectDir, chars.glb))
      for (const a of variants.animations) clips.set(a.name, a) // já no esqueleto do NPC
    } catch (err) {
      debug(SCOPE, 'sem o GLB das variantes dos NPCs', chars.glb, err)
    }
    const skin = await readSkinJson(resolveProjectPath(projectDir, chars.clips))
    return { gltf: npc, clips, skin }
  }

  /** Animação a tocar do clipe: num NPC, a variante mais específica que existir; no player, a da arma ou a base. */
  anim(clips: ReadonlyMap<string, THREE.AnimationClip>, clip: string, weapon: string | null): string {
    const code = this.character
    const g = this.chars?.group ?? null
    const order = code ? [fullKey(clip, weapon, code), fullKey(clip, weapon, g), fullKey(clip, null, code), fullKey(clip, null, g)] : []
    order.push(fullKey(clip, weapon, null), clip)
    return order.find((n) => clips.has(n)) ?? clip
  }
}
