// EXEMPLO de probe de performance (skill validar-performance): mede a fase 2 do
// crash-bandicoot-racer no host nativo. Os imports apontam para o jogo em D:/jogos —
// adapte para o jogo medido. Interruptores via -Candidate; ver run.ps1.
import { Game, AssetLoader, PostFX, AgXToneMapping, setDebug } from 'cortex-game-engine'
import { loadLevel } from 'D:/jogos/crash-bandicoot-racer/scenes/loadLevel'
import { LEVELS } from 'D:/jogos/crash-bandicoot-racer/scenes/levelCatalog'
import { CarComponent } from 'D:/jogos/crash-bandicoot-racer/components/CarComponent'
import { RaceComponent } from 'D:/jogos/crash-bandicoot-racer/components/RaceComponent'
import { prewarmPipelines } from 'D:/jogos/crash-bandicoot-racer/utils/prewarmPipelines'
import referenceCircuit from 'D:/jogos/crash-bandicoot-racer/scenes/reference-circuit.json'
import manifest from 'D:/jogos/crash-bandicoot-racer/assets/reference-circuit/mapa.manifest.json'
import referenceCompetitors from 'D:/jogos/crash-bandicoot-racer/scenes/reference-competitors.json'

// Cada execução usa o mesmo conteúdo e um relógio de simulação independente do FPS.
const options = new URLSearchParams(location.search)
const probeLevel = Number(options.get('probeLevel') || 0)
const diagnostic = options.get('diagnostic') === '1'
const movingCamera = options.get('movingCamera') === '1'
const candidate = options.get('candidate') || 'legacy'
const dynamicGameplay = options.get('dynamicGameplay') === '1'
const totalFrames = Number(options.get('frames') || 330)
const aiPlayer = options.get('aiPlayer') === '1'
if (candidate === 'dbgshadow') setDebug('perf,scene')
const TERRAIN_ASSETS = new Set(['19-curva-s', '34-curva-encosta', '33-base-ilha', '11-paredao-calcario'])
const warmupFrames = 90
globalThis.location.search = probeLevel > 0 ? `?cortexHud=1&renderPhases=${probeLevel}&systemProfile=1` : '?systemProfile=1'
let randomState = 123456789
Math.random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
  return randomState / 4294967296
}
// Instrumentação por frame dos picos: transcode KTX2, cargas de GLB, GC e streaming.
const spikeProbe = { txMs: 0, txN: 0, gltfStart: 0, gltfEnd: 0, gltfMs: 0 }
const transcode = (globalThis as any).__cortexTranscodeKtx2
if (transcode) (globalThis as any).__cortexTranscodeKtx2 = (bytes: Uint8Array) => {
  const t0 = performance.now(); try { return transcode(bytes) } finally { spikeProbe.txMs += performance.now() - t0; spikeProbe.txN++ }
}
const loadGLTF = AssetLoader.prototype.loadGLTF
AssetLoader.prototype.loadGLTF = async function (url: string) {
  spikeProbe.gltfStart++
  try { return await loadGLTF.call(this, url) } finally { spikeProbe.gltfEnd++ }
}
const game = new Game({ canvas: document.getElementById('canvas') as HTMLCanvasElement, far: 1500 })
game.maxFps = 0
game.setLoading(true)
game.start()
const started = performance.now()
const level = LEVELS.find(level => level.id === 'reference-circuit')!
// Variante de sombra aplicada ao dado da cena antes do load (o jogo não é alterado).
const lighting = (referenceCircuit as any).outdoorLighting
if (candidate === 'csm') Object.assign(lighting, { csm: true, shadowCascades: 3, shadowDistance: 220, lightMargin: 240 })
if (candidate === 'off') lighting.shadows = false
const rivals = (referenceCompetitors as any).nodes
if (candidate === 'rivalnoshadow') for (const node of rivals) node.castShadow = false
if (candidate === 'norivals') (referenceCompetitors as any).nodes = []
console.log('[binding-probe] SWITCH', candidate, 'rivais', rivals.length, 'sem sombra', rivals.filter((n: any) => n.castShadow === false).length, 'restantes', (referenceCompetitors as any).nodes.length)
if (candidate === 'combo') Object.assign(lighting, { shadowCascades: 2, shadowDistance: 120, shadowCasterMinRatio: 0.1 })
if (candidate === 'c2') lighting.shadowCascades = 2
if (candidate === 'd120') lighting.shadowDistance = 120
if (candidate === 'ratio10') lighting.shadowCasterMinRatio = 0.1
console.log('[binding-probe] LIGHTING', JSON.stringify({ c: lighting.shadowCascades, d: lighting.shadowDistance, r: lighting.shadowCasterMinRatio }))
if (candidate === 'noscenery') (referenceCircuit as any).nodes = (referenceCircuit as any).nodes.filter((node: any) => !node.id.startsWith('reference-scenery-collision'))
console.log('[binding-probe] loading')
const scene = await loadLevel(game, level, () => {})
// Uma posição constante não deixa adversários, colisões ou trocas de LOD alterarem o A/B.
const originalTick = game.world.tick.bind(game.world)
game.world.tick = dynamicGameplay ? () => originalTick(1000 / 60) : () => {}
const spawn = level.spawn
const cameraX = spawn.x - Math.sin(level.yaw) * 9
const cameraZ = spawn.z - Math.cos(level.yaw) * 9
game.camera.position.set(cameraX, spawn.y + 5, cameraZ)
game.camera.lookAt(spawn.x, spawn.y + 1, spawn.z)
// Interruptores de orçamento: escondem uma categoria inteira depois do load e relatam quanto esconderam.
if (candidate === 'nomap') {
  const streaming = ((game.world as any)._systems ?? []).find((system: any) => system.runtime)
  streaming.runtime.root.visible = false
  console.log('[binding-probe] SWITCH nomap filhos escondidos:', String(streaming.runtime.root.children.length))
}
if (candidate === 'noplayer') {
  const player = game.world.query(CarComponent).map(entity => entity.getComponent(CarComponent)!).find(car => car.isPlayer)
  player!.object.visible = false
  console.log('[binding-probe] SWITCH noplayer escondido:', String(player!.object.name))
}
if (candidate === 'nopostfx') { game.setPostFX(null); console.log('[binding-probe] SWITCH nopostfx') }
if (candidate === 'nobloom') {
  game.setPostFX(new PostFX(game.renderer, game.scene, game.camera, {
    fxaa: true, toneMapping: AgXToneMapping, exposure: .83, vignette: { intensity: .28, inner: .55, outer: .9 },
  }))
  console.log('[binding-probe] SWITCH nobloom')
}
if (candidate === 'rivalstd' || candidate === 'rivalnotrans') {
  // Zera clearcoat/transmission nos karts (rivais e jogador) e relata quantos materiais mudou.
  let clearcoat = 0, transmission = 0
  for (const entity of game.world.query(CarComponent)) entity.getComponent(CarComponent)!.object.traverse((node: any) => {
    for (const material of [node.material].flat()) {
      if (!material) continue
      if (candidate === 'rivalstd' && material.clearcoat > 0) { material.clearcoat = 0; material.needsUpdate = true; clearcoat++ }
      if (material.transmission > 0) { material.transmission = 0; material.needsUpdate = true; transmission++ }
    }
  })
  console.log('[binding-probe] SWITCH', candidate, 'clearcoat:', String(clearcoat), 'transmission:', String(transmission))
}
// IA no kart do jogador: vira piloto da CarSystem e a câmera segue atrás dele.
let followed: any = null
if (aiPlayer) {
  followed = game.world.query(CarComponent).map(entity => entity.getComponent(CarComponent)!).find(car => car.isPlayer)
  followed.isPlayer = false
  for (const entity of game.world.query(RaceComponent)) entity.getComponent(RaceComponent)!.countdown = 0.1
  console.log('[binding-probe] AI player', !!followed)
}
console.log('[binding-probe] loaded', performance.now() - started)
await prewarmPipelines(game)
console.log('[binding-probe] warmed', performance.now() - started)
const renderer = game.renderer.threeRenderer as any
const root = game.scene.getThreeScene()
let objectCount = 0
let meshCount = 0
const materials = new Set()
root.traverse((object: any) => {
  objectCount++
  if (object.isMesh) meshCount++
  if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
})
console.log('[binding-probe] CONTENT', JSON.stringify({ objectCount, meshCount, materials: materials.size, camera: game.camera.position.toArray(), target: spawn }))

const reasons: Record<string, number> = {}
const groupStats: Record<string, { calls: number; uploads: number; uniforms: number; bytes: number }> = {}
const nodeStats: Record<string, number> = {}
const materialStats: Record<string, number> = {}
let frames = 0
const gaps: number[] = []
const frameLog: number[][] = []
let lastGc: any = null
const samples: any[] = []
let previous = performance.now()
let collect = false
let activeObject: any = null
if (diagnostic) {
  const nodes = renderer._nodes
  const refresh = nodes.needsRefresh
  nodes.needsRefresh = function (object: any) {
    const monitor = object.getMonitor()
    const result = refresh.call(this, object)
    if (collect) {
      const reason = !result ? 'reuse' : monitor.hasNode ? 'hasNode' : monitor.hasAnimation ? 'skinned' : 'monitor'
      reasons[reason] = (reasons[reason] || 0) + 1
      const properties = Object.keys(object.material).filter(key => object.material[key]?.isNode).join(',')
      const key = `${object.material.type}:${properties || '(context/observer)'}`
      materialStats[key] = (materialStats[key] || 0) + 1
      if (result) for (const node of object.getNodeBuilderState().updateNodes) {
        const name = `${node.constructor.name}:${node.updateType}:${node.scope || node.name || ''}`
        nodeStats[name] = (nodeStats[name] || 0) + 1
      }
    }
    return result
  }
  const bindings = renderer._bindings
  const update = bindings.updateForRender
  const instrumented = new WeakSet()
  bindings.updateForRender = function (object: any) {
    activeObject = object
    for (const group of object.getBindings()) for (const binding of group.bindings) {
      if (!binding.isUniformsGroup || instrumented.has(binding)) continue
      instrumented.add(binding)
      const original = binding.update
      binding.update = function () {
        const result = original.call(this)
        if (collect) {
          const key = `${this.name}:${activeObject?.object?.isSkinnedMesh ? 'skinned' : 'mesh'}`
          const stats = groupStats[key] || (groupStats[key] = { calls: 0, uploads: 0, uniforms: 0, bytes: 0 })
          stats.calls++
          stats.uploads += result ? 1 : 0
          stats.uniforms += this.uniforms.length
          stats.bytes += result ? this.buffer.byteLength : 0
        }
        return result
      }
    }
    try { return update.call(this, object) } finally { activeObject = null }
  }
}

// O candidato será instalado aqui, sem alterar a cena ou o caminho de referência.
const candidateInstaller = (globalThis as any).__bindingCandidate
if (candidate !== 'none' && candidateInstaller) candidateInstaller(renderer, candidate)
game.setLoading(false)
game.onUpdate(() => {
  if (frames >= totalFrames) return
  const now = performance.now()
  frames++
  if (frames > warmupFrames) {
    gaps.push(now - previous)
    const stats = (globalThis as any).__cortexNapiStats?.()
    const info = renderer.info.render
    const gc = (globalThis as any).__cortexGcStats?.() ?? {}
    const streaming = ((game.world as any)._systems ?? []).find((system: any) => system.runtime)?.runtime.stats()
    frameLog.push([frames, Math.round((now - previous) * 10) / 10, Math.round(spikeProbe.txMs * 10) / 10, spikeProbe.txN,
      spikeProbe.gltfStart, spikeProbe.gltfEnd, (gc.youngCount ?? 0) - (lastGc?.youngCount ?? 0), (gc.oldCount ?? 0) - (lastGc?.oldCount ?? 0),
      Math.round(((gc.oldWallMs ?? 0) - (lastGc?.oldWallMs ?? 0)) * 10) / 10, Math.round(((gc.youngMs ?? 0) - (lastGc?.youngMs ?? 0)) * 10) / 10,
      streaming?.loading_assets ?? -1, streaming?.cached_asset_lods ?? -1,
      ...(streaming?.lod_instances ?? [-1, -1, -1]), streaming?.visible_instances ?? -1])
    lastGc = gc
    spikeProbe.txMs = 0; spikeProbe.txN = 0; spikeProbe.gltfStart = 0; spikeProbe.gltfEnd = 0
    samples.push({ frame: frames, ms: now - previous, draws: stats?.draw + stats?.drawIndexed, triangles: info.triangles, writeBuffer: stats?.writeBuffer, setBindGroup: stats?.setBindGroup, napiMs: stats?.ms })
  }
  previous = now
  collect = diagnostic && frames > warmupFrames && frames % 30 === 0
  if (dynamicGameplay) scene.update(1 / 60)
  if (candidate === 'terrainnocast' && frames % 10 === 1) {
    const streaming = ((game.world as any)._systems ?? []).find((system: any) => system.runtime)
    let count = 0
    for (const child of streaming.runtime.root.children) {
      const asset = (manifest as any).instances.find((i: any) => i.id === child.name)?.asset
      if (TERRAIN_ASSETS.has(asset)) child.traverse((node: any) => { if (node.isMesh && node.castShadow) { node.castShadow = false; count++ } })
    }
    if (count) console.log('[binding-probe] SWITCH terrainnocast malhas:', String(count))
  }
  if (followed) {
    const position = followed.object.position, heading = followed.arcadeHeading
    game.camera.position.set(position.x - Math.sin(heading) * 10, position.y + 3, position.z - Math.cos(heading) * 10)
    game.camera.lookAt(position.x, position.y + 1, position.z)
  }
  if (movingCamera) {
    const phase = (frames - 1) / 60
    game.camera.position.set(cameraX + Math.sin(phase) * 4, spawn.y + 5, cameraZ + Math.cos(phase) * 4)
    game.camera.lookAt(spawn.x, spawn.y + 1, spawn.z)
  }
  if (frames < totalFrames) return
  const sorted = [...gaps].sort((a, b) => a - b)
  const percentile = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1]
  const elapsed = gaps.reduce((sum, gap) => sum + gap, 0)
  console.log('[binding-probe] RESULT', JSON.stringify({ probeLevel, diagnostic, movingCamera, candidate, frames: gaps.length, fps: 1000 * gaps.length / elapsed, p50ms: percentile(.5), p95ms: percentile(.95), p99ms: percentile(.99), worstMs: sorted[sorted.length - 1], samples, frameLog, reasons, groupStats, nodeStats, materialStats, profiler: game.profiler.summary(), host: (globalThis as any).__cortexPerfStats?.(), resolution: [innerWidth, innerHeight], pixelRatio: devicePixelRatio, totalMs: now - started }))
  window.close()
})
