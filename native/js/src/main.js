// CortexNative M0 — Marco E: Three.js WebGPURenderer renderizando um cubo.
// O prelude fornece os shims de browser; o shim nativo (src/webgpu/) fornece
// navigator.gpu. Se isto renderiza, o conceito CortexNative está validado.
import './prelude.js';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const WIDTH = 1280;
const HEIGHT = 720;

// Smoke test da frente 1 do M1 — o padrão exato do teste4:
// event bus via document + HUD DOM inerte.
function smokeTestBrowserShims() {
  let received = null;
  document.addEventListener('rush:coin-collected', function (e) {
    received = e.detail;
  });
  document.dispatchEvent(
    new CustomEvent('rush:coin-collected', { detail: { total: 7 } }),
  );

  const hud = document.createElement('div');
  hud.style.position = 'fixed';
  hud.innerHTML = '<b>x7</b>';
  document.body.appendChild(hud);

  const ok = received && received.total === 7 &&
    document.body.children.length === 1;
  print('[m1] smoke frente 1 (event bus + DOM-lite): ' +
    (ok ? 'OK' : 'FALHOU'));
}

// Smoke da frente 2 — cadeia SDL→C++→JS: teclado como o browser entrega
// (window/document/body) e Gamepad API.
function smokeTestInput() {
  window.addEventListener('keydown', function (e) {
    print('[m1] keydown: key=' + e.key + ' code=' + e.code);
  });
  document.body.addEventListener('pointerdown', function (e) {
    print('[m1] pointerdown em ' + e.clientX + ',' + e.clientY);
  });
  print('[m1] gamepads conectados: ' + navigator.getGamepads().length);
}

async function main() {
  smokeTestBrowserShims();
  smokeTestInput();
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
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshNormalMaterial(),
  );
  cube.position.x = -1.2;
  scene.add(cube);

  // Frente 3 do M1: GLB REAL do teste4 (kit Deathrun) carregado via fetch
  // nativo + GLTFLoader. Luz porque o kit usa materiais PBR.
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(3, 5, 4);
  scene.add(sun);

  new GLTFLoader().load(
    'block-grass-large.glb',
    function (gltf) {
      const model = gltf.scene;
      model.position.set(0.8, -0.3, 0);
      scene.add(model);
      print('[m1] GLB do teste4 carregado e na cena!');
    },
    undefined,
    function (error) {
      print('[m1] GLB ERRO: ' + error + (error && error.stack ? '\n' + error.stack : ''));
    },
  );

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
