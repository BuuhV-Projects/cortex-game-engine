import { RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';

/**
 * Texturas de camada do {@link Terrain} por URL, compartilhadas entre TODOS os terrenos
 * (SPEC-0652): cada terreno pedindo a sua cópia relia e decodificava o mesmo arquivo — os
 * 176 terrenos do Port Hollow × 4 camadas estouravam o heap do host nativo.
 */
const layerTextures = new Map<string, Texture>();

/** Textura da camada `url` (carrega na 1ª vez; `RepeatWrapping` + sRGB). */
export function terrainLayerTexture(url: string): Texture {
  let texture = layerTextures.get(url);
  if (!texture) {
    texture = new TextureLoader().load(url);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
    texture.userData['cortexCached'] = true; // residente entre fases, como as do loadTexture
    layerTextures.set(url, texture);
  }
  return texture;
}

/** Descarta as texturas de camada compartilhadas (chamado pelo `clearSceneAssetCaches`). */
export function clearTerrainLayerTextures(): void {
  for (const texture of layerTextures.values()) texture.dispose();
  layerTextures.clear();
}
