/**
 * `doubleSide` e `alpha` fora da variante dos modelos lit (SPEC-0732): as variantes que só diferiam por eles dão o
 * mesmo WGSL, o opaco continua com alpha 1 pelo parâmetro `litFlags.x`, e o sinal da face continua no código.
 */
import { describe, expect, it } from 'vitest';
import { AdditiveBlending, BoxGeometry, DoubleSide, FrontSide, Mesh, MeshLambertMaterial, MeshStandardMaterial, PerspectiveCamera, Scene, Texture, type Material } from 'three';
import { classifyDrawable, type Classification } from '../../../src/render/native/RendererClassifier.js';
import { LightsBlock } from '../../../src/render/native/frame/lights.js';
import { LIT_OPAQUE_AT, lambertModel } from '../../../src/render/native/models/lambert.js';
import { standardModel } from '../../../src/render/native/models/standard.js';
import { CORE_FEATURES, isOpaqueMaterial } from '../../../src/render/native/nativeRendererShared.js';
import type { NativeModelDef } from '../../../src/render/native/models/NativeModel.js';

type Covered = Classification & { kind: 'covered' };

function lightsReady(): void {
  const block = new LightsBlock({ createBuffer: () => ({}), queue: { writeBuffer: () => undefined } });
  const cam = new PerspectiveCamera();
  cam.updateMatrixWorld();
  block.update(new Scene(), cam);
}

/** A variante como o núcleo a pede (`NativeRenderer._build`): sem os recursos do núcleo, com `alpha` se não for opaco. */
function variant(model: NativeModelDef, material: Material): string[] | null {
  const mesh = new Mesh(new BoxGeometry(), material);
  mesh.receiveShadow = true;
  const c = classifyDrawable(mesh, material) as Covered;
  const features = c.features.filter((f) => !CORE_FEATURES.has(f));
  if (!isOpaqueMaterial(material)) features.push('alpha');
  return model.variant({ ...c, features: features.sort() }, mesh, material);
}

describe('variantes lit enxutas (SPEC-0732)', () => {
  it('FrontSide e DoubleSide, opaco e transparente: a mesma variante e o mesmo WGSL, no lambert e no standard', () => {
    lightsReady();
    const map = new Texture();
    for (const [model, make] of [
      [lambertModel, (o: object) => new MeshLambertMaterial({ map, ...o })],
      [standardModel, (o: object) => new MeshStandardMaterial({ map, ...o })],
    ] as const) {
      const materials = [
        make({ side: FrontSide }),
        make({ side: DoubleSide }),
        make({ side: FrontSide, transparent: true }),
        make({ side: DoubleSide, transparent: true, opacity: 0.5 }),
      ];
      const variants = materials.map((m) => variant(model, m));
      expect(variants.every((v) => v !== null && !v.includes('doubleSide') && !v.includes('alpha'))).toBe(true);
      expect(new Set(variants.map((v) => v!.join('+'))).size).toBe(1);
      expect(new Set(variants.map((v) => model.wgsl(v!))).size).toBe(1);
    }
  });

  it('o alphaTest continua variante (o discard só entra nele)', () => {
    lightsReady();
    const plain = variant(lambertModel, new MeshLambertMaterial());
    const tested = variant(lambertModel, new MeshLambertMaterial({ alphaTest: 0.5 }));
    expect(tested).toContain('alphaTest');
    expect(lambertModel.wgsl(plain!)).not.toContain('discard');
    expect(lambertModel.wgsl(tested!)).toContain('discard');
  });

  it('o opaco escreve litFlags.x = 1 (alpha 1); transparente ou blending aditivo, 0 (o alpha real)', () => {
    for (const model of [lambertModel, standardModel]) {
      const out = new Float32Array(model.paramFloats);
      model.writeParams(new MeshStandardMaterial({ opacity: 0.3 }), out);
      expect(out[LIT_OPAQUE_AT]).toBe(1);
      model.writeParams(new MeshStandardMaterial({ transparent: true, opacity: 0.3 }), out);
      expect(out[LIT_OPAQUE_AT]).toBe(0);
      model.writeParams(new MeshStandardMaterial({ blending: AdditiveBlending }), out);
      expect(out[LIT_OPAQUE_AT]).toBe(0);
    }
    const code = lambertModel.wgsl([]);
    expect(code).toContain('litFlags : vec4<f32>,');
    expect(code).toContain('diffuse.w = select(diffuse.w, 1.0, params.litFlags.x != 0.0);');
    // O alpha sai na cor depois do select: o opaco com 1, o transparente com o real.
    expect(code.indexOf('diffuse.w = select(')).toBeLessThan(code.indexOf('vec4<f32>(outgoingLight + emissive, diffuse.w)'));
  });

  it('a normal sempre leva o sinal da face (inverte na face de trás do DoubleSide; 1 no FrontSide)', () => {
    for (const code of [lambertModel.wgsl([]), standardModel.wgsl(['map', 'normalMap'])]) {
      expect(code).toContain('let frontSign = (f32(isFront) * 2.0) - 1.0;');
      expect(code).toContain('var normal = normalGeometry * vec3<f32>(frontSign);');
      expect(code).toContain('@builtin(front_facing) isFront : bool');
    }
    // O normal map também vira o TBN pela face.
    expect(standardModel.wgsl(['map', 'normalMap'])).toContain('let faceSign = frontSign;');
  });
});
