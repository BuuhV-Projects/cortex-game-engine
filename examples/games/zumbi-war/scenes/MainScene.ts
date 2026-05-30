import {
  World,
  Scene,
  Renderer,
  PerspectiveCamera,
  AssetLoader,
  AudioManager,
  InputManager,
  GamepadManager,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Color,
  type Entity,
  type Group,
  type AnimationClip,
} from 'cortex-game-engine'
import { createCity } from '../entities/createCity'
import { createPlayer, type PlayerAssets } from '../entities/createPlayer'
import { createGameSession } from '../entities/createGameSession'
import { PlayerComponent } from '../components/PlayerComponent'
import { ZombieComponent } from '../components/ZombieComponent'
import { GameStateComponent } from '../components/GameStateComponent'
import { HealthComponent } from '../components/HealthComponent'
import { WeaponComponent } from '../components/WeaponComponent'
import { InputSystem } from '../systems/InputSystem'
import { SessionInputSystem } from '../systems/SessionInputSystem'
import { PlayerMovementSystem } from '../systems/PlayerMovementSystem'
import { ZombiePursueSystem } from '../systems/ZombiePursueSystem'
import { WeaponSystem } from '../systems/WeaponSystem'
import { BulletSystem } from '../systems/BulletSystem'
import { DamageSystem } from '../systems/DamageSystem'
import { WaveSystem } from '../systems/WaveSystem'
import { CameraFollowSystem } from '../systems/CameraFollowSystem'
import { MeshHitFlashSystem } from '../systems/MeshHitFlashSystem'
import { AnimationSystem } from '../systems/AnimationSystem'
import { AmbientSoundSystem } from '../systems/AmbientSoundSystem'
import { AutoSaveSystem } from '../systems/AutoSaveSystem'
import { HUDSystem } from '../systems/HUDSystem'
import type { ZombieAssets } from '../entities/createZombie'
import type { KeyBindings } from '../utils/keyBindings'
import type { SaveSnapshot } from '../utils/save'
import { clearSave } from '../utils/save'
import { Sfx } from '../utils/sfx'
import { resetGame } from '../utils/resetGame'

export interface MainSceneHandle {
  world: World
  scene: Scene
  renderer: Renderer
  camera: PerspectiveCamera
  getSession(): GameStateComponent
}

export interface MainSceneOptions {
  bindings: KeyBindings
  save?: SaveSnapshot
  /** Chamado quando o jogador pede pra sair pro menu. */
  onExitToMenu: () => void
}

export async function setupMainScene(
  canvas: HTMLCanvasElement,
  hud: ReturnType<typeof buildHud>,
  opts: MainSceneOptions,
): Promise<MainSceneHandle> {
  const scene = new Scene()
  const renderer = new Renderer({
    canvas,
    width: window.innerWidth,
    height: window.innerHeight,
    antialias: true,
  })
  const camera = new PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    400,
  )
  camera.position.set(0, 6, 8)

  const threeScene = scene.getThreeScene()
  threeScene.background = new Color(0x0a0c12)

  scene.add(new HemisphereLight(0x556677, 0x1a1813, 0.55))
  scene.add(new AmbientLight(0x556677, 0.55))
  const moon = new DirectionalLight(0xb8c8e0, 0.9)
  moon.position.set(-10, 18, 6)
  scene.add(moon)
  const fill = new DirectionalLight(0x8090a0, 0.35)
  fill.position.set(8, 10, -4)
  scene.add(fill)

  createCity(scene)

  const audioMgr = new AudioManager()
  camera.add(audioMgr.listener)
  audioMgr.setMasterVolume(0.85)

  const loader = new AssetLoader()
  const sfx = new Sfx(audioMgr)
  await Promise.all([
    sfx.loadOneShot(loader, 'rifle', './assets/sounds/rifle.mp3', 6),
    sfx.loadOneShot(loader, 'swoosh', './assets/sounds/fire-swoosh.mp3', 4),
    sfx.loadOneShot(loader, 'thunder', './assets/sounds/thunder.mp3', 2),
    sfx.playLoop(loader, 'rain', './assets/sounds/rain.mp3', 0.25),
  ])

  const playerAssets = await loadPlayerAssets(loader)
  const zombieAssets = await loadZombieAssets(loader)

  const world = new World()
  const sessionEntity = createGameSession(world)
  const player = createPlayer(world, scene, playerAssets)

  if (opts.save) {
    const gs = sessionEntity.getComponent(GameStateComponent)!
    gs.wave = opts.save.completedWave
    gs.killsTotal = opts.save.killsTotal
    gs.intermissionTimer = 2.5
    const hp = player.getComponent(HealthComponent)
    if (hp) hp.current = opts.save.hp
    const w = player.getComponent(WeaponComponent)
    if (w) {
      w.ammo = opts.save.ammo
      w.reserve = opts.save.reserve
    }
  }

  const getPlayer = (): Entity | null =>
    world.query(PlayerComponent)[0] ?? null
  const getZombies = (): Entity[] => world.query(ZombieComponent)
  const getSession = (): GameStateComponent =>
    sessionEntity.getComponent(GameStateComponent)!

  const inputMgr = new InputManager()
  inputMgr.attach(canvas)
  canvas.tabIndex = 0
  canvas.focus()
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  // Deadzone do engine só pra ruído elétrico — a deadzone real (radial)
  // é feita no InputSystem em cima dos dois eixos do stick juntos.
  const gamepadMgr = new GamepadManager({ deadzone: 0.08 })

  const bindingsRef = { current: opts.bindings }
  const phase = () => getSession()

  const sessionCallbacks = {
    onRestart: () => {
      // Restart = começa de zero. Apaga save (representava progresso
      // da run anterior, que agora foi resetada).
      clearSave()
      resetGame(world, scene, getSession(), getPlayer)
    },
    onExitToMenu: opts.onExitToMenu,
  }

  world.addSystem(new SessionInputSystem(inputMgr, gamepadMgr, bindingsRef, sessionCallbacks))
  world.addSystem(new InputSystem(inputMgr, gamepadMgr, bindingsRef, phase))
  world.addSystem(new WaveSystem(world, scene, getPlayer, () => zombieAssets))
  world.addSystem(new PlayerMovementSystem(phase))
  world.addSystem(new ZombiePursueSystem(getPlayer, phase))
  world.addSystem(new WeaponSystem(world, scene, sfx, phase))
  world.addSystem(new BulletSystem(world, scene, getZombies, phase))
  world.addSystem(new DamageSystem(world, scene, getPlayer, () => getSession(), sfx))
  world.addSystem(new MeshHitFlashSystem())
  world.addSystem(new AnimationSystem(phase))
  world.addSystem(new CameraFollowSystem(camera))
  world.addSystem(new AmbientSoundSystem(sfx))
  world.addSystem(new AutoSaveSystem(getPlayer))
  world.addSystem(new HUDSystem(hud, getPlayer))

  void player

  return { world, scene, renderer, camera, getSession }
}

async function loadFirstClip(
  loader: AssetLoader,
  url: string,
): Promise<AnimationClip | undefined> {
  try {
    const g = await loader.loadFBX(url)
    return g.animations[0]
  } catch (e) {
    console.warn(`[cidade-abandonada] falha carregando ${url}`, e)
    return undefined
  }
}

async function loadPlayerAssets(loader: AssetLoader): Promise<PlayerAssets | null> {
  let model: Group
  try {
    model = await loader.loadFBX('./assets/models/soldier/soldier.fbx')
  } catch (e) {
    console.warn('[cidade-abandonada] falha carregando soldier.fbx, usando placeholder', e)
    return null
  }
  const [idle, walk, run, fire, death] = await Promise.all([
    loadFirstClip(loader, './assets/models/soldier/Rifle Idle.fbx'),
    loadFirstClip(loader, './assets/models/soldier/Rifle Walk.fbx'),
    loadFirstClip(loader, './assets/models/soldier/Rifle Run.fbx'),
    loadFirstClip(loader, './assets/models/soldier/Firing Rifle.fbx'),
    loadFirstClip(loader, './assets/models/soldier/Rifle Death.fbx'),
  ])
  return { model, clips: { idle, walk, run, fire, death } }
}

async function loadZombieAssets(loader: AssetLoader): Promise<ZombieAssets | null> {
  let template: Group
  try {
    template = await loader.loadFBX('./assets/models/zombie/zombie-cop.fbx')
  } catch (e) {
    console.warn('[cidade-abandonada] falha carregando zombie-cop.fbx, usando placeholder', e)
    return null
  }
  const [idle, walk, run, attack, death] = await Promise.all([
    loadFirstClip(loader, './assets/models/zombie/Zombie Idle.fbx'),
    loadFirstClip(loader, './assets/models/zombie/Zombie Walk.fbx'),
    loadFirstClip(loader, './assets/models/zombie/Zombie Running.fbx'),
    loadFirstClip(loader, './assets/models/zombie/Zombie Attack.fbx'),
    loadFirstClip(loader, './assets/models/zombie/Zombie Death.fbx'),
  ])
  return { template, clips: { idle, walk, run, attack, death } }
}

export function buildHud(): {
  hp: HTMLElement
  hpBar: HTMLElement
  ammo: HTMLElement
  wave: HTMLElement
  kills: HTMLElement
  gamepad: HTMLElement
  overlay: HTMLElement
  overlayTitle: HTMLElement
  overlaySub: HTMLElement
} {
  const css = document.createElement('style')
  css.textContent = `
    body { margin: 0; background: #000; color: #eee; font-family: system-ui, sans-serif; overflow: hidden; cursor: crosshair; }
    canvas { display: block; outline: none; }
    .hud { position: fixed; pointer-events: none; user-select: none; text-shadow: 0 1px 3px #000; }
    .hud.tl { top: 18px; left: 18px; min-width: 240px; }
    .hud.tr { top: 18px; right: 18px; text-align: right; }
    .hud.br { bottom: 18px; right: 22px; text-align: right; font-size: 13px; opacity: .85; }
    .hp-wrap { background: #1a1a1a; border: 1px solid #333; height: 14px; width: 220px; margin-top: 6px; }
    .hp-bar { background: #5cd66a; height: 100%; transition: width .15s linear, background .2s linear; }
    .label { font-size: 11px; letter-spacing: 1px; color: #888; text-transform: uppercase; }
    .big { font-size: 26px; font-weight: 700; }
    .overlay {
      position: fixed; inset: 0; display: none; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px;
      background: rgba(0,0,0,.55); color: #fff;
      text-align: center; pointer-events: none;
    }
    .overlay h1 { font-size: 48px; margin: 0; letter-spacing: 3px; }
    .overlay p { font-size: 18px; opacity: .85; margin: 0; }
    .crosshair {
      position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
      width: 16px; height: 16px; border: 2px solid #ffe27a; border-radius: 50%;
      box-shadow: 0 0 8px rgba(255,200,80,.5);
      pointer-events: none;
    }
  `
  document.head.appendChild(css)

  const tl = document.createElement('div')
  tl.className = 'hud tl'
  tl.innerHTML = `
    <div class="label">vida</div>
    <div class="big" id="hp">100 / 100</div>
    <div class="hp-wrap"><div class="hp-bar" id="hpBar" style="width:100%"></div></div>
    <div class="label" style="margin-top:14px">arma  •  rifle</div>
    <div class="big" id="ammo">30 / 120</div>
  `
  document.body.appendChild(tl)

  const tr = document.createElement('div')
  tr.className = 'hud tr'
  tr.innerHTML = `
    <div class="label">wave</div>
    <div class="big" id="wave">—</div>
    <div class="label" style="margin-top:14px">kills</div>
    <div class="big" id="kills">0</div>
  `
  document.body.appendChild(tr)

  const br = document.createElement('div')
  br.className = 'hud br'
  br.innerHTML = `
    <div id="gamepad">gamepad: teclado</div>
    <div style="margin-top:6px;opacity:.6">mouse mirar • click atirar • controles em Menu → Configurar</div>
    <div style="opacity:.6">LS: andar/girar  •  RS: virar  •  RT atira  •  LB corre  •  X recarrega  •  Start pausa</div>
  `
  document.body.appendChild(br)

  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `<h1 id="overlayTitle">CIDADE ABANDONADA</h1><p id="overlaySub">carregando…</p>`
  document.body.appendChild(overlay)

  const crosshair = document.createElement('div')
  crosshair.className = 'crosshair'
  document.body.appendChild(crosshair)

  return {
    hp: document.getElementById('hp')!,
    hpBar: document.getElementById('hpBar')!,
    ammo: document.getElementById('ammo')!,
    wave: document.getElementById('wave')!,
    kills: document.getElementById('kills')!,
    gamepad: document.getElementById('gamepad')!,
    overlay,
    overlayTitle: document.getElementById('overlayTitle')!,
    overlaySub: document.getElementById('overlaySub')!,
  }
}
