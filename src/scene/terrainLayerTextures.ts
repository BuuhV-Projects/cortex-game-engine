import { RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { tiledTextureCache } from './tiledTextures.js';

/**
 * Texturas de camada do {@link Terrain} por URL, compartilhadas entre TODOS os terrenos
 * (SPEC-0652): cada terreno pedindo a sua cópia relia e decodificava o mesmo arquivo — os
 * 176 terrenos do Port Hollow × 4 camadas estouravam o heap do host nativo. No host, a
 * imagem da lista `cookTextures` sobe pelo `.ktx2` cozido (SPEC-0757).
 */
const layerTextures = tiledTextureCache((texture) => {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.userData['cortexCached'] = true; // residente entre fases, como as do loadTexture
});

/** Textura da camada `url` (carrega na 1ª vez; `RepeatWrapping` + sRGB). */
export function terrainLayerTexture(url: string): Promise<Texture> {
  return layerTextures.get(url);
}

/** Descarta as texturas de camada compartilhadas (chamado pelo `clearSceneAssetCaches`). */
export function clearTerrainLayerTextures(): void {
  layerTextures.clear();
}
