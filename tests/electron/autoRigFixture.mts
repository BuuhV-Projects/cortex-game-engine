/**
 * Projeto temporário para os testes do auto-rig do Studio (SPEC-0724): config, fonte, marcadores e scripts falsos.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveRigConfig, type ResolvedRigConfig } from '../../electron/main/autoRig/autoRigConfig.js'

export const CONFIG_REL = 'tools/characters/npc-110.json'

export interface RigFixture {
  dir: string
  scriptsDir: string
  config: ResolvedRigConfig
  cleanup: () => void
}

export const FIXTURE_CONFIG = {
  code: 'npc-110',
  source: 'fontes/npc-110.glb',
  work: '.work/npc-110',
  skinned: { publish: { glb: 'assets/npc/npc-110-skinned.glb', clips: 'assets/npc/npc-110-skinned.json' } },
}

export function makeRigFixture(config: object = FIXTURE_CONFIG): RigFixture {
  const dir = mkdtempSync(join(tmpdir(), 'autorig-'))
  const scriptsDir = join(dir, '_scripts')
  for (const d of [join(dir, 'tools/characters'), join(dir, 'fontes'), scriptsDir]) mkdirSync(d, { recursive: true })
  writeFileSync(join(dir, CONFIG_REL), JSON.stringify(config, null, 1))
  writeFileSync(join(dir, 'fontes/npc-110.glb'), 'glb')
  writeFileSync(join(dir, 'tools/characters/npc-110.markers.json'), '{}')
  writeFileSync(join(scriptsDir, 'autorig_skin.py'), '# skin')
  writeFileSync(join(scriptsDir, 'autorig_preview.py'), '# preview')
  const r = resolveRigConfig(JSON.stringify(config), dir, CONFIG_REL)
  if (!r.ok) throw new Error(r.errors.join())
  return { dir, scriptsDir, config: r.config, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** Escreve o staging que a etapa `skin` deixaria. */
export function writeStaging(f: RigFixture, glb = 'novo', clips = '{"clips":{"walk":{"duration":1.5}}}'): void {
  const dir = join(f.config.work, 'staging')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'npc-110-skinned.glb'), glb)
  writeFileSync(join(dir, 'npc-110-skinned.json'), clips)
}
