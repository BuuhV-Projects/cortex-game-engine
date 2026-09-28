import { BoxGeometry, Color, DirectionalLight, Game, HemisphereLight, Mesh, MeshStandardMaterial, SphereGeometry, Water } from '../../src/index-runtime.js';

const RIPPLE_INTERVAL_SECONDS = 1.2;
const MARKER_RADIUS = .35;
const ORBIT_RADIUS = 8;
const CAMERA_HEIGHT = 15;
const CAMERA_DISTANCE = 25;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const game = new Game({ canvas, far: 250 });
game.maxFps = 0;
game.scene.getThreeScene().background = new Color(0x66c9f0);
game.scene.add(new HemisphereLight(0xbfefff, 0x42718b, 2.2));
const sun = new DirectionalLight(0xffedc7, 3);
sun.position.set(-20, 40, 10);
game.scene.add(sun);
game.camera.position.set(18, CAMERA_HEIGHT, CAMERA_DISTANCE);
game.camera.lookAt(0, 0, 0);

// A mesma cena permite comparar os dois materiais sem mudar câmera ou iluminação.
const simple = new URLSearchParams(location.search).has('simpleWater');
const water = new Water(game.scene, {
  style: simple ? 'simple' : 'cartoon', size: 180, color: 0x089dc4,
  waveHeight: .2, waveLength: 16, waveSpeed: 1, foamStrength: .8, segments: 128,
});
const marker = new Mesh(new SphereGeometry(MARKER_RADIUS), new MeshStandardMaterial({ color: 0xffb72b }));
marker.position.y = MARKER_RADIUS;
game.scene.add(marker);
// A ilha atravessa a superfície; somente seu contorno produz espuma de margem.
const island = new Mesh(new BoxGeometry(6, 5, 8), new MeshStandardMaterial({ color: 0xc9b282 }));
island.position.set(-6, 0, -5);
game.scene.add(island);
water.refreshShoreline();
let elapsedSeconds = 0;
let rippleElapsed = RIPPLE_INTERVAL_SECONDS;

game.onUpdate(deltaSeconds => {
  elapsedSeconds += deltaSeconds;
  rippleElapsed += deltaSeconds;
  marker.position.set(Math.sin(elapsedSeconds * .35) * ORBIT_RADIUS, MARKER_RADIUS, 0);
  if (rippleElapsed >= RIPPLE_INTERVAL_SECONDS) {
    water.addRipple(marker.position);
    rippleElapsed = 0;
  }
  water.update(deltaSeconds);
});
await game.precompile();
game.start();
