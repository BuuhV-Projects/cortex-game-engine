import { z } from 'zod'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { defineTool, textResult, type ToolResult } from '../toolDef.js'
import { callRig } from '../rigBridgeClient.js'

/**
 * Ferramentas do painel "Auto-rig de personagem" do Studio aberto (SPEC-0746): cada uma manda um comando à ponte local
 * (ADR-0747) e devolve a resposta do painel. A pegada é a `weaponGrips[ARMA]` no espaço do osso `RightHand`; o que muda
 * aparece na vista do Studio na hora.
 */

const vec3 = z.tuple([z.number(), z.number(), z.number()])
const JSON_INDENT = 1
/** Pasta padrão das fotos, dentro do projeto. */
const SNAP_DIR = join('.cortex', 'rig')

async function run(cmd: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return textResult(JSON.stringify(await callRig(cmd, args), null, JSON_INDENT))
}

export const rigStateTool = defineTool({
  name: 'rig_state',
  description:
    'Estado do painel Auto-rig do Studio aberto (aba Animações): personagem, arma na mão e as armas, clipe, tempo, ' +
    'a pegada weaponGrips[ARMA] (offsetCm, rotation quaternion e rotationDeg Euler XYZ, no espaço do RightHand), ' +
    'osso selecionado e se há edição não salva.',
  scope: 'global',
  schema: {},
  handler: async () => run('state'),
})

export const rigSetGripTool = defineTool({
  name: 'rig_set_grip',
  description:
    'Põe a pegada da arma mostrada (espaço do osso RightHand): offsetCm [x,y,z] em cm e o giro por rotationDeg ' +
    '(Euler XYZ, graus) ou rotation (quaternion [x,y,z,w]). Campo omitido fica como está. Empilha o desfazer.',
  scope: 'global',
  schema: {
    offsetCm: vec3.optional().describe('Posição do Grip_R no RightHand, cm.'),
    rotationDeg: vec3.optional().describe('Giro da arma, Euler XYZ em graus.'),
    rotation: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('Giro como quaternion [x,y,z,w] (vence rotationDeg).'),
  },
  handler: async (args) => run('setGrip', args),
})

export const rigNudgeGripTool = defineTool({
  name: 'rig_nudge_grip',
  description:
    'Soma à pegada da arma mostrada: moveCm [x,y,z] em cm e rotateDeg [x,y,z] em graus, nos eixos do osso RightHand ' +
    '(Y = os dedos). O giro é em torno do Grip_R. Devolve o estado.',
  scope: 'global',
  schema: {
    moveCm: vec3.optional().describe('Deslocamento em cm.'),
    rotateDeg: vec3.optional().describe('Giro em graus em torno de X, depois Y, depois Z do osso.'),
  },
  handler: async (args) => run('nudgeGrip', args),
})

export const rigSupportHandTool = defineTool({
  name: 'rig_support_hand',
  description: 'O botão "Mão esquerda no apoio": leva a palma esquerda ao Grip_L da arma (IK) e a liga à mão direita.',
  scope: 'global',
  schema: {},
  handler: async () => run('supportHand'),
})

export const rigClipTool = defineTool({
  name: 'rig_clip',
  description:
    'Troca o clipe, a arma na mão e o tempo do painel Auto-rig: name (clipe do build), weapon (código, ex. ARM-04; ' +
    'null = sem arma), time (s, pausa ali) e playing (toca/pausa).',
  scope: 'global',
  schema: {
    name: z.string().optional(),
    weapon: z.string().nullable().optional(),
    time: z.number().min(0).optional(),
    playing: z.boolean().optional(),
  },
  handler: async (args) => run('clip', args),
})

export const rigCameraTool = defineTool({
  name: 'rig_camera',
  description:
    'Põe a câmera da vista 3D do painel: view (front, back, left, right, top, bottom; sem view mantém a direção), ' +
    'focus (osso, ex. RightHand, LeftHand, ou "weapon"; padrão RightHand) e distance (m, padrão 0,6).',
  scope: 'global',
  schema: {
    view: z.enum(['front', 'back', 'left', 'right', 'top', 'bottom']).optional(),
    focus: z.string().optional(),
    distance: z.number().positive().optional(),
  },
  handler: async (args) => run('camera', args),
})

export const rigSnapshotTool = defineTool({
  name: 'rig_snapshot',
  description:
    'Foto PNG da vista 3D do painel Auto-rig como está agora (use rig_camera antes). Salva em file (padrão ' +
    '.cortex/rig/snap-<carimbo>.png no projeto) e devolve o caminho e a imagem.',
  scope: 'project',
  schema: {
    file: z.string().optional().describe('Onde salvar o PNG (absoluto ou relativo ao projeto).'),
  },
  handler: async ({ file }, ctx) => {
    const snap = (await callRig('snapshot')) as { png: string; width: number; height: number }
    const out = file ? (isAbsolute(file) ? file : resolve(ctx.projectRoot, file)) : join(ctx.projectRoot, SNAP_DIR, `snap-${Date.now()}.png`)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, Buffer.from(snap.png, 'base64'))
    return {
      content: [
        { type: 'text', text: `${out} (${snap.width}×${snap.height})` },
        { type: 'image', data: snap.png, mimeType: 'image/png' },
      ],
    }
  },
})

export const rigMeasureTool = defineTool({
  name: 'rig_measure',
  description:
    'Mede cada mão contra a malha da arma mostrada: para a palma e cada osso de dedo, a distância até a malha (cm) ' +
    'e se está dentro dela (inside = atravessando), e o ponto mais perto de cada mão.',
  scope: 'global',
  schema: {},
  handler: async () => run('measure'),
})

export const rigSaveTool = defineTool({
  name: 'rig_save',
  description:
    'Grava: target "pose" = o botão Salvar pose (a config do personagem, tools/characters/<código>.json); "glb" = ' +
    'Gravar no GLB do jogo (assa e grava o GLB e o JSON do skin, sem o diálogo de confirmação).',
  scope: 'global',
  schema: { target: z.enum(['pose', 'glb']) },
  handler: async (args) => run('save', args),
})

export const rigTools = [rigStateTool, rigSetGripTool, rigNudgeGripTool, rigSupportHandTool, rigClipTool, rigCameraTool, rigSnapshotTool, rigMeasureTool, rigSaveTool]
