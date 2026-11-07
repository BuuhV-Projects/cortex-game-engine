import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { debug } from '../../src/core/debug.js'
import { OPPOSITE_VIEW, VIEW_DIRECTIONS, isInverseView, nearestView, viewActionForKey, type RigView } from './rigViewKeys.js'

const SCOPE = 'rig-view'
/** FOV da "ortográfica": perto de paralela, sem trocar a câmera que o gizmo e o pick seguram. */
const ORTHO_FOV = 1
/** Quanto a direção pode desviar da vista alinhada antes de soltar (cosseno de ~0,5°). */
const RELEASE_COS = Math.cos(THREE.MathUtils.degToRad(0.5))

/**
 * Vistas do teclado numérico na prévia do Auto-rig (SPEC-0710): 1/3/7 alinham em eixos globais
 * já ortográficas, 9 inverte, 5 alterna perspectiva/ortográfica; girar solta para perspectiva.
 *
 * ponytail: ortográfica emulada com FOV de 1° (paralaxe ~1%); OrthographicCamera de verdade
 * exigiria trocar a câmera em todos os donos (gizmo, pick, arma).
 */
export class RigViewCamera {
  private readonly perspFov: number
  /** `far` da perspectiva (o enquadramento da carga o define); a ortográfica o estica na proporção. */
  private perspFar: number
  /** Vista alinhada atual (ortográfica), ou `null` em perspectiva livre. */
  private aligned: RigView | null = null
  private readonly onChange = (): void => this.releaseIfOrbited()

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly orbit: OrbitControls | null) {
    this.perspFov = camera.fov
    this.perspFar = camera.far
    orbit?.addEventListener('change', this.onChange)
  }

  /** Trata a tecla; `true` se era um atalho de vista. Ignora com foco em campo de texto/seleção. */
  handleKey(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return false
    if (e.altKey || e.metaKey || !this.orbit) return false
    const numLock = e.getModifierState?.('NumLock') ?? false
    const action = viewActionForKey(e.code, isInverseView({ ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, key: e.key, numLock }))
    if (!action) return false
    if (action.kind === 'view') this.align(action.view)
    else if (action.kind === 'opposite') this.opposite()
    else if (this.aligned) this.setFov(this.perspFov, null)
    else this.align(nearestView(this.offset().toArray()))
    debug(SCOPE, e.code, action, '→', this.aligned ?? 'perspectiva')
    return true
  }

  /** Câmera nova enquadrada (troca de modelo): volta à perspectiva livre. */
  reset(): void {
    this.aligned = null
    this.perspFar = this.camera.far
    this.camera.fov = this.perspFov
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.orbit?.removeEventListener('change', this.onChange)
  }

  private offset(): THREE.Vector3 {
    return this.camera.position.clone().sub(this.orbit!.target)
  }

  private opposite(): void {
    if (this.aligned) return this.align(OPPOSITE_VIEW[this.aligned])
    const offset = this.offset()
    this.camera.position.copy(this.orbit!.target).sub(offset)
    this.orbit!.update()
  }

  /** Põe a câmera no eixo global da vista, mantendo a distância de enquadramento, em ortográfica. */
  private align(view: RigView): void {
    const dist = this.offset().length() * this.fovScale(this.camera.fov, this.perspFov)
    const dir = new THREE.Vector3(...VIEW_DIRECTIONS[view]).normalize()
    this.camera.position.copy(this.orbit!.target).addScaledVector(dir, dist)
    this.aligned = null // a mudança de posição abaixo não pode soltar a vista
    this.camera.fov = this.perspFov
    this.setFov(ORTHO_FOV, view)
  }

  /** Troca o FOV afastando/aproximando a câmera para o enquadramento no alvo não mudar. */
  private setFov(fov: number, aligned: RigView | null): void {
    const scale = this.fovScale(this.camera.fov, fov)
    const offset = this.offset()
    this.camera.position.copy(this.orbit!.target).addScaledVector(offset, scale)
    this.camera.far = this.perspFar * this.fovScale(this.perspFov, fov)
    this.camera.fov = fov
    this.camera.updateProjectionMatrix()
    this.aligned = null
    // Sem isto, o resto do amortecimento de um giro anterior tira a câmera do eixo (e solta a vista).
    ;(this.orbit as unknown as { _sphericalDelta?: THREE.Spherical })._sphericalDelta?.set(0, 0, 0)
    this.orbit!.update()
    this.aligned = aligned
  }

  /** Fator de distância que mantém o mesmo tamanho na tela ao ir de `from` para `to` graus. */
  private fovScale(from: number, to: number): number {
    const half = (deg: number): number => Math.tan(THREE.MathUtils.degToRad(deg) / 2)
    return half(from) / half(to)
  }

  /** Girar (direção muda) solta a vista alinhada para perspectiva; pan/zoom não. */
  private releaseIfOrbited(): void {
    if (!this.aligned) return
    const dir = this.offset().normalize()
    const want = new THREE.Vector3(...VIEW_DIRECTIONS[this.aligned]).normalize()
    if (dir.dot(want) >= RELEASE_COS) return
    this.setFov(this.perspFov, null)
    debug(SCOPE, 'orbit soltou a vista alinhada')
  }
}
