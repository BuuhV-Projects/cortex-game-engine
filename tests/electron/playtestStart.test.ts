/**
 * Playtest pelo caminho do usuário e sondas numéricas (SPEC-0277): a URL só
 * leva `?play=1` no início direto em jogo, playtest só de números não manda
 * imagem, e a sonda vira uma linha curta de texto.
 */
import { describe, it, expect, vi } from 'vitest'

// runAndCapture importa `electron` (BrowserWindow) no topo — mock vazio basta.
vi.mock('electron', () => ({ BrowserWindow: vi.fn() }))

import { buildGameUrl, formatProbe, needsFinalScreenshot } from '../../electron/agent/playtest/runAndCapture.js'

describe('playtest: início, foto final e sondas', () => {
  it('início editor carrega a URL crua; play acrescenta ?play=1', () => {
    expect(buildGameUrl('http://localhost:5180/', 'editor')).toBe('http://localhost:5180/')
    expect(buildGameUrl('http://localhost:5180/', 'play')).toBe('http://localhost:5180/?play=1')
    expect(buildGameUrl('http://localhost:5180/?a=1', 'play')).toBe('http://localhost:5180/?a=1&play=1')
  })

  it('foto final só quando a timeline não pede foto nem sonda', () => {
    expect(needsFinalScreenshot([])).toBe(true)
    expect(needsFinalScreenshot([{ type: 'wait', ms: 100 }])).toBe(true)
    expect(needsFinalScreenshot([{ type: 'screenshot' }])).toBe(false)
    expect(needsFinalScreenshot([{ type: 'probe', js: '1' }])).toBe(false)
  })

  it('sonda vira texto com rótulo, instante e JSON capado', () => {
    expect(formatProbe('kart-y', 1500, 12.03)).toBe('[probe kart-y @ 1500ms] 12.03')
    expect(formatProbe('#1', 0, [1, 2, 3])).toBe('[probe #1 @ 0ms] [1,2,3]')
    expect(formatProbe('nada', 0, undefined)).toBe('[probe nada @ 0ms] undefined')
    const long = formatProbe('grande', 0, 'x'.repeat(5000))
    expect(long.length).toBeLessThan(2100)
    expect(long).toContain('(cortado)')
  })
})
