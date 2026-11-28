/**
 * Imagens soltas cozidas para KTX2 no export (SPEC-0755, ADR-0756).
 *
 * O cook grava, para cada imagem da lista `cookTextures` do `cortex.json`, um
 * `<arquivo>.ktx2` ao lado do original e o manifesto
 * `assets/cooked-textures.json` (`{ "<url do original>": "<url do .ktx2>" }`)
 * dentro do pak. No host nativo, o `loadTexture` público consulta esse
 * manifesto e carrega a versão BC7 no lugar do PNG/JPG. No navegador (dev) o
 * manifesto não existe e nada muda.
 */
import { NearestFilter, type Texture } from 'three';
import { debug } from '../core/debug.js';
import { hasNativeKtx2, loadKtx2, releaseKtx2TexturesAfterUpload } from '../core/loadKtx2.js';

/** URL do manifesto que o cook grava no pak. */
export const COOKED_TEXTURES_MANIFEST_URL = 'assets/cooked-textures.json';

let manifest: Promise<ReadonlyMap<string, string>> | null = null;
/** A leitura do manifesto já falhou uma vez nesta sessão (o aviso sai uma vez só). */
let manifestWarned = false;

/** A URL como o cook a grava: relativa à pasta do jogo, sem `./` nem `/` na frente. */
function manifestKey(url: string): string {
  return url.replace(/\\/g, '/').replace(/^(?:\.\/|\/)+/, '');
}

/** Um aviso por sessão: o manifesto que falta ou não se lê não enche o log. */
function warnManifest(what: string): void {
  if (manifestWarned) return;
  manifestWarned = true;
  debug('assets', `manifesto de texturas cozidas ${what} — segue com os originais`);
}

async function fetchManifest(): Promise<ReadonlyMap<string, string>> {
  const empty = new Map<string, string>();
  let res: Response;
  try {
    res = await fetch(COOKED_TEXTURES_MANIFEST_URL);
  } catch (err) {
    // Falha transitória (o fetch lançou): não fica guardada, a próxima chamada tenta de novo.
    manifest = null;
    warnManifest(`sem leitura (${String(err)}), tenta de novo na próxima textura`);
    return empty;
  }
  // As respostas definitivas ficam guardadas: 404 (o export sem lista) e o JSON ilegível ou que não é objeto.
  if (!res.ok) return empty;
  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    warnManifest(`ilegível (${String(err)})`);
    return empty;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const map = new Map<string, string>();
  for (const [from, to] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof to === 'string') map.set(manifestKey(from), to);
  }
  return map;
}

/** O manifesto, lido uma vez (só no host; no navegador é sempre vazio, sem pedir nada). */
function cookedManifest(): Promise<ReadonlyMap<string, string>> {
  if (!hasNativeKtx2()) return Promise.resolve(new Map());
  manifest ??= fetchManifest();
  return manifest;
}

/**
 * A URL do `.ktx2` que o export cozinhou para a imagem `url`, ou `null` quando
 * ela não está na lista `cookTextures` do jogo, quando o manifesto falta ou fora
 * do host nativo (no navegador, sempre `null`).
 *
 * É assíncrona: a primeira chamada lê o manifesto do pak (uma vez por sessão) e
 * as seguintes respondem do que já foi lido. O `loadTexture` público já faz essa
 * troca sozinho; use esta função só quando carregar a imagem por outro caminho.
 *
 * @param url - A URL do original, como o jogo a pede (ex.: `'assets/sky/dia.png'`).
 * @returns A URL do `.ktx2` cozido ou `null`.
 *
 * @example
 * const ktx2 = await cookedTextureUrl('assets/vehicles/paint/red.png')
 * const tex = ktx2 ? await loadKtx2(ktx2) : await new AssetLoader().loadTexture('assets/vehicles/paint/red.png')
 */
export async function cookedTextureUrl(url: string): Promise<string | null> {
  return (await cookedManifest()).get(manifestKey(url)) ?? null;
}

/** Cargas em curso por URL do `.ktx2` e `pixelated`: duas chamadas iguais juntas dividem a mesma textura. */
const pending = new Map<string, Promise<Texture>>();

type Mip = { data: Uint8Array | null };

/** Os dados BC7 já saíram da CPU (o primeiro upload passou). */
const released = (tex: Texture): boolean => {
  const mips = (tex as Texture & { mipmaps?: Mip[] }).mipmaps;
  return !!mips && mips.length > 0 && mips.every((m) => m.data === null);
};

/** O `needsUpdate` herdado do three (o setter do protótipo). */
function protoNeedsUpdate(tex: Texture): ((this: Texture, v: boolean) => void) | undefined {
  for (let p: object | null = Object.getPrototypeOf(tex); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, 'needsUpdate');
    if (d?.set) return d.set as (this: Texture, v: boolean) => void;
  }
  return undefined;
}

/**
 * A textura do cache é dividida por quem pede a mesma URL e fica viva entre cenas, mas os dados BC7 saem da CPU no
 * primeiro upload: um `needsUpdate` depois disso subiria nada (`writeTexture` com `null`). Ele vira no-op, com um
 * aviso, e a GPU segue com a textura que já tem. O `clone()` depois do upload avisa: a cópia sobe vazia.
 */
function guardAfterRelease(tex: Texture, url: string): void {
  const set = protoNeedsUpdate(tex);
  if (!set) return;
  let warned = false;
  const warn = (what: string): void => {
    if (warned) return;
    warned = true;
    debug('assets', `${url}: ${what} depois do upload (os dados BC7 já saíram da CPU) — segue com a textura da GPU`);
  };
  Object.defineProperty(tex, 'needsUpdate', {
    configurable: true,
    set(value: boolean) {
      if (value && released(tex)) return warn('needsUpdate ignorado');
      set.call(tex, value);
    },
  });
  const clone = tex.clone.bind(tex);
  tex.clone = () => {
    if (released(tex)) warn('clone() sobe vazio');
    return clone();
  };
}

/**
 * Carrega o `.ktx2` cozido de uma imagem solta: a `CompressedTexture` BC7 (com os
 * mips do arquivo) do `loadKtx2`, com `pixelated` em nearest, e os dados BC7
 * soltos da CPU depois do primeiro upload.
 * @internal
 */
export function loadCookedTexture(ktx2Url: string, pixelated: boolean): Promise<Texture> {
  // o `pixelated` muda a textura (filtros e níveis): entra na chave, senão a segunda chamada pegaria a da primeira
  const key = `${ktx2Url}|${pixelated}`;
  let load = pending.get(key);
  if (!load) {
    load = loadKtx2(ktx2Url)
      .then((tex) => {
        if (pixelated) {
          // Pixel art, como no PNG pixelado: nearest e um nível só. Com a cadeia do arquivo, o WebGPU amostraria
          // os mips menores na textura reduzida (`mipmapFilter: 'nearest'` sem `lodMaxClamp`).
          tex.magFilter = NearestFilter;
          tex.minFilter = NearestFilter;
          const c = tex as Texture & { mipmaps?: unknown[] };
          if (c.mipmaps && c.mipmaps.length > 1) c.mipmaps = c.mipmaps.slice(0, 1);
        }
        releaseKtx2TexturesAfterUpload([tex]);
        guardAfterRelease(tex, ktx2Url);
        return tex;
      })
      .finally(() => pending.delete(key));
    pending.set(key, load);
  }
  return load;
}

/** Esquece o manifesto lido (só para teste). @internal */
export function resetCookedTextures(): void {
  manifest = null;
  manifestWarned = false;
  pending.clear();
}
