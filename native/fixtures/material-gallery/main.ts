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
import { AdditiveBlending, BufferGeometry, InstancedMesh, Matrix4, type Object3D } from 'three';
import { MeshBasicNodeMaterial, TSL, registerNativeMaterial, shaderTime, type NativeModelDef } from 'cortex-game-engine';
import { Bone, BoxGeometry, CylinderGeometry, FloatType, InstancedBufferAttribute, RGBAFormat, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three';

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

// ── R1.4 entries (SPEC-0555): instancing, transparency, pipeline state, dynamic buffers ──
const SMALL_RADIUS = RADIUS / 2;
const QUAD = RADIUS * 1.5;
const HALF_OPACITY = 0.5;
const MARK_OPACITY = 0.55;
const MARK_OFFSET_FACTOR = -4;
const DECAL_RENDER_ORDER = 1;
const PARTICLES = 3;
const QUADS = 2;
const QUAD_VERTICES = 4;
const QUAD_INDICES = 6;
const XYZ = 3;
const instanceColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44];

/** Hides the entry's sphere (its children still draw) and puts `children` in its cell. */
function cellWith(...children: Object3D[]): (mesh: Mesh) => void {
  return (mesh) => {
    (mesh.material as Material).visible = false;
    mesh.add(...children);
  };
}

/** Four small spheres of an InstancedMesh with instanceColor, on a 2×2 grid. */
function instancedSpheres(): InstancedMesh {
  const mesh = new InstancedMesh(new SphereGeometry(SMALL_RADIUS, SEGMENTS_W, SEGMENTS_H), new MeshBasicMaterial(), instanceColors.length);
  const m = new Matrix4();
  instanceColors.forEach((c, i) => {
    mesh.setMatrixAt(i, m.makeTranslation(i % 2 ? SMALL_RADIUS : -SMALL_RADIUS, i < 2 ? SMALL_RADIUS : -SMALL_RADIUS, 0));
    mesh.setColorAt(i, new Color(c));
  });
  return mesh;
}

/** Additive DoubleSide billboards of an InstancedMesh, like the engine's ParticleEmitter. */
function particles(): InstancedMesh {
  const material = new MeshBasicMaterial({
    map: stripes, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false,
  });
  const mesh = new InstancedMesh(new PlaneGeometry(QUAD, QUAD), material, PARTICLES + 1);
  const m = new Matrix4();
  for (let i = 0; i < PARTICLES; i++) mesh.setMatrixAt(i, m.makeTranslation((i - 1) * SMALL_RADIUS, (i - 1) * SMALL_RADIUS, i * SMALL_RADIUS));
  mesh.count = PARTICLES;
  return mesh;
}

/** Two opaque coplanar quads (same z: the three's id order decides) under a polygonOffset decal. */
function coplanar(): Object3D[] {
  const under = new Mesh(new PlaneGeometry(QUAD, QUAD), new MeshBasicMaterial({ color: 0xcc2222 }));
  const over = new Mesh(new PlaneGeometry(QUAD, QUAD), new MeshBasicMaterial({ color: 0x22cc22 }));
  const decal = new Mesh(
    new PlaneGeometry(QUAD / 2, QUAD / 2),
    new MeshBasicMaterial({ color: 0x161616, transparent: true, opacity: MARK_OPACITY, depthWrite: false, polygonOffset: true, polygonOffsetFactor: MARK_OFFSET_FACTOR }),
  );
  decal.renderOrder = DECAL_RENDER_ORDER;
  return [under, over, decal];
}

/** Tire-mark geometry: two quads, drawRange on the first only (SkidMarkSystem). */
function drawRangeMarks(): Mesh {
  const geo = new BufferGeometry();
  const h = QUAD / 2;
  const corners = [-h, -h, 0, h, -h, 0, -h, h, 0, h, h, 0];
  const positions: number[] = [];
  for (let q = 0; q < QUADS; q++) positions.push(...corners.map((v, k) => (k % XYZ === 0 ? v + q * QUAD : v)));
  geo.setAttribute('position', new Float32BufferAttribute(positions, XYZ));
  const index: number[] = [];
  for (let q = 0; q < QUADS; q++) {
    const v = q * QUAD_VERTICES;
    index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  geo.setIndex(index);
  geo.setDrawRange(0, QUAD_INDICES);
  const mesh = new Mesh(geo, new MeshBasicMaterial({
    color: 0x161616, transparent: true, opacity: MARK_OPACITY, depthWrite: false, side: DoubleSide,
    polygonOffset: true, polygonOffsetFactor: MARK_OFFSET_FACTOR,
  }));
  mesh.renderOrder = DECAL_RENDER_ORDER;
  mesh.frustumCulled = false;
  return mesh;
}

// ── R1.5 entries (SPEC-0565): a game WGSL (TSL for the three, WGSL for the native renderer) and skinning ──
const WAVES = 3;
const WAVE_SEGMENTS = 8;
const WAVE_K = 4;
const WAVE_SPEED = 2;
const WAVE_AMP = 0.125;
const WAVE_STEP = 0.25;
const RGBA_FLOATS = 4;
const waveTints = [[1, 0.3, 0.3], [0.3, 1, 0.3], [0.3, 0.3, 1]];

/** Per-instance offsets in a float DataTexture (the peopleGpu case), read with textureLoad. */
const waveOffsets = (() => {
  const data = new Float32Array(WAVES * RGBA_FLOATS);
  for (let i = 0; i < WAVES; i++) data.set([(i - 1) * WAVE_STEP, (i - 1) * WAVE_STEP, i * WAVE_STEP, 0], i * RGBA_FLOATS);
  const t = new DataTexture(data, WAVES, 1, RGBAFormat, FloatType);
  t.needsUpdate = true;
  return t;
})();

/** The game WGSL equivalent of the TSL below, line by line (the three's order of operations). */
const galleryWave: NativeModelDef = {
  name: 'galleryWave',
  paramFloats: RGBA_FLOATS,
  attributeTypes: { tint: 'vec3<f32>', mask: 'f32' },
  variant: (c) => (c.features.every((f) => f === 'instanced') ? [] : null),
  attributes: () => ['position', 'tint', 'mask'],
  wgsl: () => /* wgsl */ `
@group(2) @binding(2) var offsets : texture_2d<f32>;
struct VOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) tint : vec3<f32>,
  @location(1) mask : f32,
};
@vertex
fn vs(vin : VIn) -> VOut {
  var out : VOut;
  let local = nativeLocal(vin).xyz;
  let moved = (local + textureLoad(offsets, vec2<i32>(i32(vin.instance), 0), 0).xyz) + vec3<f32>(0.0, sin(local.x * ${WAVE_K}.0 + view.time * ${WAVE_SPEED}.0) * ${WAVE_AMP}, 0.0);
  let positionView = ((view.view * nativeModel(vin)) * vec4<f32>(moved, 1.0)).xyz;
  out.clip = view.projection * vec4<f32>(positionView, 1.0);
  out.tint = vin.tint;
  out.mask = vin.mask;
  return out;
}
@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  return max(vec4<f32>(mix(vec3<f32>(1.0), in.tint, in.mask), 1.0), vec4<f32>(0.0));
}`,
  writeParams: (_m, out) => out.fill(0),
  textures: () => [waveOffsets],
};
registerNativeMaterial('galleryWave', galleryWave);

/** Wavy quads: positionNode with shaderTime + DataTexture offset, colorNode with tint (instance) and mask (vertex). */
function waves(): InstancedMesh {
  const { attribute, instanceIndex, ivec2, mix, positionLocal, sin, textureLoad, vec3 } = TSL;
  const geo = new PlaneGeometry(QUAD, QUAD / 2, WAVE_SEGMENTS, 1);
  const pos = geo.getAttribute('position');
  const mask: number[] = [];
  for (let i = 0; i < pos.count; i++) mask.push(pos.getX(i) / QUAD + 0.5);
  geo.setAttribute('mask', new Float32BufferAttribute(mask, 1));
  geo.setAttribute('tint', new InstancedBufferAttribute(new Float32Array(waveTints.flat()), XYZ));
  const material = new MeshBasicNodeMaterial({ fog: false });
  material.positionNode = positionLocal
    .add(textureLoad(waveOffsets, ivec2(instanceIndex, 0)).xyz)
    .add(vec3(0, sin(positionLocal.x.mul(WAVE_K).add(shaderTime.mul(WAVE_SPEED))).mul(WAVE_AMP), 0));
  material.colorNode = mix(vec3(1), attribute('tint', 'vec3'), attribute('mask', 'float'));
  material.userData['nativeMaterial'] = 'galleryWave';
  const mesh = new InstancedMesh(geo, material, WAVES);
  mesh.frustumCulled = false;
  return mesh;
}

/** Two-bone cylinder with the upper bone bent (fixed pose), unlit: skinning in the core. */
function skinnedArm(): SkinnedMesh {
  const height = QUAD;
  const geo = new CylinderGeometry(SMALL_RADIUS / 2, SMALL_RADIUS / 2, height, SEGMENTS_H, SEGMENTS_H);
  const pos = geo.getAttribute('position');
  const index: number[] = [];
  const weight: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const up = pos.getY(i) / height + 0.5;
    index.push(0, 1, 0, 0);
    weight.push(1 - up, up, 0, 0);
  }
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(index, RGBA_FLOATS));
  geo.setAttribute('skinWeight', new Float32BufferAttribute(weight, RGBA_FLOATS));
  const mesh = new SkinnedMesh(geo, new MeshBasicMaterial({ color: 0xdd88ff }));
  const root = new Bone();
  const tip = new Bone();
  root.position.y = -height / 2;
  tip.position.y = height;
  root.add(tip);
  mesh.add(root);
  mesh.updateMatrixWorld(true); // bind pose = rest pose (bone inverses from these matrices)
  mesh.bind(new Skeleton([root, tip]));
  tip.rotation.z = WAVE_AMP * WAVE_K;
  mesh.frustumCulled = false;
  return mesh;
}

/** The material on a sphere that does not receive shadow (the loop below turns it on for all). */
function unshadowed(material: Material): (mesh: Mesh) => void {
  return (mesh) => {
    mesh.material = material;
    void Promise.resolve().then(() => {
      mesh.receiveShadow = false;
    });
  };
}

// ── Compacted instances (SPEC-0555, "Instâncias compactadas"): the DDD 61's breakable wires ──
// Every game update shows a different subset compacted at the front (setMatrixAt + count +
// addUpdateRange + needsUpdate); ?parityFreeze stops the game update, so the subset freezes.
const COMPACT_SIDE = 0.7;
const COMPACT_DROP = 3;
const COMPACT_FILL = 0.8;
const galleryUpdaters: Array<() => void> = [];

function compactedInstances(rows: number, cols: number): InstancedMesh {
  const total = rows * cols;
  const cell = COMPACT_SIDE / cols;
  const mesh = new InstancedMesh(new BoxGeometry(cell * COMPACT_FILL, cell * COMPACT_FILL, cell * COMPACT_FILL), new MeshLambertMaterial({ color: 0x3399dd }), total);
  const places: Matrix4[] = [];
  for (let i = 0; i < total; i++) {
    places.push(new Matrix4().makeTranslation((i % cols) * cell - COMPACT_SIDE / 2, Math.floor(i / cols) * (COMPACT_SIDE / rows) - COMPACT_SIDE / 2, 0));
  }
  let frame = 0;
  galleryUpdaters.push(() => {
    frame++;
    let n = 0;
    for (let i = 0; i < total; i++) if ((i + frame) % COMPACT_DROP !== 0) mesh.setMatrixAt(n++, places[i]!);
    mesh.count = n;
    mesh.instanceMatrix.addUpdateRange(0, n * MAT4_ELEMENTS);
    mesh.instanceMatrix.needsUpdate = true;
  });
  mesh.frustumCulled = false;
  return mesh;
}
const MAT4_ELEMENTS = 16;
// The three's InstanceNode: up to 1024 instances in a uniform buffer, above that an interleaved vertex buffer.
const UBO_ROWS = 10;
const UBO_COLS = 30;
const INTERLEAVED_ROWS = 32;
const INTERLEAVED_COLS = 40;

// ── Animated emissive (SPEC-0555, "Emissivo animado"): the DDD 61's window glass ──
// emissiveIntensity ramps every game update (city.ts setNight); ?parityFreeze freezes the ramp.
const GLOW_RAMP_PER_UPDATE = 0.01;
const GLOW_MAX = 1.5;
function ramping<M extends MeshLambertMaterial | MeshStandardMaterial>(glass: M): M {
  galleryUpdaters.push(() => {
    glass.emissiveIntensity = Math.min(GLOW_MAX, glass.emissiveIntensity + GLOW_RAMP_PER_UPDATE);
  });
  return glass;
}
const rampingGlass = (): Material =>
  ramping(new MeshLambertMaterial({ map: checker, vertexColors: true, emissive: new Color(1, 1, 1), emissiveMap: stripes, emissiveIntensity: 0 }));
// The DDD 61 Comercial facade (standard with an animated emissive).
const rampingFacade = (): Material =>
  ramping(new MeshStandardMaterial({ map: checker, roughness: 0.6, emissive: new Color(1, 0.8, 0.5), emissiveMap: stripes, emissiveIntensity: 0 }));

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
  ['unlit-transparent', new MeshBasicMaterial({ color: 0x3366ff, transparent: true, opacity: HALF_OPACITY }), false],
  ['unlit-additive', new MeshBasicMaterial({ color: 0xff6622, transparent: true, blending: AdditiveBlending, depthWrite: false }), false],
  ['unlit-transparent-double', new MeshBasicMaterial({ map: checker, transparent: true, opacity: HALF_OPACITY, side: DoubleSide }), false],
  ['unlit-instanced-color', cellWith(instancedSpheres()), false],
  ['unlit-particles', cellWith(particles()), false],
  ['unlit-coplanar', cellWith(...coplanar()), false],
  ['unlit-drawrange', cellWith(drawRangeMarks()), false],
  ['wgsl-wave', cellWith(waves()), false],
  ['unlit-skinned', cellWith(skinnedArm()), false],
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
  ['lambert-compacted-ubo', cellWith(compactedInstances(UBO_ROWS, UBO_COLS)), false],
  ['lambert-compacted-interleaved', cellWith(compactedInstances(INTERLEAVED_ROWS, INTERLEAVED_COLS)), false],
  ['lambert-emissive-ramp', unshadowed(rampingGlass()), true],
  ['standard-emissive-ramp', unshadowed(rampingFacade()), false],
];

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const game = new Game({ canvas });
game.onUpdate(() => galleryUpdaters.forEach((update) => update()));
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
