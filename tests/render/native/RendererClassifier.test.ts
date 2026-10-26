import { describe, it, expect } from 'vitest';
import {
  BackSide,
  AdditiveBlending,
  BoxGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Line,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshNormalMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MultiplyBlending,
  PerspectiveCamera,
  Points,
  Scene,
  Texture,
} from 'three';
import { MeshBasicNodeMaterial, MeshLambertNodeMaterial } from 'three/webgpu';
import { color } from 'three/tsl';
import { OUTLINE_THICKNESS_KEY } from '../../../src/scene/Materials.js';
import { classifyDrawable, classLabel, NATIVE_MATERIAL_KEY } from '../../../src/render/native/RendererClassifier.js';
import { RendererCensus, formatCounts } from '../../../src/render/native/RendererCensus.js';

const geometry = new BoxGeometry();
const label = (mesh: Mesh): string => classLabel(classifyDrawable(mesh, mesh.material));

describe('classifyDrawable', () => {
  it('maps each three type to its fixed model, NodeMaterial family included', () => {
    expect(label(new Mesh(geometry, new MeshBasicMaterial()))).toBe('unlit+fog');
    expect(label(new Mesh(geometry, new MeshBasicNodeMaterial()))).toBe('unlit+fog');
    expect(label(new Mesh(geometry, new MeshLambertNodeMaterial()))).toBe('lambert+fog');
    expect(label(new Mesh(geometry, new MeshStandardMaterial()))).toBe('standard+fog');
  });

  it('collects the features in a stable order', () => {
    const map = new Texture();
    map.offset.set(0.5, 0);
    const material = new MeshLambertMaterial({ map, vertexColors: true, transparent: true, side: DoubleSide, alphaTest: 0.5 });
    const mesh = new Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    expect(label(mesh)).toBe('lambert+alphaTest+doubleSide+fog+map+receiveShadow+renderOrder+transparent+uvTransform+vertexColors');
  });

  it('covers physical with only ior/specular as standard, refuses clearcoat/transmission', () => {
    expect(label(new Mesh(geometry, new MeshPhysicalMaterial({ ior: 1.4, specularIntensity: 0.5 })))).toBe('standard+fog+specularIor');
    expect(label(new Mesh(geometry, new MeshPhysicalMaterial({ clearcoat: 1 })))).toBe('refused:physical:clearcoat');
    expect(label(new Mesh(geometry, new MeshPhysicalMaterial({ transmission: 1 })))).toBe('refused:physical:transmission');
  });

  it('refuses TSL nodes, except the engine outline shell and a registered game WGSL', () => {
    const tinted = new MeshLambertNodeMaterial();
    tinted.colorNode = color(1, 0, 0);
    expect(label(new Mesh(geometry, tinted))).toBe('refused:node:colorNode');

    const shell = new MeshBasicNodeMaterial({ side: 1 });
    shell.positionNode = color(0, 0, 0);
    shell.userData[OUTLINE_THICKNESS_KEY] = 0.02;
    expect(classifyDrawable(new Mesh(geometry, shell), shell)).toMatchObject({ kind: 'covered', model: 'outline' });

    tinted.userData[NATIVE_MATERIAL_KEY] = 'playerTint';
    expect(classifyDrawable(new Mesh(geometry, tinted), tinted)).toMatchObject({ kind: 'covered', model: 'wgsl:playerTint' });
  });

  it('refuses what no fixed model reproduces, with the reason', () => {
    expect(label(new Mesh(geometry, new MeshNormalMaterial()))).toBe('refused:type:MeshNormalMaterial');
    expect(label(new Mesh(geometry, new MeshStandardMaterial({ envMap: new Texture() })))).toBe('refused:map:envMap');
    expect(label(new Mesh(geometry, new MeshBasicMaterial({ wireframe: true })))).toBe('refused:wireframe');
    expect(label(new Mesh(geometry, new MeshBasicMaterial({ blending: MultiplyBlending })))).toBe(`refused:blending:${MultiplyBlending}`);
    expect(label(new Mesh(geometry, [new MeshBasicMaterial(), new MeshBasicMaterial()]))).toBe('refused:materialArray');
    expect(classLabel(classifyDrawable(new Points(geometry), new MeshBasicMaterial()))).toBe('refused:kind:Points');
    expect(classLabel(classifyDrawable(new Line(geometry), new MeshBasicMaterial()))).toBe('refused:kind:Line');

    const withCallback = new Mesh(geometry, new MeshBasicMaterial());
    withCallback.onBeforeRender = () => undefined;
    expect(label(withCallback)).toBe('refused:onBeforeRender');

    const morphed = new BoxGeometry();
    morphed.morphAttributes.position = [new Float32BufferAttribute(new Float32Array(72), 3)];
    expect(label(new Mesh(morphed, new MeshBasicMaterial()))).toBe('refused:morph');
  });

  it('covers color-write-off meshes (depth-only occluder) with noColorWrite, and keeps additive and instancing as features', () => {
    expect(label(new Mesh(geometry, new MeshBasicMaterial({ colorWrite: false })))).toBe('unlit+fog+noColorWrite');
    expect(label(new Mesh(geometry, new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false })))).toBe(
      'unlit+additive+fog+noDepthWrite',
    );
    const instanced = new InstancedMesh(geometry, new MeshLambertMaterial(), 4);
    instanced.setColorAt(0, new MeshBasicMaterial().color);
    expect(classLabel(classifyDrawable(instanced, instanced.material))).toBe('lambert+fog+instanceColor+instanced');
  });
});

describe('RendererCensus', () => {
  it('counts visible drawables in the frustum per class and records each material once', () => {
    const scene = new Scene();
    const inView = (material: MeshBasicMaterial | MeshLambertMaterial | MeshPhysicalMaterial): Mesh => {
      const mesh = new Mesh(geometry, material);
      mesh.position.set(0, 0, -5);
      scene.add(mesh);
      return mesh;
    };
    const shared = new MeshLambertMaterial();
    inView(shared);
    inView(shared);
    inView(new MeshPhysicalMaterial({ clearcoat: 1 }));
    inView(new MeshBasicMaterial({ colorWrite: false }));
    const hidden = inView(new MeshBasicMaterial());
    hidden.visible = false;
    const behind = new Mesh(geometry, new MeshBasicMaterial());
    behind.position.set(0, 0, 50);
    scene.add(behind);
    scene.updateMatrixWorld();
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);

    const events: Array<[string, Record<string, number | string>]> = [];
    new RendererCensus((name, data) => events.push([name, data])).sample(scene, camera);

    const census = events.find(([name]) => name === 'rendererCensus')![1];
    expect(census).toMatchObject({ objects: 4, covered: 3, refused: 1, skip: 0 });
    expect(census.classes).toBe('lambert+fog=2;refused:physical:clearcoat=1;unlit+fog+noColorWrite=1');
    expect(events.filter(([name]) => name === 'rendererCensusMaterial')).toHaveLength(3);
  });

  it('a lit model refusing a covered drawable counts as refused, not covered (SPEC-0535)', () => {
    const scene = new Scene();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ side: BackSide })); // lambert refuses BackSide
    mesh.position.set(0, 0, -5);
    scene.add(mesh);
    scene.updateMatrixWorld();
    const events: Array<[string, Record<string, number | string>]> = [];
    new RendererCensus((name, data) => events.push([name, data])).sample(scene, new PerspectiveCamera(60, 1, 0.1, 100));
    const census = events.find(([name]) => name === 'rendererCensus')![1];
    expect(census).toMatchObject({ objects: 1, covered: 0, refused: 1 });
    expect(census.lit).toBe('lambert:backSide=1');
  });

  it('formats counts largest first, ties by label', () => {
    expect(formatCounts(new Map([['b', 1], ['a', 1], ['c', 3]]))).toBe('c=3;a=1;b=1');
  });
});
