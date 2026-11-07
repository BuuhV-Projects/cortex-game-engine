import type * as THREE from 'three'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import { resolveProjectPath, splitPath } from './characterRigRegistry'
import type { JsonObject } from './characterRigSelection'
import type { Grip } from './characterRigWeapon'
import { splitVariant } from './characterRigWeapon'
import { bakedSidecar } from './characterRigBake'
import { replaceAnimations } from './glbAnimations'
import { stripBom } from './rigPoseStore'
import { bakeJob, bakeJobs, lostLinks, type BakeJob } from './RigBake'
import { keysForView, retargetBaked } from './RigBakeCharacters'
import { retargetRig } from './characterRigRetarget'
import { loadGlb } from './RigCharacterSource'
import type { RigArmAdjust } from './RigArmAdjust'
import type { RigPoseEditor } from './RigPoseEditor'

/**
 * "Gravar no GLB do jogo" (SPEC-0704): monta as chaves a assar, recusa se o build tem ligação que o
 * desejado não tem, confirma, assa, reescreve só as animações do GLB (ADR-0705), atualiza o JSON do skin
 * e grava o par pelo IPC (com backup).
 */

const SCOPE = 'characterRig'
const BASE64_CHUNK = 0x8000
const SIDECAR_INDENT = 1

export interface BakeRunInput {
  projectDir: string
  /** GLB e JSON do skin do build mostrado (como no `rigs.json`, relativos ao projeto ou absolutos). */
  glb: string
  clips: string
  pose: RigPoseEditor
  arm: RigArmAdjust
  gltfClips: ReadonlyMap<string, THREE.AnimationClip>
  skin: unknown
  /** O NPC mostrado (`null` = o player) e o código do player (SPEC-0708). */
  character?: string | null
  player?: string
}

/** Resultado para a linha de estado. */
export type BakeOutcome = { kind: 'none' } | { kind: 'refused'; name: string } | { kind: 'cancelled' } | { kind: 'done'; count: number; file: string }

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))
  return btoa(s)
}

function isObject(v: unknown): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Texto da linha de estado para o resultado (`null` = cancelado, nada a dizer). */
export function bakeMessage(out: BakeOutcome): { text: string; warn: boolean } | null {
  if (out.kind === 'none') return { text: t('characterRig.bake.none'), warn: false }
  if (out.kind === 'refused') return { text: t('characterRig.bake.refused', { name: out.name }), warn: true }
  if (out.kind === 'done') return { text: t('characterRig.bake.done', { count: out.count, file: out.file }), warn: false }
  return null
}

/** Grava um par GLB + JSON do skin (backup e troca atômica no main, ADR-0705). */
async function writePair(projectDir: string, glbRel: string, jsonRel: string, glb: Uint8Array, sidecar: JsonObject): Promise<void> {
  await window.electronAPI.characterRigWriteBake(projectDir, glbRel, jsonRel, bytesToBase64(glb), JSON.stringify(sidecar, null, SIDECAR_INDENT) + '\n')
}

/**
 * Assa e grava. Lança se não gravou (a mensagem vai para o estado). Com personagens (SPEC-0708): no player, as chaves
 * dele vão para o GLB dele e as de NPC editadas nele, retargetadas, para o GLB dos NPCs; num NPC, as dele vão para o
 * GLB dos NPCs.
 */
export async function runBake(input: BakeRunInput): Promise<BakeOutcome> {
  // sem o JSON do skin não há como gravar o par: o JSON novo perderia o que o jogo lê (stride, marks…)
  if (!isObject(input.skin)) throw new Error(t('characterRig.bake.skin_unreadable'))
  const { pose, arm } = input
  const store = pose.store
  const character = input.character ?? null
  const chars = store.characters
  const view = keysForView(store, store.variantKeys(), character, input.player ?? '')
  const anims = new Set(input.gltfClips.keys())
  const jobs = bakeJobs(store, arm, character ? [] : store.baseClips(), view.own, anims)
  const toNpc: BakeJob[] = character || !chars ? [] : bakeJobs(store, arm, [], view.toNpc, anims)
  if (view.skipped.length) debug(SCOPE, 'chaves para a outra visão (player × NPC)', view.skipped)
  const all = [...jobs, ...toNpc]
  if (!all.length) return { kind: 'none' }
  const refused = all.find((j) => lostLinks(store, j))
  if (refused) return { kind: 'refused', name: refused.name }
  const npcPair = character || toNpc.length ? chars : null
  const file = [character ? null : splitPath(input.glb).name, npcPair ? splitPath(npcPair.glb).name : null].filter(Boolean).join(' + ')
  if (!(await window.electronAPI.confirmDialog(t('characterRig.bake.confirm', { count: all.length, file })))) return { kind: 'cancelled' }
  const ctx = { sk: pose.skeleton, arm, store, clips: input.gltfClips, limits: pose.limits }
  const baked = jobs.map((j) => bakeJob(ctx, j))
  const grips = new Map<string, Grip>()
  for (const j of all) {
    const w = splitVariant(j.name).weapon
    if (w) grips.set(w, store.grip(w))
  }
  if (!character && baked.length) {
    const glb = base64ToBytes(await window.electronAPI.readFileBase64(resolveProjectPath(input.projectDir, input.glb)))
    await writePair(input.projectDir, input.glb, input.clips, replaceAnimations(glb, baked.map((b) => b.clip)), bakedSidecar(input.skin, baked.map((b) => b.entry), grips))
  }
  if (npcPair) {
    const glbPath = resolveProjectPath(input.projectDir, npcPair.glb)
    const npcSkin = await readSkinJson(resolveProjectPath(input.projectDir, npcPair.clips))
    let clips = character ? baked.map((b) => b.clip) : []
    let entries = character ? baked.map((b) => b.entry) : []
    if (toNpc.length && pose.skeleton.model) {
      // editadas no player: assadas no player e levadas para o esqueleto dos NPCs (a conta do jogo)
      const from = retargetRig(pose.skeleton.model)
      const to = retargetRig((await loadGlb(glbPath)).scene)
      const fromPlayer = toNpc.map((j) => ({ j, b: bakeJob(ctx, j) }))
      clips = fromPlayer.map(({ j, b }) => retargetBaked(b.clip, input.gltfClips.get(j.anim)!.duration, from, to))
      entries = fromPlayer.map(({ b }) => b.entry)
    }
    const glb = base64ToBytes(await window.electronAPI.readFileBase64(glbPath))
    await writePair(input.projectDir, npcPair.glb, npcPair.clips, replaceAnimations(glb, clips), bakedSidecar(isObject(npcSkin) ? npcSkin : { clips: {} }, entries, grips))
  }
  debug(SCOPE, 'assado gravado', file, all.map((j) => j.name))
  return { kind: 'done', count: all.length, file }
}

/**
 * O botão inteiro: salva a config pendente (`save`), assa e grava, recarrega o build (`reload`) e devolve
 * a mensagem do estado (`null` = nada a dizer). Erro vira mensagem, não exceção.
 */
export async function bakeFlow(input: BakeRunInput, save: () => Promise<boolean>, reload: () => Promise<void>): Promise<{ text: string; warn: boolean } | null> {
  try {
    if (!(await save())) return null
    const out = await runBake(input)
    if (out.kind === 'done') await reload()
    return bakeMessage(out)
  } catch (err) {
    return { text: t('characterRig.bake.failed', { error: err instanceof Error ? err.message : String(err) }), warn: true }
  }
}

/** JSON do skin do build (`armOffsets`/`poseOffsets` por clipe, de onde o assado parte); ilegível = `null`. */
export async function readSkinJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(stripBom(await window.electronAPI.readFile(path))) as unknown
  } catch (err) {
    debug(SCOPE, 'JSON do skin ilegível: ajuste e pose gerados = 0', path, err)
    return null
  }
}
