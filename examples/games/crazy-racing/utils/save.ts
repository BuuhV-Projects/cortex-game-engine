import {
  CUPS,
  DEFAULT_CUSTOMIZATION,
  PHASES_PER_WORLD,
  WORLDS,
  type CupId,
  type PlayerCustomization,
  type WorldId,
} from './constants'
import { DEFAULT_BINDING, type GamepadBinding } from './inputBinding'

const STORAGE_KEY = 'corrida-maluca:save:v1'

export interface PhaseRecord {
  completed: boolean
  bestTimeMs: number | null
  bestPosition: number | null
}

export type WorldProgress = PhaseRecord[]
export type CupProgress = Record<WorldId, WorldProgress>
export type AllProgress = Record<CupId, CupProgress>

export interface SaveData {
  progress: AllProgress
  customization: [PlayerCustomization, PlayerCustomization]
  gamepadBinding: GamepadBinding
}

function emptyWorld(): WorldProgress {
  return Array.from({ length: PHASES_PER_WORLD }, () => ({
    completed: false,
    bestTimeMs: null,
    bestPosition: null,
  }))
}

function emptyProgress(): AllProgress {
  const out: Partial<AllProgress> = {}
  for (const cup of CUPS) {
    const worlds: Partial<CupProgress> = {}
    for (const w of WORLDS) worlds[w.id] = emptyWorld()
    out[cup.id] = worlds as CupProgress
  }
  return out as AllProgress
}

function defaultSave(): SaveData {
  return {
    progress: emptyProgress(),
    customization: [{ ...DEFAULT_CUSTOMIZATION }, { ...DEFAULT_CUSTOMIZATION }],
    gamepadBinding: { ...DEFAULT_BINDING },
  }
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSave()
    const parsed = JSON.parse(raw) as Partial<SaveData>
    if (!parsed?.progress || !parsed?.customization) return defaultSave()
    // Compat com saves antigos sem gamepadBinding
    if (!parsed.gamepadBinding) parsed.gamepadBinding = { ...DEFAULT_BINDING }
    return parsed as SaveData
  } catch {
    return defaultSave()
  }
}

export function saveAll(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // sem espaço / modo privado — silenciar
  }
}

export function recordPhaseResult(
  data: SaveData,
  cup: CupId,
  world: WorldId,
  phase: number,
  timeMs: number,
  position: number,
): void {
  const rec = data.progress[cup][world][phase]
  rec.completed = rec.completed || position <= 3
  if (rec.bestTimeMs === null || timeMs < rec.bestTimeMs) rec.bestTimeMs = timeMs
  if (rec.bestPosition === null || position < rec.bestPosition) rec.bestPosition = position
  saveAll(data)
}

export function isPhaseUnlocked(
  data: SaveData,
  cup: CupId,
  world: WorldId,
  phase: number,
): boolean {
  if (phase === 0) return true
  return data.progress[cup][world][phase - 1].completed
}
