import { RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { tiledTextureCache } from './tiledTextures.js';

/** Anisotropia da textura de estrada (a pista vista de raspão). */
export const ROAD_ANISOTROPY = 8;

/**
 * Textura de estrada por URL (SPEC-0757, ADR-0758): todas as estradas com a mesma textura dividem uma, sem clone. No
 * host, a imagem da lista `cookTextures` sobe pelo `.ktx2` cozido.
 */
const roadTextures = tiledTextureCache((texture) => {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = ROAD_ANISOTROPY;
  texture.userData['cortexCached'] = true; // residente entre fases, como as do loadTexture
});

/** A textura de estrada `url` (carrega na 1ª vez; `RepeatWrapping`, sRGB e anisotropia). */
export function roadTexture(url: string): Promise<Texture> {
  return roadTextures.get(url);
}

/** Descarta as texturas de estrada (chamado pelo `clearSceneAssetCaches`). */
export function clearRoadTextures(): void {
  roadTextures.clear();
}
