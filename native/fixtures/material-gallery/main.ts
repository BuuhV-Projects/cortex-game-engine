/**
 * Material gallery (SPEC-0505): one sphere per (model, feature) class the target games use,
 * under a fixed camera with sun + shadow, hemisphere, one spot and linear fog. Nothing moves,
 * so two captures of the same path must match: it is the known-answer case that validates the
 * parity instrument before any conclusion in a game, and the per-material parity scene of R1+.
 *
 * `?galleryPlant=1` shifts one sphere's red by GALLERY_PLANT_DELTA: the comparator must flag it.
 */
import {
  Color,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Fog,
  Float32BufferAttribute,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  SpotLight,
  Vector3,
  type Material,
} from 'three';
import { Game, applyMaterial } from 'cortex-game-engine';

// 2/255 (linear) came out as 1 after tone mapping + sRGB and hid under the noise floor.
const GALLERY_PLANT_DELTA = 8 / 255;
const TEXTURE_SIZE = 64;
const CHECKER_CELLS = 8;
const COLUMNS = 6;
const SPACING = 1.1;
const RADIUS = 0.4;
const SEGMENTS_W = 32;
const SEGMENTS_H = 16;
const RGBA = 4;
const BYTE = 255;
const FOG_NEAR = 6;
const FOG_FAR = 16;
const SHADOW_MAP_SIZE = 1024;
const OUTLINE = 0.03;
const TOON_STEPS = 3;

function texture(pixel: (x: number, y: number) => [number, number, number], srgb: boolean): DataTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * RGBA);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const [r, g, b] = pixel(x, y);
      const i = (y * TEXTURE_SIZE + x) * RGBA;
      data[i] = r * BYTE;
      data[i + 1] = g * BYTE;
      data[i + 2] = b * BYTE;
      data[i + 3] = BYTE;
    }
  }
  const t = new DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE);
  t.wrapS = t.wrapT = RepeatWrapping;
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const cell = TEXTURE_SIZE / CHECKER_CELLS;
const checker = texture((x, y) => ((Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? [0.9, 0.8, 0.3] : [0.2, 0.3, 0.8]), true);
const stripes = texture((x) => (Math.floor(x / cell) % 2 ? [1, 0.5, 0] : [0, 0, 0]), true);
const bumps = texture((x, y) => [0.5 + 0.4 * Math.sin(x / 3), 0.5 + 0.4 * Math.cos(y / 3), 1], false);
const holes = texture((x, y) => {
  const keep = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 1 : 0;
  return [keep, keep, keep];
}, true);

function sphere(withVertexColors = false): SphereGeometry {
  const g = new SphereGeometry(RADIUS, SEGMENTS_W, SEGMENTS_H);
  if (withVertexColors) {
    const pos = g.getAttribute('position');
    const colors: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + RADIUS) / (2 * RADIUS);
      colors.push(1 - t, t, 0.5);
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  }
  return g;
}

const cutout = new MeshBasicMaterial({ map: holes, alphaTest: 0.5, side: DoubleSide });

/** The material on a sphere that does not receive shadow (the loop below turns it on for all). */
function unshadowed(material: Material): (mesh: Mesh) => void {
  return (mesh) => {
    mesh.material = material;
    void Promise.resolve().then(() => {
      mesh.receiveShadow = false;
    });
  };
}

/** [name, material or engine preset, vertexColors] — one sphere each, in gallery order. */
const entries: Array<[string, Material | ((mesh: Mesh) => void), boolean]> = [
  ['unlit-color', new MeshBasicMaterial({ color: 0xcc3333 }), false],
  ['unlit-map', new MeshBasicMaterial({ map: checker }), false],
  ['unlit-map-vcolor', new MeshBasicMaterial({ map: checker, vertexColors: true }), true],
  ['unlit-alphatest', cutout, false],
  ['unlit-notonemap', new MeshBasicMaterial({ color: 0xffeeaa, toneMapped: false }), false],
  ['unlit-nofog', new MeshBasicMaterial({ color: 0x33aa55, fog: false }), false],
  ['lambert-color', new MeshLambertMaterial({ color: 0x8899aa }), false],
  ['lambert-map-vcolor', new MeshLambertMaterial({ map: checker, vertexColors: true }), true],
  ['lambert-emissive', new MeshLambertMaterial({ color: 0x222222, emissive: new Color(1, 0.6, 0.2), emissiveMap: stripes, emissiveIntensity: 1.5 }), false],
  ['standard-metal', new MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.9, roughness: 0.3 }), false],
  ['standard-map-normal', new MeshStandardMaterial({ map: checker, normalMap: bumps, roughness: 0.6 }), false],
  ['standard-emissive', new MeshStandardMaterial({ color: 0x111111, emissive: new Color(0.2, 0.6, 1), emissiveMap: stripes }), false],
  ['standard-map-vcolor', new MeshStandardMaterial({ map: checker, vertexColors: true }), true],
  ['physical-ior-specular', new MeshPhysicalMaterial({ color: 0x9944aa, ior: 1.4, specularIntensity: 0.6, roughness: 0.4 }), false],
  ['toon', (mesh) => applyMaterial(mesh, { type: 'toon', color: 0x55aaee, gradientSteps: TOON_STEPS }), false],
  ['toon-outline', (mesh) => applyMaterial(mesh, { type: 'toon', color: 0xee8855, gradientSteps: TOON_STEPS, outline: OUTLINE }), false],
  ['unlit-outline', (mesh) => applyMaterial(mesh, { type: 'unlit', color: 0x88ee55, outline: OUTLINE }), false],
  // R1.2 (SPEC-0535): lit models without receiveShadow (refused until the shadow block is ready).
  ['lambert-color-lit', unshadowed(new MeshLambertMaterial({ color: 0x8899aa })), false],
  ['lambert-map-vcolor-lit', unshadowed(new MeshLambertMaterial({ map: checker, vertexColors: true })), true],
  ['lambert-emissive-lit', unshadowed(new MeshLambertMaterial({ map: checker, emissive: new Color(1, 0.6, 0.2), emissiveMap: stripes, emissiveIntensity: 1.5 })), false],
  ['lambert-alphatest-lit', unshadowed(new MeshLambertMaterial({ map: holes, alphaTest: 0.5, side: DoubleSide })), false],
  ['lambert-double-vcolor-lit', unshadowed(new MeshLambertMaterial({ side: DoubleSide, vertexColors: true })), true],
  ['standard-metal-lit', unshadowed(new MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.9, roughness: 0.3 })), false],
  ['standard-map-lit', unshadowed(new MeshStandardMaterial({ map: checker, roughness: 0.6 })), false],
  ['standard-emissive-lit', unshadowed(new MeshStandardMaterial({ color: 0x111111, emissive: new Color(0.2, 0.6, 1), emissiveMap: stripes })), false],
  ['standard-double-map-lit', unshadowed(new MeshStandardMaterial({ map: checker, side: DoubleSide, roughness: 0.5 })), false],
];

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const game = new Game({ canvas });
const scene = game.scene.getThreeScene();
scene.background = new Color(0x9fb8cc);
scene.fog = new Fog(0x9fb8cc, FOG_NEAR, FOG_FAR);

const sun = new DirectionalLight(0xffffff, 2);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
sun.shadow.camera.right = sun.shadow.camera.top = 6;
scene.add(sun, new HemisphereLight(0xbfd8ff, 0x553322, 0.8));
const spot = new SpotLight(0xffcc88, 30, 12, Math.PI / 6, 0.4, 2);
spot.position.set(-3, 4, 2);
scene.add(spot, spot.target);

const ground = new Mesh(new PlaneGeometry(20, 20), new MeshLambertMaterial({ color: 0x777766 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -RADIUS - 0.05;
ground.receiveShadow = true;
scene.add(ground);

const plant = typeof location !== 'undefined' && location.search.includes('galleryPlant=1');
entries.forEach(([name, kind, vcolor], i) => {
  const mesh = new Mesh(sphere(vcolor), kind instanceof Function ? new MeshBasicMaterial() : kind);
  if (kind instanceof Function) kind(mesh);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set((i % COLUMNS - (COLUMNS - 1) / 2) * SPACING, 0, -Math.floor(i / COLUMNS) * SPACING);
  scene.add(mesh);
});
if (plant) {
  const first = scene.getObjectByName(entries[0]![0]) as Mesh;
  (first.material as MeshBasicMaterial).color.r += GALLERY_PLANT_DELTA;
}
// `?galleryPlant=flicker` (SPEC-0525): the plant flips on every render, so it alternates like the
// two arms of ?parityFreeze and the same-run verdict must FAIL. onBeforeRender runs while frozen.
if (typeof location !== 'undefined' && location.search.includes('galleryPlant=flicker')) {
  const first = scene.getObjectByName(entries[0]![0]) as Mesh;
  const color = (first.material as MeshBasicMaterial).color;
  let on = false;
  first.castShadow = false; // the shadow pass would call onBeforeRender too and flip it back
  first.onBeforeRender = () => {
    on = !on;
    color.r += on ? GALLERY_PLANT_DELTA : -GALLERY_PLANT_DELTA;
  };
}

game.camera.position.set(0, 3.2, 4.5);
game.camera.lookAt(new Vector3(0, 0, -1.2));
await game.precompile();
game.start();
