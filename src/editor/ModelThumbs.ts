import {
  Scene,
  PerspectiveCamera,
  HemisphereLight,
  DirectionalLight,
  Box3,
  Vector3,
} from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { loadGLB, instance } from '../scene/SceneAssets.js';

/**
 * **Thumbnails 3D de modelos** (ADR-0093): renderiza um `.glb` numa miniatura
 * (renderer WebGL compartilhado, offscreen) e devolve um data-URL, com cache por
 * URL e fila serial (1 render por vez — sem estourar GPU ao abrir um modal com
 * dezenas de modelos). Usado pelo picker "Adicionar modelo"/"Desenhar blockout"
 * via `loadThumb` (lazy: só renderiza os cards visíveis).
 *
 * Usa um `WebGPURenderer` próprio com **`forceWebGL: true`** (o bundle da engine
 * aliasa `three` pro build WebGPU — sem `WebGLRenderer` clássico): backend WebGL2
 * isolado, pequeno (96px) e previsível pro `toDataURL` logo após o render.
 */

const SIZE = 96;
const cache = new Map<string, string>();
let renderer: WebGPURenderer | null = null;
let scene: Scene | null = null;
let camera: PerspectiveCamera | null = null;
/** Fila serial: encadeia os renders pra nunca rodar dois ao mesmo tempo. */
let queue: Promise<void> = Promise.resolve();

async function ensureStage(): Promise<boolean> {
  if (renderer) return true;
  try {
    const r = new WebGPURenderer({ antialias: true, alpha: true, forceWebGL: true });
    r.setSize(SIZE, SIZE);
    await r.init(); // o WebGPURenderer exige init assíncrono antes do 1º render
    renderer = r;
    scene = new Scene();
    scene.add(new HemisphereLight(0xffffff, 0x667788, 1.1));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 3, 2);
    scene.add(sun);
    camera = new PerspectiveCamera(35, 1, 0.01, 100);
    return true;
  } catch {
    return false; // sem WebGL (headless) — o picker fica com o placeholder
  }
}

const _box = new Box3();
const _size = new Vector3();
const _center = new Vector3();

/**
 * Data-URL da miniatura do modelo (renderiza na primeira vez; cache depois).
 * Rejeita se o modelo não carregar — o chamador mantém o placeholder.
 */
export function modelThumb(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    const again = cache.get(url);
    if (again) return again;
    if (!(await ensureStage()) || !renderer || !scene || !camera) throw new Error('sem WebGL');
    const gltf = await loadGLB(url);
    const obj = instance(gltf, {});
    scene.add(obj);
    try {
      // Enquadra por bounding box: câmera em diagonal 3/4, distância pela diagonal.
      _box.setFromObject(obj);
      _box.getSize(_size);
      _box.getCenter(_center);
      const radius = Math.max(_size.x, _size.y, _size.z, 0.001) * 0.75;
      const dist = radius / Math.tan((camera.fov * Math.PI) / 360) + radius * 0.4;
      camera.position.set(_center.x + dist * 0.62, _center.y + dist * 0.55, _center.z + dist * 0.62);
      camera.lookAt(_center);
      renderer.render(scene, camera);
      const data = renderer.domElement.toDataURL('image/png');
      cache.set(url, data);
      return data;
    } finally {
      scene.remove(obj);
    }
  });
  // A fila continua mesmo se um item falhar.
  queue = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}
