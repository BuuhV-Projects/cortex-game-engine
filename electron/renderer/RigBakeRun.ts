import type * as THREE from 'three'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import { resolveProjectPath, splitPath } from './characterRigRegistry'
import type { JsonObject } from './characterRigSelection'
import type { Grip } from './characterRigWeapon'
import { splitVariant } from './characterRigWeapon'
import { bakedSidecar } from './characterRigBake'
import { replaceAnimations } from './glbAnimations'
import { bakeJob, bakeJobs, lostLinks } from './RigBake'
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

/** Assa e grava. Lança se não gravou (a mensagem vai para o estado). */
export async function runBake(input: BakeRunInput): Promise<BakeOutcome> {
  const { pose, arm } = input
  const store = pose.store
  const jobs = bakeJobs(store, arm, store.baseClips(), store.variantKeys(), new Set(input.gltfClips.keys()))
  if (!jobs.length) return { kind: 'none' }
  const refused = jobs.find((j) => lostLinks(store, j))
  if (refused) return { kind: 'refused', name: refused.name }
  const file = splitPath(input.glb).name
  if (!(await window.electronAPI.confirmDialog(t('characterRig.bake.confirm', { count: jobs.length, file })))) return { kind: 'cancelled' }
  const ctx = { sk: pose.skeleton, arm, store, clips: input.gltfClips, limits: pose.limits }
  const baked = jobs.map((j) => bakeJob(ctx, j))
  const glb = base64ToBytes(await window.electronAPI.readFileBase64(resolveProjectPath(input.projectDir, input.glb)))
  const next = replaceAnimations(glb, baked.map((b) => b.clip))
  const grips = new Map<string, Grip>()
  for (const j of jobs) {
    const w = splitVariant(j.name).weapon
    if (w) grips.set(w, store.grip(w))
  }
  const skin = isObject(input.skin) ? input.skin : {}
  const sidecar = bakedSidecar(skin, baked.map((b) => b.entry), grips)
  await window.electronAPI.characterRigWriteBake(input.projectDir, input.glb, input.clips, bytesToBase64(next), JSON.stringify(sidecar, null, SIDECAR_INDENT) + '\n')
  debug(SCOPE, 'assado gravado no GLB', input.glb, jobs.map((j) => j.name))
  return { kind: 'done', count: jobs.length, file }
}
