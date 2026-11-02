/**
 * Material de pintura do terreno (splat de até 4 camadas): o `colorNode` TSL que o Studio desenha e,
 * no export, o mesmo material marcado para o modelo nativo `terrainSplat` (SPEC-0662), que reproduz
 * o blend em WGSL com a iluminação do `standard` em vez de devolver o terreno ao three em JS.
 */
import { DataTexture, RGBAFormat, UnsignedByteType, type Texture } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { texture as textureNode, uv, uniform, mix, clamp, max } from 'three/tsl';
import { registerNativeMaterial } from '../render/native/GameMaterials.js';
import { NATIVE_MATERIAL_KEY } from '../render/native/RendererClassifier.js';
import { TERRAIN_SPLAT_MATERIAL, setTerrainSplatSource, terrainSplatModel } from '../render/native/models/terrainSplat.js';

/** Camadas do splat (um canal RGBA do splatmap por camada). */
export const TERRAIN_SPLAT_LAYERS = 4;
/** Piso da soma dos pesos na média ponderada (o mesmo do WGSL nativo). */
const WEIGHT_FLOOR = 1e-4;

registerNativeMaterial(TERRAIN_SPLAT_MATERIAL, terrainSplatModel);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const uniformNumber = (v: number) => uniform(v);
/** Nó uniform do tiling de uma camada (`.value` muda ao vivo). */
export type TerrainRepeatNode = ReturnType<typeof uniformNumber>;
/** Nó de textura de uma camada (`.value` troca a textura ao vivo). */
export type TerrainLayerNode = ReturnType<typeof textureNode>;

export interface TerrainSplatMaterial {
  material: MeshStandardNodeMaterial;
  /** Nó do splatmap (`.value` troca o splatmap sem reconstruir o material). */
  splat: TerrainLayerNode;
  layers: TerrainLayerNode[];
  repeats: TerrainRepeatNode[];
}

let white: DataTexture | null = null;
/** Textura 1×1 branca de uma camada ainda sem imagem. */
function whiteTexture(): DataTexture {
  if (white === null) {
    white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    white.needsUpdate = true;
  }
  return white;
}

/**
 * Monta o material: `mix(cor base, média ponderada das camadas, clamp(soma dos pesos))`. A cor base é a
 * `material.color` (a mesma instância de `Color`, edições propagam ao vivo).
 */
export function buildTerrainSplatMaterial(splat: Texture): TerrainSplatMaterial {
  const uvNode = uv();
  const splatNode = textureNode(splat, uvNode);
  const repeats = Array.from({ length: TERRAIN_SPLAT_LAYERS }, () => uniformNumber(1));
  const layers = repeats.map((r) => textureNode(whiteTexture(), uvNode.mul(r)));
  const [t0, t1, t2, t3] = layers;
  const wsum = splatNode.r.add(splatNode.g).add(splatNode.b).add(splatNode.a);
  const blended = t0!.rgb
    .mul(splatNode.r)
    .add(t1!.rgb.mul(splatNode.g))
    .add(t2!.rgb.mul(splatNode.b))
    .add(t3!.rgb.mul(splatNode.a))
    .div(max(wsum, WEIGHT_FLOOR)); // média ponderada quando a soma estoura 1

  const material = new MeshStandardNodeMaterial();
  // Soma < 1 = mistura com a cor base.
  material.colorNode = mix(uniform(material.color).rgb, blended, clamp(wsum, 0, 1));
  material.userData[NATIVE_MATERIAL_KEY] = TERRAIN_SPLAT_MATERIAL;
  setTerrainSplatSource(material, { splat: splatNode, layers, repeats });
  return { material, splat: splatNode, layers, repeats };
}
