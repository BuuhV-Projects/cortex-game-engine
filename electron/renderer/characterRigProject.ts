import { debug } from '../../src/core/debug'
import { isCharacterConfigName, markersPathFor, parseCharacterConfig, type CharacterConfig } from './characterRig'
import {
  availableBuilds,
  parseRigRegistry,
  registryPath,
  resolveProjectPath,
  splitPath,
  RIG_REGISTRY_FILE,
  type RigBuildKind,
  type RigEntry,
  type RigRegistry,
} from './characterRigRegistry'

/**
 * Leitura do projeto para o painel character-auto-rig (SPEC-0349): configs de
 * personagem, registro de rigs, builds existentes e se há o pipeline
 * (`tools/prepare-character.sh`). O modo do painel sem pipeline é da SPEC-0704.
 */

const SCOPE = 'characterRig'
/** Script do jogo que gera/publica o rig; sem ele o projeto só tem o GLB publicado (SPEC-0704). */
const PIPELINE_SCRIPT = 'prepare-character.sh'

export type RigTab = 'markers' | 'animations' | 'folder'

export interface ConfigEntry {
  fileName: string
  path: string
  config: CharacterConfig
  /** O `.markers.json` existe (pela listagem): evita ler arquivo ausente (ENOENT no log do main). */
  hasMarkers: boolean
}

export interface RigPanelMode {
  /** Abas visíveis, na ordem; a primeira é a de fallback. */
  tabs: RigTab[]
  /** Gerar rig e a barra de revisão (Aprovar/Recusar/Desfazer). */
  canGenerate: boolean
}

/** Com o pipeline: tudo; só o GLB publicado: só Animações, sem gerar nem revisar (SPEC-0704). */
export function rigPanelMode({ hasPipeline }: { hasPipeline: boolean }): RigPanelMode {
  return hasPipeline
    ? { tabs: ['markers', 'animations', 'folder'], canGenerate: true }
    : { tabs: ['animations'], canGenerate: false }
}

function trimDir(projectDir: string): string {
  return projectDir.replace(/[\\/]+$/, '')
}

/** O projeto tem `tools/prepare-character.sh` (pela listagem de `tools/`). */
export async function hasRigPipeline(projectDir: string): Promise<boolean> {
  try {
    const files = await window.electronAPI.readDir(`${trimDir(projectDir)}/tools`)
    return files.some((f) => !f.isDir && f.name === PIPELINE_SCRIPT)
  } catch (err) {
    // sem `tools/` (ou ilegível): modo só publicado; o log diferencia falha de leitura de pasta ausente
    debug(SCOPE, 'tools/ ilegível: painel sem pipeline', projectDir, err)
    return false
  }
}

/** Configs `tools/characters/*.json` do projeto com a seção `skinned`. */
export async function listCharacterConfigs(projectDir: string): Promise<ConfigEntry[]> {
  const dir = `${trimDir(projectDir)}/tools/characters`
  let files: Array<{ name: string; path: string; isDir: boolean }>
  try {
    files = await window.electronAPI.readDir(dir)
  } catch {
    return []
  }
  const names = new Set(files.map((f) => f.name))
  const out: ConfigEntry[] = []
  for (const f of files) {
    if (f.isDir || !isCharacterConfigName(f.name)) continue
    try {
      const config = parseCharacterConfig(await window.electronAPI.readFile(f.path))
      if (config.skinned) out.push({ fileName: f.name, path: f.path, config, hasMarkers: names.has(markersPathFor(f.name)) })
    } catch (err) {
      debug(SCOPE, 'config ignorada', f.name, err)
    }
  }
  return out.sort((a, b) => a.fileName.localeCompare(b.fileName))
}

/** Lê `tools/characters/rigs.json` (pela listagem: sem ler arquivo ausente). `null` se não há registro. */
export async function loadRigRegistry(projectDir: string): Promise<RigRegistry | null> {
  const path = registryPath(projectDir)
  try {
    const files = await window.electronAPI.readDir(splitPath(path).dir)
    if (!files.some((f) => f.name === RIG_REGISTRY_FILE)) return null
    return parseRigRegistry(await window.electronAPI.readFile(path))
  } catch (err) {
    debug(SCOPE, 'registro de rigs ilegível', path, err)
    return null
  }
}

/** Builds do registro cujo GLB existe (pela listagem da pasta), o mais recente primeiro. */
export async function existingBuilds(projectDir: string, entry: RigEntry): Promise<RigBuildKind[]> {
  const out: RigBuildKind[] = []
  for (const kind of availableBuilds(entry)) {
    const { dir, name } = splitPath(resolveProjectPath(projectDir, entry[kind]!.glb))
    try {
      const files = await window.electronAPI.readDir(dir)
      if (files.some((f) => !f.isDir && f.name.toLowerCase() === name.toLowerCase())) out.push(kind)
    } catch {
      /* pasta ausente: build indisponível */
    }
  }
  return out
}
