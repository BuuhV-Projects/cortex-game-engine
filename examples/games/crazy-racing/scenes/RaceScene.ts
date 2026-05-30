import {
  World, Scene, Renderer, PerspectiveCamera, GameLoop, InputManager, GamepadManager,
  AmbientLight, DirectionalLight, HemisphereLight, Color,
  type Entity,
} from 'cortex-game-engine'

import { CUPS, WORLDS, LAPS_PER_RACE, AI_OPPONENTS,
  CAR_COLORS, CAR_MODELS, WHEEL_TYPES, WHEEL_SIZES,
  type CupId, type WorldId, type PlayerCustomization,
} from '../utils/constants'
import { getTrackLayout } from '../utils/trackLayouts'
import { TrackContext } from '../utils/trackContext'
import { loadSave, recordPhaseResult } from '../utils/save'
import { getGamepadManager, isPadConnected } from '../utils/gamepad'

import { createCar } from '../entities/createCar'
import { createTrackMesh } from '../entities/createTrack'
import { createCity } from '../entities/createCity'
import { createNitroPickup } from '../entities/createNitro'

import { EngineAudio, ensureAudioRunning, setAudioListenerPosition } from '../utils/engineAudio'
import { loadEngineSamples } from '../utils/engineSamples'
import { EngineSoundComponent } from '../components/EngineSoundComponent'
import { EngineAudioSystem } from '../systems/EngineAudioSystem'

import { PlayerInputComponent, type InputSource } from '../components/PlayerInputComponent'
import { AIControllerComponent } from '../components/AIControllerComponent'
import { CameraTargetComponent } from '../components/CameraTargetComponent'
import { RaceProgressComponent } from '../components/RaceProgressComponent'
import { CarComponent } from '../components/CarComponent'
import { TransformComponent } from '../components/TransformComponent'
import { MeshComponent } from '../components/MeshComponent'

import { InputSystem } from '../systems/InputSystem'
import { PlayerControlSystem } from '../systems/PlayerControlSystem'
import { AIControlSystem } from '../systems/AIControlSystem'
import { CarPhysicsSystem } from '../systems/CarPhysicsSystem'
import { MeshSyncSystem } from '../systems/MeshSyncSystem'
import { RaceProgressSystem } from '../systems/RaceProgressSystem'
import { CameraFollowSystem } from '../systems/CameraFollowSystem'
import { WheelSteerSystem } from '../systems/WheelSteerSystem'
import { CarRescueSystem } from '../systems/CarRescueSystem'
import { CarCollisionSystem } from '../systems/CarCollisionSystem'
import { NitroPickupSystem } from '../systems/NitroPickupSystem'

import { mountHud } from '../ui/hudOverlay'
import { showResults } from '../ui/resultScreen'
import { showPause } from '../ui/pauseOverlay'

export interface RaceParams {
  cup: CupId
  world: WorldId
  phase: number
  players: PlayerCustomization[]
}

export type RaceAction = 'retry' | 'next' | 'menu'

export interface RaceOutcome {
  action: RaceAction
}

/**
 * Roda uma corrida completa e retorna quando o usuário escolhe próxima ação.
 *
 * Split-screen: usa o renderer.renderViewport() do engine (1 canvas, N
 * viewports). Em coop a tela é dividida horizontalmente (P1 esquerda,
 * P2 direita). A convenção do viewport WebGL tem origem no canto
 * inferior-esquerdo do canvas.
 */
export async function runRace(params: RaceParams): Promise<RaceOutcome> {
  const cupProfile = CUPS.find((c) => c.id === params.cup)!
  const worldProfile = WORLDS[params.world]
  const layout = getTrackLayout(params.world, params.phase)
  const track = new TrackContext(layout)
  const playerCount = params.players.length as 1 | 2

  // Pré-carrega samples do motor (cacheados após a primeira corrida)
  const loadingOverlay = showLoadingOverlay('Carregando sons do motor…')
  const engineSamples = await loadEngineSamples()
  loadingOverlay.remove()

  document.body.classList.toggle('coop', playerCount === 2)

  // ─── Canvas + Renderer (1 só) ─────────────────────────────────────────────
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const renderer = new Renderer({
    canvas,
    width: window.innerWidth,
    height: window.innerHeight,
  })

  const cameras: PerspectiveCamera[] = []
  for (let i = 0; i < playerCount; i++) {
    const aspect = playerCount === 1
      ? window.innerWidth / window.innerHeight
      : (window.innerWidth / 2) / window.innerHeight
    cameras.push(new PerspectiveCamera(70, aspect, 0.1, 800))
  }

  const onResize = () => {
    renderer.resize(window.innerWidth, window.innerHeight)
    const aspect = playerCount === 1
      ? window.innerWidth / window.innerHeight
      : (window.innerWidth / 2) / window.innerHeight
    cameras.forEach((c) => { c.aspect = aspect; c.updateProjectionMatrix() })
  }
  window.addEventListener('resize', onResize)

  // ─── Cena Three ───────────────────────────────────────────────────────────
  const scene = new Scene()
  scene.getThreeScene().background = new Color(worldProfile.skyColor)
  scene.add(new AmbientLight(0xffffff, 0.5))
  scene.add(new HemisphereLight(worldProfile.skyColor, worldProfile.groundColor, 0.4))
  const dir = new DirectionalLight(0xffffff, 0.9)
  dir.position.set(40, 80, 30)
  scene.add(dir)

  const trackGroup = createTrackMesh(scene, layout, worldProfile)
  const cityGroup = createCity(scene, track, worldProfile, params.world * 100 + params.phase * 7 + 1)

  // ─── World / Systems ──────────────────────────────────────────────────────
  const world = new World()

  // Pickups de nitro: 1 a cada ~waypoints/6, intercalando lado da pista
  const nitroEntities: Entity[] = []
  const wps = layout.waypoints
  const nitroEvery = Math.max(6, Math.floor(wps.length / 6))
  for (let i = 0; i < wps.length; i += nitroEvery) {
    const a = wps[i]
    const b = wps[(i + 1) % wps.length]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz =  dx / len
    const side = (i / nitroEvery) % 2 === 0 ? 1 : -1
    const offset = layout.width * 0.25
    nitroEntities.push(createNitroPickup(
      world, scene,
      a.x + nx * side * offset,
      a.y,
      a.z + nz * side * offset,
    ))
  }
  const input = new InputManager()
  input.attach(document.body)
  const gamepads: GamepadManager = getGamepadManager()

  const savedBinding = loadSave().gamepadBinding
  world.addSystem(new InputSystem(input, gamepads, savedBinding))
  world.addSystem(new PlayerControlSystem())
  world.addSystem(new AIControlSystem(track))
  world.addSystem(new NitroPickupSystem(world))
  world.addSystem(new CarPhysicsSystem(track))
  world.addSystem(new CarCollisionSystem())
  world.addSystem(new CarRescueSystem(track))
  world.addSystem(new RaceProgressSystem(track, LAPS_PER_RACE))
  world.addSystem(new WheelSteerSystem())
  world.addSystem(new MeshSyncSystem())
  world.addSystem(new CameraFollowSystem(cameras))
  world.addSystem(new EngineAudioSystem())

  // Web Audio precisa de user-gesture pra começar — botões anteriores já
  // foram clicados, mas garante.
  ensureAudioRunning()

  // ─── Spawn dos carros ─────────────────────────────────────────────────────
  const gridSlots = makeGridSlots(track, AI_OPPONENTS + playerCount)

  const playerEntities: Entity[] = []
  const allCars: Entity[] = []

  const audioEmitters: EngineAudio[] = []
  for (let i = 0; i < playerCount; i++) {
    const slot = gridSlots[i]
    const entity = createCar(world, scene, {
      x: slot.x, z: slot.z, yaw: slot.yaw,
      customization: params.players[i],
      cup: cupProfile,
    })
    entity.getComponent(TransformComponent)!.y = slot.y
    entity.addComponent(new PlayerInputComponent(i as 0 | 1, sourceFor(i, playerCount)))
    entity.addComponent(new CameraTargetComponent(i as 0 | 1))
    entity.addComponent(new RaceProgressComponent(`Jogador ${i + 1}`))
    // Som do meu carro: não-posicional, volume um pouco maior pra ficar audível
    const playerAudio = new EngineAudio({
      samples: engineSamples,
      positional: false,
      master: 0.32,
    })
    entity.addComponent(new EngineSoundComponent(playerAudio))
    audioEmitters.push(playerAudio)
    playerEntities.push(entity)
    allCars.push(entity)
  }
  for (let i = 0; i < AI_OPPONENTS; i++) {
    const slot = gridSlots[playerCount + i]
    const aiCustom = randomCustomization(i)
    const entity = createCar(world, scene, {
      x: slot.x, z: slot.z, yaw: slot.yaw,
      customization: aiCustom,
      cup: cupProfile,
      isAI: true,
    })
    entity.getComponent(TransformComponent)!.y = slot.y
    const ai = new AIControllerComponent()
    ai.lateralOffset = (i - (AI_OPPONENTS - 1) / 2) * 1.2
    ai.targetWaypoint = 1
    entity.addComponent(ai)
    entity.addComponent(new RaceProgressComponent(`Bot ${i + 1}`))
    // Som de AI: posicional 3D, atenua com distância do listener
    const aiAudio = new EngineAudio({
      samples: engineSamples,
      positional: true,
      master: 0.18,
    })
    entity.addComponent(new EngineSoundComponent(aiAudio))
    audioEmitters.push(aiAudio)
    allCars.push(entity)
  }

  // ─── HUD + countdown ──────────────────────────────────────────────────────
  const hud = mountHud(playerCount)

  let racing = false
  const lockSpeeds = () => {
    for (const e of allCars) e.getComponent(CarComponent)!.speed = 0
  }
  for (const e of allCars) e.getComponent(CarComponent)!.speed = 0

  const countdownPromise = (async () => {
    for (const t of ['3', '2', '1', 'GO!']) {
      hud.showCountdown(t)
      await sleep(700)
    }
    hud.hideCountdown()
    const now = performance.now()
    for (const e of allCars) {
      const rp = e.getComponent(RaceProgressComponent)!
      rp.raceStartMs = now
      rp.lapStartMs = now
    }
    racing = true
  })()

  // ─── Loop + pause ─────────────────────────────────────────────────────────
  let raceDone = false
  let pauseShowing = false
  let lastPauseHit = false
  let pauseExitAction: RaceAction | null = null

  const loop = new GameLoop({
    onUpdate(deltaTime) {
      world.tick(deltaTime)
      if (!racing) lockSpeeds()

      // Renderiza viewports via API nativa do engine (1 canvas, N viewports)
      const threeScene = scene.getThreeScene()
      renderer.clear()
      const W = renderer.width
      const H = renderer.height
      if (playerCount === 1) {
        renderer.renderViewport(threeScene, cameras[0], { x: 0, y: 0, width: W, height: H })
      } else {
        const half = Math.floor(W / 2)
        // WebGL: origem no canto inferior-esquerdo
        renderer.renderViewport(threeScene, cameras[0], { x: 0,    y: 0, width: half,    height: H })
        renderer.renderViewport(threeScene, cameras[1], { x: half, y: 0, width: W - half, height: H })
      }

      // Listener do áudio acompanha a câmera do P1 (atenuação 3D dos AI)
      setAudioListenerPosition(cameras[0].position.x, cameras[0].position.y, cameras[0].position.z)

      hud.update(playerEntities, LAPS_PER_RACE)
      hud.drawMinimaps({ layout, allCars, playerEntities })

      if (racing && !raceDone) {
        const allDone = playerEntities.every((e) =>
          e.getComponent(RaceProgressComponent)!.finished)
        if (allDone) raceDone = true
      }

      // Detecta borda do botão de pause de qualquer player
      if (racing && !raceDone && !pauseShowing) {
        const anyPause = playerEntities.some((e) =>
          e.getComponent(PlayerInputComponent)!.pause)
        if (anyPause && !lastPauseHit) {
          pauseShowing = true
          lastPauseHit = true   // exige soltar antes de re-acionar após o resume
          loop.pause()
          for (const a of audioEmitters) a.setMute(true)
          showPause().then((action) => {
            pauseShowing = false
            if (action === 'resume') {
              for (const a of audioEmitters) a.setMute(false)
              loop.resume()
            } else if (action === 'restart') {
              pauseExitAction = 'retry'
            } else {
              pauseExitAction = 'menu'
            }
          })
        }
        lastPauseHit = anyPause
      }
    },
  })
  loop.start()

  await countdownPromise
  await waitFor(() => raceDone || pauseExitAction !== null)

  // Se saiu pelo pause, pula o resultado
  if (pauseExitAction !== null) {
    loop.stop()
    for (const a of audioEmitters) a.stop()
    cleanup()
    return { action: pauseExitAction }
  }

  await sleep(600)
  loop.stop()
  // Para o som de motor com fade ANTES de mostrar o resultado — caso
  // contrário o EngineAudioSystem fica congelado e os gains continuam
  // tocando no último valor enquanto o overlay está visível.
  for (const a of audioEmitters) a.stop()

  // ─── Salva resultado ──────────────────────────────────────────────────────
  const save = loadSave()
  playerEntities.forEach((e) => {
    const rp = e.getComponent(RaceProgressComponent)!
    if (rp.finishTimeMs !== null) {
      recordPhaseResult(save, params.cup, params.world, params.phase, rp.finishTimeMs, rp.position)
    }
  })

  const result = await showResults(allCars, playerEntities)
  cleanup()
  return { action: result.action }

  function cleanup() {
    hud.destroy()
    window.removeEventListener('resize', onResize)
    input.detach()
    renderer.dispose()
    scene.remove(trackGroup)
    scene.remove(cityGroup)
    for (const nitro of nitroEntities) {
      const mc = nitro.getComponent(MeshComponent)
      if (mc) scene.remove(mc.object)
      world.destroyEntity(nitro)
    }
    scene.clear()
    for (const a of audioEmitters) a.dispose()
    document.body.classList.remove('coop')
  }
}

function sourceFor(i: number, playerCount: 1 | 2): InputSource {
  // Joystick prioritário: pad N pro player N.
  if (isPadConnected(i)) return { kind: 'gamepad', slot: i }
  // Solo: aceita setas + WASD (permissivo).
  if (playerCount === 1) return { kind: 'keyboard', layout: 'either' }
  // Coop: P1 = WASD, P2 = setas (cada um strict, sem vazamento).
  return i === 0
    ? { kind: 'keyboard', layout: 'wasd' }
    : { kind: 'keyboard', layout: 'arrows' }
}

interface GridSlot { x: number; y: number; z: number; yaw: number }

/**
 * Distribui carros ATRÁS da linha de chegada acompanhando a pista — usa
 * waypoints anteriores ao 0 (que é a linha de chegada) pra garantir que
 * todos comecem no asfalto mesmo em pistas que curvam imediatamente.
 *
 * 2 carros por "fileira" (esquerda/direita do centro da pista) e fileiras
 * vão se afastando um waypoint por vez.
 */
function makeGridSlots(track: TrackContext, n: number): GridSlot[] {
  const slots: GridSlot[] = []
  const layout = track.layout
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 2)
    const col = i % 2 === 0 ? -1 : 1
    // Fileira `row` fica no segmento que termina em waypoint -row
    // (-1 = segmento imediatamente antes da linha de chegada)
    const aIdx = -(row + 1)
    const a = track.wp(aIdx)
    const b = track.wp(aIdx + 1)
    const dx = b.x - a.x
    const dz = b.z - a.z
    const segLen = Math.hypot(dx, dz) || 1
    const tangentX = dx / segLen
    const tangentZ = dz / segLen
    const rightX =  tangentZ
    const rightZ = -tangentX
    // Centro do segmento + offset lateral
    const cx = (a.x + b.x) / 2
    const cz = (a.z + b.z) / 2
    const cy = (a.y + b.y) / 2
    const lateral = layout.width * 0.25
    slots.push({
      x: cx + rightX * col * lateral,
      y: cy + 0.1,
      z: cz + rightZ * col * lateral,
      yaw: Math.atan2(dx, dz),
    })
  }
  return slots
}

function randomCustomization(seed: number): PlayerCustomization {
  return {
    carModel: CAR_MODELS[seed % CAR_MODELS.length],
    color: CAR_COLORS[(seed * 3) % CAR_COLORS.length],
    wheelType: WHEEL_TYPES[seed % WHEEL_TYPES.length],
    wheelSize: WHEEL_SIZES[(seed + 1) % WHEEL_SIZES.length],
  }
}

function showLoadingOverlay(text: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'overlay'
  el.style.background = 'rgba(16,20,28,.92)'
  el.innerHTML = `<h1>${text}</h1><p>Aguarde…</p>`
  document.body.appendChild(el)
  return el
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function waitFor(pred: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (pred()) resolve()
      else requestAnimationFrame(tick)
    }
    tick()
  })
}
