// Repro mínima da pintura de textura do terreno (SPEC-0063), fora do editor:
// cria o Terrain real, esculpe, pinta uma camada com textura xadrez (data URL)
// e renderiza — pra validar o blend de splat por screenshot (Chrome headless).
// USA O MESMO RENDERER DO ENGINE (WebGPURenderer, node-based) — onBeforeCompile
// não existe nesse pipeline; o blend tem que ser TSL. forceWebGL pro headless.
import { Scene, PerspectiveCamera, Color, AmbientLight, DirectionalLight } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { Terrain } from '../../src/scene/Terrain.ts';

const renderer = new WebGPURenderer({ antialias: true, forceWebGL: true });
renderer.setSize(900, 600);
document.body.appendChild(renderer.domElement);
await renderer.init();

const scene = new Scene();
scene.background = new Color(0x88bbee);
const camera = new PerspectiveCamera(60, 900 / 600, 0.1, 1000);
camera.position.set(0, 45, 55);
camera.lookAt(0, 0, 0);
scene.add(new AmbientLight(0xffffff, 1.0));
const sun = new DirectionalLight(0xffffff, 2);
sun.position.set(20, 40, 20);
scene.add(sun);

// Textura xadrez vermelha/branca gerada num canvas (TextureLoader aceita data URL).
const cv = document.createElement('canvas');
cv.width = cv.height = 64;
const g = cv.getContext('2d')!;
for (let y = 0; y < 8; y++)
  for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#c0392b' : '#f5e6d3';
    g.fillRect(x * 8, y * 8, 8, 8);
  }
const checkerUrl = cv.toDataURL('image/png');

const terrain = new Terrain({ size: 60, resolution: 64 });
scene.add(terrain.mesh);
terrain.sculpt(-10, -5, 12, 4); // um morro pra ver luz/normais

const layer = terrain.layerFor(checkerUrl, 8);
console.log('[repro] layer =', layer, 'layers =', JSON.stringify(terrain.getLayers().map((l) => l.repeat)));
terrain.paint(8, 5, 14, 1, layer); // mancha pintada à direita
console.log('[repro] paint ok, splat bytes não-zero =', (() => {
  const p = terrain.getPaint();
  if (!p) return 0;
  return atob(p.splat).split('').filter((c) => c.charCodeAt(0) > 0).length;
})());

let frames = 0;
function loop(): void {
  void renderer.render(scene, camera);
  if (++frames === 30) console.log('[repro] 30 frames renderizados sem erro');
  requestAnimationFrame(loop);
}
loop();
