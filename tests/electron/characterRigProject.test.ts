import { describe, expect, it } from 'vitest'
import { rigPanelMode } from '../../electron/renderer/characterRigProject.js'

describe('rigPanelMode (SPEC-0704)', () => {
  it('com o prepare-character.sh: as três abas e gerar/revisar', () => {
    expect(rigPanelMode({ hasPipeline: true })).toEqual({ tabs: ['markers', 'animations', 'folder'], canGenerate: true })
  })

  it('só com o GLB publicado: só Animações, sem gerar nem revisar', () => {
    expect(rigPanelMode({ hasPipeline: false })).toEqual({ tabs: ['animations'], canGenerate: false })
  })
})
