import { describe, expect, it } from 'vitest'
import { publicNotes } from '../../.github/scripts/public-notes.mjs'

const REPO = 'BuuhV-Projects/cortex-game-engine'
const URL = `https://github.com/${REPO}`

describe('notas da release pública (SPEC-0740)', () => {
  it('tira o link de commit e deixa o texto da comparação e da issue', () => {
    const notes = [
      `## [1.4.0](${URL}/compare/v1.3.0...v1.4.0) (2026-11-15)`,
      `* **ci:** auto-merge próprio ([4e6403c](${URL}/commit/4e6403c4cabac3af038a449f679bd6b3eecc90b1)), closes [#102](${URL}/issues/102)`,
    ].join('\n')
    expect(publicNotes(notes, REPO)).toBe([
      '## 1.4.0 (2026-11-15)',
      '* **ci:** auto-merge próprio, closes #102',
    ].join('\n'))
  })

  it('não mexe em link de outro repo nem em texto sem link', () => {
    const notes = '* usa [three](https://github.com/mrdoob/three.js) e o hash 4e6403c solto'
    expect(publicNotes(notes, REPO)).toBe(notes)
  })

  it('nenhuma URL do repo privado sobra', () => {
    const notes = `* a ([abc1234](${URL}/commit/abc1234)) b [x](${URL}/pull/7)`
    expect(publicNotes(notes, REPO)).not.toContain(REPO)
  })
})
