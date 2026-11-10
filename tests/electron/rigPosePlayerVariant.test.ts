/** A prévia do player mostra e edita a variante `#<player>` dele (SPEC-0722). */
import { describe, expect, it } from 'vitest'
import { PoseStore } from '../../electron/renderer/rigPoseStore.js'
import { parseConfigObject } from '../../electron/renderer/characterRigSelection.js'
import { DEFAULT_GRIP, type Grip } from '../../electron/renderer/characterRigWeapon.js'
import { animOrder, applyKeys, applyTargets, type CharactersConfig } from '../../electron/renderer/characterRigCharacters.js'
import type { Quat } from '../../electron/renderer/characterRigArmSpace.js'

const PATH = 'cfg.json'
const PLAYER = 'LUC-01'
const CHARS: CharactersConfig = { group: 'NPC', glb: 'v.glb', clips: 'v.json', preview: 'p', codes: ['npc-001'] }
const SHOWN = `rifle@ARM-04#${PLAYER}`
const ARM: Quat = [0.1, 0, 0, 0.994987]
const OLD: Quat = [0, 0.2, 0, 0.979796]
const LUCAS: Grip = { offset: [0, 0.08, 0.01], rotation: [0, 0, 0, 1] }

function store(clips: Record<string, unknown> = { rifle: {} }): { s: PoseStore; disk: { text: string } } {
  const disk = { text: JSON.stringify({ code: PLAYER, skinned: { characters: CHARS, clips, weaponGrips: { 'ARM-04': LUCAS } } }) }
  const s = new PoseStore({ read: async () => disk.text, write: async (_p, t) => void (disk.text = t) })
  s.setConfig(PATH, parseConfigObject(disk.text))
  s.player = PLAYER
  return { s, disk }
}

/** O "aplicar a" do player (o que o `RigApplyTo.commit` faz) e o salvar. */
async function save(s: PoseStore, choice: 'everyone' | 'only'): Promise<void> {
  const targets = applyTargets(PLAYER, choice, [], CHARS, PLAYER)
  const { keys, keepGrip } = applyKeys(SHOWN, targets, false, PLAYER, s.hasOwnVariant(SHOWN))
  s.applyEditTo(SHOWN, keys, 'player', PLAYER)
  if (!keys.includes(SHOWN)) s.discardEdit(SHOWN, keepGrip)
  await s.save()
}

/** O quaternion lido da config sai normalizado: compara com tolerância. */
const PRECISION = 5
function expectNear(q: Quat | undefined, want: Quat): void {
  expect(q).toBeDefined()
  q!.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, PRECISION))
}

const clipsOf = (text: string): Record<string, { weapons?: Record<string, unknown>; characters?: Record<string, { weapons?: Record<string, { pose?: unknown }> }> }> =>
  JSON.parse(text).skinned.clips

describe('prévia do player na variante dele (SPEC-0722)', () => {
  it('"Só o player": grava a variante dele e a prévia não volta depois de salvar', async () => {
    const { s, disk } = store()
    s.setPose(SHOWN, new Map([['LeftArm', ARM]]))
    await save(s, 'only')
    expect(clipsOf(disk.text).rifle?.characters?.[PLAYER]?.weapons?.['ARM-04']?.pose).toEqual({ LeftArm: ARM })
    expectNear(s.wanted(SHOWN).get('LeftArm'), ARM)
    expect(s.isUnsaved(SHOWN)).toBe(false)
  })

  it('a pegada editada na chave do player vai para ARMA, nunca ARMA#player', async () => {
    const { s, disk } = store()
    const moved: Grip = { ...LUCAS, offset: [0, 0.1, 0] }
    s.setGrip(SHOWN, moved)
    expect(s.grip(`idle@ARM-04#${PLAYER}`)).toEqual(moved)
    expect(s.isUnsaved(SHOWN)).toBe(true)
    await save(s, 'only')
    expect(JSON.parse(disk.text).skinned.weaponGrips).toEqual({ 'ARM-04': moved })
    expect(s.grip(SHOWN)).toEqual(moved)
  })

  it('"Player e todos" sem variante do player: só a chave sem alvo, nenhuma characters[player]', async () => {
    const { s, disk } = store()
    s.setPose(SHOWN, new Map([['LeftArm', ARM]]))
    s.setGrip(SHOWN, { ...DEFAULT_GRIP, offset: [0, 0.05, 0] })
    await save(s, 'everyone')
    const rifle = clipsOf(disk.text).rifle
    expect(rifle?.weapons?.['ARM-04']).toEqual({ pose: { LeftArm: ARM } })
    expect(rifle?.characters).toBeUndefined()
    expectNear(s.wanted(SHOWN).get('LeftArm'), ARM) // herda da sem alvo
    expect(JSON.parse(disk.text).skinned.weaponGrips['ARM-04'].offset).toEqual([0, 0.05, 0])
  })

  it('"Player e todos" com variante do player salva: as duas recebem', async () => {
    const { s, disk } = store({ rifle: { characters: { [PLAYER]: { weapons: { 'ARM-04': { pose: { LeftArm: OLD } } } } } } })
    expectNear(s.wanted(SHOWN).get('LeftArm'), OLD)
    s.setPose(SHOWN, new Map([['LeftArm', ARM]]))
    await save(s, 'everyone')
    const rifle = clipsOf(disk.text).rifle
    expect(rifle?.weapons?.['ARM-04']).toEqual({ pose: { LeftArm: ARM } })
    expect(rifle?.characters?.[PLAYER]?.weapons?.['ARM-04']?.pose).toEqual({ LeftArm: ARM })
    expectNear(s.wanted(SHOWN).get('LeftArm'), ARM)
  })

  it('animação: a do player antes da da arma e da base, na ordem do jogo; NPC como antes', () => {
    expect(animOrder('rifle', 'ARM-04', null, 'NPC', PLAYER)).toEqual([SHOWN, `rifle#${PLAYER}`, 'rifle@ARM-04', 'rifle'])
    expect(animOrder('rifle', null, null, 'NPC', PLAYER)).toEqual([`rifle#${PLAYER}`, 'rifle'])
    expect(animOrder('rifle', 'ARM-04', null, null, null)).toEqual(['rifle@ARM-04', 'rifle'])
    expect(animOrder('rifle', 'ARM-04', 'npc-001', 'NPC', PLAYER)).toEqual([
      'rifle@ARM-04#npc-001', 'rifle@ARM-04#NPC', 'rifle#npc-001', 'rifle#NPC', 'rifle@ARM-04', 'rifle',
    ])
  })
})
