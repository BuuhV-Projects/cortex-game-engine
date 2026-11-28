/**
 * Cache de textura ladrilhada por URL (SPEC-0757, ADR-0758): a camada do terreno e a textura de estrada.
 *
 * Uma textura por URL, com as opções do uso aplicadas uma vez, antes do primeiro upload, e sem clone: a BC7 cozida
 * (SPEC-0755) solta os dados da CPU no primeiro upload, e um clone dela subiria vazio. No host, o `.ktx2` do manifesto
 * entra no lugar do original; no navegador, o original pelo `TextureLoader`.
 */
import { TextureLoader, type Texture } from 'three';
import { loadLooseTexture } from './cookedTextures.js';

/** O cache de um uso ladrilhado. */
export interface TiledTextureCache {
  /** A textura de `url` (carrega na 1ª vez; cargas juntas dividem a mesma). */
  get(url: string): Promise<Texture>;
  /** Descarta as texturas que chegaram e esquece as cargas. */
  clear(): void;
}

/** Cria o cache de um uso: `configure` recebe cada textura nova uma vez, antes do primeiro upload. */
export function tiledTextureCache(configure: (texture: Texture) => void): TiledTextureCache {
  const loads = new Map<string, Promise<Texture>>();
  const live = new Set<Texture>();
  // sobe a cada `clear()`: a carga que chega depois dele é de antes do despejo e não entra no cache
  let generation = 0;
  return {
    get(url) {
      let load = loads.get(url);
      if (!load) {
        const born = generation;
        load = loadLooseTexture(url, false, () => new TextureLoader().loadAsync(url)).then((texture) => {
          if (born !== generation) {
            texture.dispose();
            throw new Error(`${url}: carga descartada pelo clear() do cache`);
          }
          configure(texture);
          live.add(texture);
          return texture;
        });
        const mine = load;
        // a carga que falha sai do cache: a próxima chamada tenta de novo
        mine.catch(() => {
          if (loads.get(url) === mine) loads.delete(url);
        });
        loads.set(url, load);
      }
      return load;
    },
    clear() {
      generation++;
      for (const texture of live) texture.dispose();
      live.clear();
      loads.clear();
    },
  };
}
