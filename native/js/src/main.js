// CortexNative M0 — Marco E: Three.js WebGPURenderer renderizando um cubo.
// O prelude fornece os shims de browser; o shim nativo (src/webgpu/) fornece
// navigator.gpu. Se isto renderiza, o conceito CortexNative está validado.
import './prelude.js';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';

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

// Smoke da frente 4 — Rapier NATIVO com a forma da API compat: bola
// dinâmica cai sobre chão fixo e repousa (mesmo código que rodaria no
// browser com o WASM).
async function smokeTestRapier() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.5, 10), ground);
  const ballBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(0.5).setRestitution(0.4),
    ballBody,
  );
  for (let i = 0; i < 180; i++) world.step();
  const y = ballBody.translation().y;
  const resting = y > 0.9 && y < 1.1; // raio 0.5 sobre chão de topo 0.5
  print('[m1] smoke frente 4 (rapier nativo): y=' + y.toFixed(3) + ' ' +
    (resting ? 'OK (repousou sobre o chão)' : 'FALHOU'));
  world.free();
}

// Smoke da frente 5 — o caminho exato do THREE.AudioLoader/Audio:
// fetch(wav) → decodeAudioData → bufferSource → gain → destination.
async function smokeTestAudio() {
  const response = await fetch('coin.wav');
  if (!response.ok) {
    print('[m1] smoke frente 5 (audio): coin.wav ausente — pulado');
    return;
  }
  const data = await response.arrayBuffer();
  const ctx = new AudioContext();
  const buffer = await ctx.decodeAudioData(data);
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.value = 0.5;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.start(0);
  print('[m1] smoke frente 5 (audio): tocando coin.wav — duração ' +
    buffer.duration.toFixed(2) + 's @' + buffer.sampleRate + 'Hz ' +
    (source.__voice > 0 ? 'OK (voz ' + source.__voice + ')' : 'FALHOU'));
}

async function main() {
  smokeTestBrowserShims();
  smokeTestInput();
  await smokeTestRapier();
  await smokeTestAudio();
  print('[three] criando WebGPURenderer...');
  const canvas = __cortexCreateCanvas(WIDTH, HEIGHT);
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false });
  await renderer.init();
  print('[three] renderer.init() OK — backend WebGPU nativo');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0618);

  const camera = new THREE.PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, 100);
  camera.position.z = 3;

  // ── Bisseção de luzes (debug do delta Studio×native) ──────────────────
  // 3 materiais × esferas: standard branco, toon com gradientMap, metal.
  // Luzes: ambient + hemisphere + directional — se alguma não contribuir
  // no wgpu-native, a diferença aparece aqui isolada.
  const gradientData = new Uint8Array([0, 128, 255]);
  const gradientMap = new THREE.DataTexture(gradientData, 3, 1, THREE.RedFormat);
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0x88cc88 }),
    new THREE.MeshToonMaterial({ color: 0x88cc88, gradientMap }),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.2 }),
  ];
  mats.forEach((mat, i) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), mat);
    ball.position.set(-1.4 + i * 1.0, 0.6, 0);
    scene.add(ball);
  });
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x5a4632, 1.0));
  const amb = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(amb);
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshNormalMaterial(),
  );
  cube.position.set(-1.2, -0.9, 0);
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
