/** Câmera das vistas do numpad no Auto-rig (SPEC-0712), com PerspectiveCamera + OrbitControls reais. */

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RigViewCamera } from '../../electron/renderer/RigViewCamera.js'

const TARGET = new THREE.Vector3(0.2, 0.9, -0.1)

function setup(): { camera: THREE.PerspectiveCamera; orbit: OrbitControls; view: RigViewCamera } {
  const camera = new THREE.PerspectiveCamera(40, 1, 0.018, 180)
  camera.position.set(TARGET.x + 1.1, TARGET.y + 0.3, TARGET.z + 3.4)
  const orbit = new OrbitControls(camera)
  orbit.target.copy(TARGET)
  orbit.update()
  return { camera, orbit, view: new RigViewCamera(camera, orbit) }
}

const key = (code: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent => ({ code, target: null, ...mods }) as KeyboardEvent
const dir = (camera: THREE.PerspectiveCamera): THREE.Vector3 => camera.position.clone().sub(TARGET).normalize()
/** Tamanho na tela de 1 m no alvo (o que "manter a distância" preserva entre perspectiva e ortográfica). */
const framing = (camera: THREE.PerspectiveCamera): number => camera.position.distanceTo(TARGET) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)

describe('RigViewCamera', () => {
  it('Numpad 1 alinha na frente (+Z global) em ortográfica, sem mudar o enquadramento', () => {
    const { camera, view } = setup()
    const before = framing(camera)
    expect(view.handleKey(key('Numpad1'))).toBe(true)
    expect(dir(camera).z).toBeCloseTo(1, 5)
    expect(camera.fov).toBe(1)
    expect(framing(camera)).toBeCloseTo(before, 5)
  })

  it('Ctrl ou Shift dá o lado oposto; 7 fica um fio fora do polo', () => {
    const { camera, view } = setup()
    view.handleKey(key('Numpad3', { shiftKey: true }))
    expect(dir(camera).x).toBeCloseTo(-1, 5)
    view.handleKey(key('Numpad7', { ctrlKey: true }))
    expect(dir(camera).y).toBeCloseTo(-1, 3)
  })

  it('Numpad 9 inverte a vista alinhada e a livre', () => {
    const { camera, view } = setup()
    view.handleKey(key('Numpad3'))
    view.handleKey(key('Numpad9'))
    expect(dir(camera).x).toBeCloseTo(-1, 5)
    view.handleKey(key('Numpad5')) // volta à perspectiva
    const free = dir(camera)
    view.handleKey(key('Numpad9'))
    expect(dir(camera).dot(free)).toBeCloseTo(-1, 3)
  })

  it('girar solta para perspectiva; pan não solta; 5 endireita de novo', () => {
    const { camera, orbit, view } = setup()
    const before = framing(camera)
    view.handleKey(key('Numpad1'))
    const pan = new THREE.Vector3(0.05, 0.02, 0) // pan: alvo e câmera andam juntos, a direção não muda
    orbit.target.add(pan)
    camera.position.add(pan)
    orbit.update()
    expect(camera.fov).toBe(1)
    const t = orbit.target
    camera.position.sub(t).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.3).add(t) // orbit de ~17°
    orbit.update()
    expect(camera.fov).toBe(40)
    expect(camera.position.distanceTo(t) * Math.tan(THREE.MathUtils.degToRad(20))).toBeCloseTo(before, 5)
    view.handleKey(key('Numpad5'))
    expect(camera.fov).toBe(1)
    expect(camera.position.clone().sub(t).normalize().z).toBeCloseTo(1, 5)
  })

  it('ignora com foco em campo e teclas que não são de vista', () => {
    const { camera, view } = setup()
    const at = camera.position.clone()
    expect(view.handleKey(key('Numpad1', { target: { tagName: 'SELECT' } as unknown as EventTarget }))).toBe(false)
    expect(view.handleKey(key('Digit1'))).toBe(false)
    expect(camera.position.equals(at)).toBe(true)
  })
})
