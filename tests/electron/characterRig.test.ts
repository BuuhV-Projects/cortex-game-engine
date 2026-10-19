/**
 * Lógica pura do painel character-auto-rig (SPEC-0349): espaço exibido ↔ gltf,
 * simetria, estimativa, validação, contrato do `.markers.json`.
 */

import { describe, it, expect } from 'vitest'
import {
  MARKER_IDS,
  MARKER_GROUPS,
  centeringOffset,
  configRelPath,
  displayToGltf,
  estimateMarkers,
  gltfToDisplay,
  helperLines,
  isCharacterConfigName,
  isCharacterConfigPath,
  markersPathFor,
  mirrorId,
  moveMarker,
  parseCharacterConfig,
  parseMarkersFile,
  previewSheetPath,
  rigOutcome,
  rotateY,
  sameSource,
  serializeMarkersFile,
  stripAnsi,
  symmetrize,
  validateMarkers,
  type MarkerId,
  type Vec3,
} from '../../electron/renderer/characterRig.js'

const close = (a: Vec3, b: Vec3, eps = 1e-9): void => {
  for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(eps)
}

describe('rotação de exibição', () => {
  it('Ry(+90°) leva +X para −Z e +Z para +X (convenção do three.js)', () => {
    close(rotateY([1, 0, 0], 90), [0, 0, -1])
    close(rotateY([0, 0, 1], 90), [1, 0, 0])
  })

  it('equivale ao Rz(θ) do Blender com o mesmo sinal (blender = (x, −z, y) do gltf)', () => {
    const toBlender = (p: Vec3): Vec3 => [p[0], -p[2], p[1]]
    const rzBlender = (b: Vec3, deg: number): Vec3 => {
      const a = (deg * Math.PI) / 180
      return [b[0] * Math.cos(a) - b[1] * Math.sin(a), b[0] * Math.sin(a) + b[1] * Math.cos(a), b[2]]
    }
    const p: Vec3 = [0.3, 1.2, -0.7]
    for (const deg of [-90, 30, 180]) close(toBlender(rotateY(p, deg)), rzBlender(toBlender(p), deg))
  })

  it('LUC-01 (−90°): o rosto que olha para +X no GLB passa a olhar para +Z (câmera)', () => {
    close(rotateY([1, 0, 0], -90), [0, 0, 1])
  })

  it('gltf → exibido → gltf é identidade (com centralização)', () => {
    const frame = { rotateYDeg: -90, offset: [0.12, 0, -0.05] as Vec3 }
    const p: Vec3 = [0.4, 1.55, -0.2]
    close(displayToGltf(gltfToDisplay(p, frame), frame), p)
  })

  it('a centralização mexe só em x e z', () => {
    close(centeringOffset({ min: [-0.2, 0, -0.1], max: [0.6, 1.8, 0.3] }), [0.2, 0, 0.1])
  })
})

describe('simetria', () => {
  it('pares e lados', () => {
    expect(mirrorId('wristL')).toBe('wristR')
    expect(mirrorId('kneeR')).toBe('kneeL')
    expect(mirrorId('chin')).toBeNull()
  })

  it('mover um lado espelha o outro em x → −x', () => {
    const m = moveMarker({}, 'elbowL', [0.3, 1.2, 0.05], true)
    expect(m.elbowL).toEqual([0.3, 1.2, 0.05])
    expect(m.elbowR).toEqual([-0.3, 1.2, 0.05])
  })

  it('usa a profundidade medida no ponto espelhado quando dada', () => {
    const m = moveMarker({}, 'kneeR', [-0.1, 0.5, 0.02], true, [0.1, 0.5, 0.07])
    expect(m.kneeL).toEqual([0.1, 0.5, 0.07])
  })

  it('centro fica preso em x = 0; sem simetria, nada é espelhado', () => {
    expect(moveMarker({}, 'chin', [0.04, 1.5, 0.1], true).chin).toEqual([0, 1.5, 0.1])
    const m = moveMarker({}, 'wristL', [0.5, 1, 0], false)
    expect(m.wristR).toBeUndefined()
    expect(moveMarker({}, 'chin', [0.04, 1.5, 0.1], false).chin).toEqual([0.04, 1.5, 0.1])
  })

  it('symmetrize: o lado que manda vale para o outro', () => {
    const m = symmetrize({ wristL: [0.5, 1, 0], wristR: [-0.4, 0.9, 0], chin: [0.02, 1.5, 0] }, 'L')
    expect(m.wristR).toEqual([-0.5, 1, 0])
    expect(m.chin).toEqual([0, 1.5, 0])
  })
})

describe('estimativa e validação', () => {
  const aPose = { min: [-0.5, 0, -0.15] as Vec3, max: [0.5, 1.8, 0.15] as Vec3 }
  const tPose = { min: [-0.9, 0, -0.15] as Vec3, max: [0.9, 1.8, 0.15] as Vec3 }

  it('estimativa: L à direita (x > 0), simétrica, e passa na validação (A e T)', () => {
    for (const box of [aPose, tPose]) {
      const m = estimateMarkers(box)
      expect(m.wristL[0]).toBeGreaterThan(0)
      expect(m.wristR[0]).toBeCloseTo(-m.wristL[0])
      expect(m.chin[0]).toBe(0)
      expect(validateMarkers(m, 1.8)).toEqual([])
    }
  })

  it('aponta marcador ausente', () => {
    const m = estimateMarkers(aPose) as Partial<Record<MarkerId, Vec3>>
    delete m.kneeL
    expect(validateMarkers(m, 1.8)).toEqual([{ code: 'missing', ids: ['kneeL'] }])
  })

  it('queixo abaixo da virilha, cotovelo abaixo do punho, joelho acima da virilha', () => {
    const m = estimateMarkers(aPose)
    const bad = { ...m, chin: [0, 0.5, 0] as Vec3, groin: [0, 0.9, 0] as Vec3, elbowR: [-0.3, 0.6, 0] as Vec3, kneeL: [0.1, 1.0, 0] as Vec3 }
    const codes = validateMarkers(bad, 1.8).map((e) => `${e.code}:${e.ids.join(',')}`)
    expect(codes).toContain('chinBelowGroin:chin,groin')
    expect(codes).toContain('elbowBelowWrist:elbowR,wristR')
    expect(codes).toContain('kneeAboveGroin:kneeL,groin')
  })

  it('pose em T: cotovelo na altura do punho é aceito (folga de 2 % da altura)', () => {
    const m = { ...estimateMarkers(tPose), elbowL: [0.4, 1.43, 0] as Vec3, wristL: [0.7, 1.45, 0] as Vec3 }
    expect(validateMarkers(m, 1.8)).toEqual([])
  })

  it('linhas de ajuda: quadril estimado em 0,78·joelho.x na altura da virilha', () => {
    const lines = helperLines({ kneeL: [0.1, 0.5, 0.02], groin: [0, 0.9, 0] })
    expect(lines).toHaveLength(1)
    close(lines[0]!.from, [0.078, 0.9, 0.02])
  })
})

describe('arquivos', () => {
  const luc = `\uFEFF${JSON.stringify({
    code: 'LUC-01',
    source: 'D:/Codex/assets/personagens/lucas-rocha/versao-02/lucas-rocha-base-fosco.glb',
    work: 'D:/Codex/assets/personagens/lucas-rocha/integracao/',
    transform: { rotateZDeg: -90, height: 1.8 },
    skinned: { fbx: 'x' },
  })}`

  it('lê a config (BOM, rotateZDeg, work, skinned)', () => {
    const c = parseCharacterConfig(luc)
    expect(c).toMatchObject({ code: 'LUC-01', rotateZDeg: -90, skinned: true })
    expect(previewSheetPath(c.work!)).toBe('D:/Codex/assets/personagens/lucas-rocha/integracao/skinned/previa/folha.png')
    expect(parseCharacterConfig(JSON.stringify({ code: 'X', source: 'y' }))).toMatchObject({ rotateZDeg: 0, work: null, skinned: false })
    expect(() => parseCharacterConfig('{"code":"X"}')).toThrow(/source/)
  })

  it('reconhece configs de personagem pelo nome e caminho', () => {
    expect(isCharacterConfigName('LUC-01.json')).toBe(true)
    expect(isCharacterConfigName('defaults.json')).toBe(false)
    expect(isCharacterConfigName('LUC-01.markers.json')).toBe(false)
    expect(isCharacterConfigPath('D:\\jogos\\x\\tools\\characters\\LUC-01.json')).toBe(true)
    expect(isCharacterConfigPath('D:/jogos/x/assets/characters/LUC-01.json')).toBe(false)
    expect(markersPathFor('D:/j/tools/characters/LUC-01.json')).toBe('D:/j/tools/characters/LUC-01.markers.json')
    expect(configRelPath('LUC-01.json')).toBe('tools/characters/LUC-01.json')
    expect(sameSource('D:\\A\\b.glb', 'd:/a/B.glb')).toBe(true)
  })

  it('serializa o contrato (ordem, 4 casas, 2 espaços, −0) e lê de volta', () => {
    const markers = {} as Record<MarkerId, Vec3>
    MARKER_IDS.forEach((id, i) => (markers[id] = [-0.00001, i / 3, 0.123456]))
    const text = serializeMarkersFile({ code: 'LUC-01', source: 's.glb', symmetry: true, markers })
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n  "version": 1,')
    const obj = JSON.parse(text)
    expect(Object.keys(obj)).toEqual(['version', 'code', 'source', 'space', 'symmetry', 'markers'])
    expect(Object.keys(obj.markers)).toEqual([...MARKER_IDS])
    expect(obj.markers.groin).toEqual([0, 0.3333, 0.1235])
    expect(Object.is(obj.markers.chin[0], 0)).toBe(true)
    const back = parseMarkersFile(text)
    expect(back.space).toBe('gltf')
    expect(back.markers.kneeR).toEqual(obj.markers.kneeR)
  })

  it('recusa arquivo de marcadores fora do contrato', () => {
    expect(() => parseMarkersFile('{"version":2,"space":"gltf"}')).toThrow(/versão/)
    expect(() => parseMarkersFile('{"version":1,"space":"gltf","markers":{"chin":[0,1]}}')).toThrow(/chin/)
  })
})

describe('execução', () => {
  it('códigos de saída do prepare-character.sh', () => {
    expect([0, 1, 2, 3, 130].map(rigOutcome)).toEqual(['approved', 'rejected', 'infra', 'review', 'unknown'])
  })

  it('tira cores ANSI da saída', () => {
    expect(stripAnsi('\u001b[1;32mok\u001b[0m skin')).toBe('ok skin')
  })

  it('cada grupo tem uma cor distinta', () => {
    expect(new Set(MARKER_GROUPS.map((g) => g.color)).size).toBe(MARKER_GROUPS.length)
  })
})
