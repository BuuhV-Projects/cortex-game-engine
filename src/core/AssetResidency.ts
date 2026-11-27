/**
 * AssetResidency — o conjunto de GLBs residentes de um jogo, com orçamento em bytes (SPEC-0753, ADR-0754).
 *
 * Carrega sob demanda pelo {@link AssetLoader} e solta por orçamento, no desenho do `CStreaming` do GTA SA: um
 * contador de referências protege quem está vivo (`acquire`/`unref`), o dono protege o elenco de um trecho
 * (`hold`/`unhold`), e o `trim()` solta o residente usado há mais tempo (LRU) quando os bytes passam do orçamento.
 * Largar não é apagar: o que saiu da missão fica até precisar do espaço.
 *
 * O orçamento é teto de **descarte**, não de carga: um pedido nunca falha por falta de espaço.
 */
import * as THREE from 'three';
import { AssetLoader, type GLTF } from './AssetLoader.js';
import { debug } from './debug.js';

/** Escopo do `debug()` da residência. */
const DEBUG_SCOPE = 'assets';

/** Bytes por texel de textura não comprimida (RGBA8). */
const RGBA_BYTES_PER_TEXEL = 4;
/** Bytes por texel de textura comprimida (BC7/ASTC/ETC2: ~8 bits por texel). */
const COMPRESSED_BYTES_PER_TEXEL = 1;
/** Fator da cadeia de mips sobre o nível base (1 + 1/4 + 1/16 + … → 4/3). */
const MIP_CHAIN_FACTOR = 4 / 3;

// ─── Estimativa de bytes ──────────────────────────────────────────────────────

/** Bytes estimados de uma textura: largura × altura × bytes por texel, × 4/3 com mips. */
function textureBytes(texture: THREE.Texture): number {
  const image = texture.image as { width?: number; height?: number } | null | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  const compressed = (texture as Partial<THREE.CompressedTexture>).isCompressedTexture === true;
  const perTexel = compressed ? COMPRESSED_BYTES_PER_TEXEL : RGBA_BYTES_PER_TEXEL;
  const hasMips = compressed ? texture.mipmaps.length > 1 : texture.generateMipmaps;
  const base = width * height * perTexel;
  return hasMips ? base * MIP_CHAIN_FACTOR : base;
}

/**
 * Estimativa dos bytes de GPU/CPU de um GLTF (SPEC-0753): por textura distinta dos materiais (duas texturas
 * clonadas com a mesma imagem contam uma vez), largura × altura × 4 bytes (1 se comprimida), × 4/3 se tem mips;
 * mais o `array` de cada atributo e do índice de cada geometria distinta (o mesmo array conta uma vez).
 *
 * Aproximada: serve para comparar e decidir o descarte, não como medida da memória do processo.
 *
 * @param gltf - O GLTF carregado (só a `scene` é percorrida).
 * @returns Bytes estimados (inteiro, arredondado para cima).
 */
export function estimateGltfBytes(gltf: Pick<GLTF, 'scene'>): number {
  const images = new Set<unknown>();
  const arrays = new Set<ArrayBufferView>();
  const geometries = new Set<THREE.BufferGeometry>();
  let bytes = 0;
  const countTexture = (texture: THREE.Texture): void => {
    const key = texture.source ?? texture;
    if (images.has(key)) return;
    images.add(key);
    bytes += textureBytes(texture);
  };
  const countArray = (array: ArrayBufferView | undefined): void => {
    if (!array || arrays.has(array)) return;
    arrays.add(array);
    bytes += array.byteLength;
  };
  gltf.scene.traverse((obj) => {
    const mesh = obj as Partial<THREE.Mesh>;
    const geometry = mesh.geometry;
    if (geometry && !geometries.has(geometry)) {
      geometries.add(geometry);
      // os atributos e os alvos de morph (blendshape) de cada um
      const morphs = Object.values(geometry.morphAttributes).flat();
      for (const attr of [...Object.values(geometry.attributes), ...morphs]) {
        const data = (attr as Partial<THREE.InterleavedBufferAttribute>).data;
        countArray(data ? data.array : (attr as THREE.BufferAttribute).array);
      }
      countArray(geometry.index?.array);
    }
    const mat = mesh.material;
    const materials = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of materials) {
      for (const value of Object.values(m as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) countTexture(value);
      }
    }
  });
  return Math.ceil(bytes);
}

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/** O que a residência usa do loader: carregar um GLB e soltá-lo. O {@link AssetLoader} cumpre. */
export interface ResidencyLoader {
  /** Carrega (ou devolve o já carregado) o GLB da URL. */
  loadGLTF(url: string): Promise<GLTF>;
  /** Solta o GLB da URL (dispõe e fecha as imagens); `false` se não estava pronto. */
  release(url: string): boolean;
}

/** Opções de {@link AssetResidency}. */
export interface AssetResidencyOptions {
  /** Teto de bytes residentes estimados; acima dele o `trim()` solta o que está sem uso. */
  budgetBytes: number;
  /**
   * Loader das cargas e dos descartes. Padrão: um {@link AssetLoader} próprio da residência. Tem de ser exclusivo
   * dela: o descarte chama `release(url)`, que dispõe e fecha as imagens do GLTF que o mesmo cache entregaria a
   * outros sistemas.
   */
  loader?: ResidencyLoader;
  /** Estimativa de bytes de cada GLB, na chegada. Padrão: {@link estimateGltfBytes}. */
  sizeOf?: (gltf: GLTF) => number;
  /**
   * Chamado antes do `release` de cada URL descartada, para o jogo largar o que derivou do GLTF. A URL já saiu da
   * residência; o `onEvict` não pode chamar a residência (pedir, soltar, segurar).
   */
  onEvict?: (url: string, gltf: GLTF) => void;
}

/** Opções de {@link AssetResidency.request}. */
export interface RequestOptions {
  /** Conta um usuário vivo desde o pedido (o `acquire` atômico; desfeito se a carga falhar). */
  acquire?: boolean;
}

/** Contadores da residência ({@link AssetResidency.stats}). */
export interface AssetResidencyStats {
  /** URLs residentes agora. */
  resident: number;
  /** Bytes estimados dos residentes. */
  bytes: number;
  /** O orçamento configurado. */
  budgetBytes: number;
  /** Cargas que chegaram (contadas uma vez por chegada; recarga após descarte conta de novo). */
  loads: number;
  /** URLs soltas pelo `trim()` ou pelo `release()`. */
  evictions: number;
  /** Vezes que o `trim()` terminou acima do orçamento porque tudo estava em uso ou seguro. */
  overBudget: number;
}

/** Estado de uma URL conhecida pela residência. */
interface Entry {
  /** Usuários vivos (`acquire` − `unref`). */
  refs: number;
  /** Donos que seguram a URL (`hold`). */
  owners: Set<string>;
  /** O GLTF residente (ausente enquanto em carga ou depois do descarte). */
  gltf?: GLTF;
  /** Bytes estimados do residente. */
  bytes: number;
  /** A carga em andamento. */
  pending?: Promise<GLTF>;
}

// ─── Classe ───────────────────────────────────────────────────────────────────

/**
 * Conjunto de GLBs residentes com orçamento em bytes, contador de referências, donos e descarte do usado há mais
 * tempo (SPEC-0753, ADR-0754).
 *
 * Quem clona o GLTF residente compartilha geometria, material e textura com ele: chame `acquire` por clone vivo e
 * `unref` quando ele sair, senão o `trim()` pode soltar o modelo de um boneco à mostra.
 *
 * @example
 * ```ts
 * const skins = new AssetResidency({ budgetBytes: 512 * 2 ** 20, onEvict: (url) => templates.delete(url) });
 * await skins.hold('mission-3', urlsDaMissao3); // carrega e segura o elenco
 * const gltf = skins.get(url);                  // síncrono: o residente (ou undefined)
 * skins.acquire(url);                           // um boneco vivo usa o modelo
 * skins.unref(url);                             // o boneco saiu
 * skins.unhold('mission-3');                    // a missão acabou: descartável, não apagado
 * ```
 */
export class AssetResidency {
  private readonly _budgetBytes: number;
  private readonly _loader: ResidencyLoader;
  private readonly _sizeOf: (gltf: GLTF) => number;
  private readonly _onEvict: ((url: string, gltf: GLTF) => void) | undefined;

  /** Toda URL com algum estado (contador, dono, carga ou residente). */
  private readonly _entries = new Map<string, Entry>();
  /** Residentes em ordem de uso: o primeiro é o usado há mais tempo (reinserir move para o fim). */
  private readonly _lru = new Map<string, true>();
  /** Dono → URLs que ele segura. */
  private readonly _owners = new Map<string, Set<string>>();

  private _bytes = 0;
  private _loads = 0;
  private _evictions = 0;
  private _overBudget = 0;

  constructor(options: AssetResidencyOptions) {
    this._budgetBytes = options.budgetBytes;
    this._loader = options.loader ?? new AssetLoader();
    this._sizeOf = options.sizeOf ?? estimateGltfBytes;
    this._onEvict = options.onEvict;
  }

  /**
   * Carrega a URL (a carga em andamento é dividida), marca como usada agora e roda o {@link trim}, que nunca solta
   * a própria URL pedida.
   *
   * Sem `acquire`, nada protege o GLTF depois que o `request` devolve: outra carga que chega na mesma rodada de
   * microtasks (no host nativo o `fetch` é síncrono) pode soltá-lo antes de quem pediu chamar o `acquire`. Quem vai
   * usar o GLTF passa `{ acquire: true }`: o contador vale desde o pedido, antes de a carga chegar, como o
   * `REQUEST_MODEL` do GTA SA, que marca o modelo antes de ler. Se a carga falha, esse `acquire` é desfeito.
   *
   * @returns O GLTF residente. Rejeita se a carga falhar (a próxima chamada tenta de novo).
   */
  request(url: string, options?: RequestOptions): Promise<GLTF> {
    const entry = this._entry(url);
    if (options?.acquire) this.acquire(url);
    if (entry.gltf) {
      this._touch(url);
      this._trim(url);
      return Promise.resolve(entry.gltf);
    }
    entry.pending ??= this._load(url, entry);
    if (!options?.acquire) return entry.pending;
    return entry.pending.catch((error: unknown) => {
      this.unref(url);
      throw error;
    });
  }

  /** O GLTF residente da URL, marcado como usado agora; `undefined` se não está pronto. */
  get(url: string): GLTF | undefined {
    const gltf = this._entries.get(url)?.gltf;
    if (gltf) this._touch(url);
    return gltf;
  }

  /** Se a URL está residente (só consulta: não mexe na ordem de uso). */
  isResident(url: string): boolean {
    return this._entries.get(url)?.gltf !== undefined;
  }

  /** Mais um usuário vivo da URL (um clone à mostra). Pode vir antes de a carga terminar. */
  acquire(url: string): void {
    const entry = this._entry(url);
    entry.refs += 1;
    if (entry.gltf) this._touch(url);
  }

  /** Um usuário vivo da URL saiu. Abaixo de zero é erro de quem chama: fica em zero (e loga no `debug`). */
  unref(url: string): void {
    const entry = this._entries.get(url);
    if (!entry || entry.refs === 0) {
      debug(DEBUG_SCOPE, `AssetResidency.unref sem acquire: ${url}`);
      return;
    }
    entry.refs -= 1;
    this._prune(url, entry);
  }

  /**
   * Segura as URLs em nome de `owner` e pede todas. A URL fica segura enquanto algum dono a segura. Se uma carga
   * falha, a marca do dono sai daquela URL e a promessa rejeita; as outras seguem seguras até o `unhold`.
   *
   * @returns Os GLTFs na ordem de `urls`.
   */
  hold(owner: string, urls: readonly string[]): Promise<GLTF[]> {
    let held = this._owners.get(owner);
    if (!held) {
      held = new Set();
      this._owners.set(owner, held);
    }
    for (const url of urls) {
      this._entry(url).owners.add(owner);
      held.add(url);
    }
    return Promise.all(
      urls.map((url) =>
        this.request(url).catch((error: unknown) => {
          this._dropOwner(owner, url);
          throw error;
        }),
      ),
    );
  }

  /** Tira a marca de `owner` das URLs dele: ficam descartáveis (sem contador nem outro dono), não soltas na hora. */
  unhold(owner: string): void {
    const held = this._owners.get(owner);
    if (!held) return;
    for (const url of [...held]) this._dropOwner(owner, url);
  }

  /**
   * Enquanto os bytes residentes passam do orçamento, solta o residente usado há mais tempo sem contador nem dono
   * (`onEvict` antes, `loader.release` depois). Se o resto está em uso ou seguro, para e conta em
   * `stats.overBudget`. Nunca solta o que ainda está em carga.
   */
  trim(): void {
    this._trim(undefined);
  }

  /**
   * Solta na hora uma URL residente sem uso (o jogo que sabe o que faz), com `onEvict` e `loader.release`.
   *
   * @returns `true` se soltou; `false` com contador, dono, em carga ou não residente (nada é feito).
   */
  release(url: string): boolean {
    const entry = this._entries.get(url);
    if (!entry?.gltf || !this._evictable(entry)) return false;
    this._evict(url, entry);
    return true;
  }

  /** Contadores atuais (cópia). */
  get stats(): AssetResidencyStats {
    return {
      resident: this._lru.size,
      bytes: this._bytes,
      budgetBytes: this._budgetBytes,
      loads: this._loads,
      evictions: this._evictions,
      overBudget: this._overBudget,
    };
  }

  // ─── Internos ───────────────────────────────────────────────────────────────

  private async _load(url: string, entry: Entry): Promise<GLTF> {
    let gltf: GLTF;
    try {
      // O loader roda num microtask: um `throw` síncrono dele só chega aqui depois de o `request` gravar a
      // promessa em `entry.pending`, e a limpeza abaixo não deixa a promessa rejeitada presa na entrada.
      gltf = await Promise.resolve().then(() => this._loader.loadGLTF(url));
    } catch (error) {
      entry.pending = undefined;
      this._prune(url, entry);
      throw error;
    }
    let bytes: number;
    try {
      // antes de gravar o GLTF: um `sizeOf` que lança não deixa um residente fora da LRU e do orçamento
      bytes = this._sizeOf(gltf);
    } catch (error) {
      entry.pending = undefined;
      this._prune(url, entry);
      throw error;
    }
    entry.pending = undefined;
    entry.gltf = gltf;
    entry.bytes = bytes;
    this._bytes += entry.bytes;
    this._loads += 1;
    this._touch(url);
    this._trim(url);
    return gltf;
  }

  /** O `trim`, protegendo `keep` (a URL que acabou de chegar). */
  private _trim(keep: string | undefined): void {
    if (this._bytes <= this._budgetBytes) return;
    for (const url of [...this._lru.keys()]) {
      if (this._bytes <= this._budgetBytes) return;
      const entry = this._entries.get(url);
      if (url === keep || !entry || !this._evictable(entry)) continue;
      this._evict(url, entry);
    }
    if (this._bytes > this._budgetBytes) {
      this._overBudget += 1;
      debug(DEBUG_SCOPE, `AssetResidency acima do orçamento: ${this._bytes}/${this._budgetBytes} bytes em uso`);
    }
  }

  private _evictable(entry: Entry): boolean {
    return entry.refs === 0 && entry.owners.size === 0 && entry.pending === undefined;
  }

  private _evict(url: string, entry: Entry): void {
    const gltf = entry.gltf;
    if (!gltf) return;
    // sai da LRU e do orçamento antes do `onEvict`: um `trim` aninhado não solta a mesma URL de novo
    this._bytes -= entry.bytes;
    entry.gltf = undefined;
    entry.bytes = 0;
    this._lru.delete(url);
    this._evictions += 1;
    try {
      this._onEvict?.(url, gltf);
    } catch (error) {
      debug(DEBUG_SCOPE, `AssetResidency.onEvict falhou em ${url}:`, error);
    }
    this._loader.release(url);
    this._prune(url, entry);
  }

  private _dropOwner(owner: string, url: string): void {
    const held = this._owners.get(owner);
    held?.delete(url);
    if (held?.size === 0) this._owners.delete(owner);
    const entry = this._entries.get(url);
    if (!entry) return;
    entry.owners.delete(owner);
    this._prune(url, entry);
  }

  private _entry(url: string): Entry {
    let entry = this._entries.get(url);
    if (!entry) {
      entry = { refs: 0, owners: new Set(), bytes: 0 };
      this._entries.set(url, entry);
    }
    return entry;
  }

  /** Esquece a URL que não tem mais estado nenhum. */
  private _prune(url: string, entry: Entry): void {
    if (entry.refs === 0 && entry.owners.size === 0 && !entry.pending && !entry.gltf) this._entries.delete(url);
  }

  private _touch(url: string): void {
    this._lru.delete(url);
    this._lru.set(url, true);
  }
}
