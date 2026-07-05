// CortexNative M0 — Marco E: Three.js WebGPURenderer renderizando um cubo.
// O prelude fornece os shims de browser; o shim nativo (src/webgpu/) fornece
// navigator.gpu. Se isto renderiza, o conceito CortexNative está validado.
import './prelude.js';
import * as THREE from 'three/webgpu';

const WIDTH = 1280;
const HEIGHT = 720;

async function main() {
  print('[three] criando WebGPURenderer...');
  const canvas = __cortexCreateCanvas(WIDTH, HEIGHT);
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false });
  await renderer.init();
  print('[three] renderer.init() OK — backend WebGPU nativo');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0618);

  const camera = new THREE.PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, 100);
  camera.position.z = 3;

  // MeshNormalMaterial: faces coloridas sem luz/textura — o caso mínimo.
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshNormalMaterial(),
  );
  scene.add(cube);

  function frame(tMs) {
    const t = tMs / 1000;
    cube.rotation.x = t * 0.7;
    cube.rotation.y = t * 1.0;
    try {
      renderer.render(scene, camera);
    } catch (e) {
      print('[three] render ERRO: ' + e + '\n' + (e && e.stack ? e.stack : ''));
      throw e;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  print('[three] cubo entregue ao requestAnimationFrame');
}

main().catch(function (e) {
  print('[three] ERRO: ' + e + (e && e.stack ? '\n' + e.stack : ''));
});
