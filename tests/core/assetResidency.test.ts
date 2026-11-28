/**
 * SPEC-0753 / ADR-0754 — `AssetResidency`: orçamento em bytes, ordem do usado há mais tempo, contador e dono
 * protegem, `unhold` não solta na hora, `onEvict` antes do `release`, `overBudget` e a estimativa de bytes.
 *
 * O loader é falso (`{ loadGLTF, release }`): cada URL resolve um GLTF com os bytes do mapa `sizes`, na hora ou
 * quando o teste abre o portão (`gate`).
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { AssetResidency, estimateGltfBytes, type AssetResidencyOptions } from '../../src/core/AssetResidency.js';
import type { GLTF } from '../../src/core/AssetLoader.js';

/** Orçamento dos testes; cada GLB pesa {@link UNIT} (três cabem, quatro não). */
const BUDGET = 100;
const UNIT = 30;
/** Microtasks que o teste espera a carga chegar ao loader falso. */
const MAX_TICKS = 10;

/** GLTF falso com os bytes que o `sizeOf` do teste lê. */
function fakeGltf(bytes: number): GLTF {
  return { scene: new THREE.Group(), animations: [], bytes } as unknown as GLTF;
}

/** Loader falso; `gated` guarda as URLs que só resolvem com `open(url)`. */
function fakeLoader(gated: string[] = []) {
  const calls: string[] = [];
  const gates = new Map<string, { resolve: () => void; reject: (e: unknown) => void }>();
  const failures = new Set<string>();
  const loader = {
    loadGLTF: vi.fn((url: string): Promise<GLTF> => {
      calls.push(`load:${url}`);
      if (failures.has(url)) return Promise.reject(new Error(`falhou ${url}`));
      const gltf = fakeGltf(UNIT);
      if (!gated.includes(url)) return Promise.resolve(gltf);
      return new Promise<GLTF>((resolve, reject) => {
        gates.set(url, { resolve: () => resolve(gltf), reject });
      });
    }),
    release: vi.fn((url: string) => {
      calls.push(`release:${url}`);
      return true;
    }),
  };
  /** A residência chama o loader num microtask: espera o portão existir antes de mexer nele. */
  const gateOf = async (url: string) => {
    for (let i = 0; i < MAX_TICKS && !gates.has(url); i++) await Promise.resolve();
    const gate = gates.get(url);
    if (!gate) throw new Error(`sem carga de ${url}`);
    return gate;
  };
  const open = async (url: string) => {
    (await gateOf(url)).resolve();
    await Promise.resolve();
  };
  const fail = async (url: string) => (await gateOf(url)).reject(new Error(`falhou ${url}`));
  return { loader, calls, open, fail, failures };
}

function residency(fake: ReturnType<typeof fakeLoader>, extra: Partial<AssetResidencyOptions> = {}) {
  return new AssetResidency({
    budgetBytes: BUDGET,
    loader: fake.loader,
    sizeOf: (gltf) => (gltf as unknown as { bytes: number }).bytes,
    ...extra,
  });
}

describe('AssetResidency: carga e orçamento (SPEC-0753)', () => {
  it('request carrega, fica residente e conta bytes e cargas', async () => {
    const fake = fakeLoader();
    const r = residency(fake);
    const gltf = await r.request('a.glb');
    expect(r.isResident('a.glb')).toBe(true);
    expect(r.get('a.glb')).toBe(gltf);
    expect(r.get('b.glb')).toBeUndefined();
    expect(r.stats).toEqual({ resident: 1, bytes: UNIT, budgetBytes: BUDGET, loads: 1, evictions: 0, overBudget: 0 });
  });

  it('pedidos paralelos da mesma URL carregam uma vez', async () => {
    const fake = fakeLoader(['a.glb']);
    const r = residency(fake);
    const both = Promise.all([r.request('a.glb'), r.request('a.glb')]);
    await fake.open('a.glb');
    const [x, y] = await both;
    expect(x).toBe(y);
    expect(fake.loader.loadGLTF).toHaveBeenCalledTimes(1);
  });

  it('passou do orçamento: solta o usado há mais tempo, com onEvict antes do release', async () => {
    const fake = fakeLoader();
    const onEvict = vi.fn((url: string, gltf: GLTF) => fake.calls.push(`evict:${url}`, gltf ? 'gltf' : 'sem'));
    const r = residency(fake, { onEvict });
    for (const url of ['a.glb', 'b.glb', 'c.glb', 'd.glb']) await r.request(url);
    expect(r.isResident('a.glb')).toBe(false);
    expect(fake.calls.slice(-3)).toEqual(['evict:a.glb', 'gltf', 'release:a.glb']);
    expect(r.stats).toMatchObject({ resident: 3, bytes: 3 * UNIT, evictions: 1 });
  });

  it('get marca como usado agora: sai o seguinte na ordem', async () => {
    const fake = fakeLoader();
    const r = residency(fake);
    for (const url of ['a.glb', 'b.glb', 'c.glb']) await r.request(url);
    r.get('a.glb');
    await r.request('d.glb');
    expect(r.isResident('a.glb')).toBe(true);
    expect(r.isResident('b.glb')).toBe(false);
  });

  it('a URL que acabou de chegar não sai no trim da própria chegada', async () => {
    const fake = fakeLoader();
    const r = new AssetResidency({ budgetBytes: UNIT - 1, loader: fake.loader, sizeOf: () => UNIT });
    await r.request('a.glb');
    expect(r.isResident('a.glb')).toBe(true);
    r.trim();
    expect(r.isResident('a.glb')).toBe(false);
  });

  it('tudo em uso: não solta nada, o pedido não falha e overBudget conta', async () => {
    const fake = fakeLoader();
    const r = residency(fake);
    const urls = ['a.glb', 'b.glb', 'c.glb', 'd.glb'];
    await r.hold('missao', urls);
    expect(urls.every((u) => r.isResident(u))).toBe(true);
    expect(r.stats.evictions).toBe(0);
    expect(r.stats.overBudget).toBeGreaterThan(0);
  });

  it('a falha da carga rejeita, não deixa residente e a próxima chamada tenta de novo', async () => {
    const fake = fakeLoader();
    fake.failures.add('a.glb');
    const r = residency(fake);
    await expect(r.request('a.glb')).rejects.toThrow('falhou a.glb');
    expect(r.isResident('a.glb')).toBe(false);
    fake.failures.clear();
    await expect(r.request('a.glb')).resolves.toBeDefined();
    expect(fake.loader.loadGLTF).toHaveBeenCalledTimes(2);
    expect(r.stats.loads).toBe(1);
  });
});

describe('AssetResidency: contador e dono (ADR-0754)', () => {
  it('acquire protege do trim; depois do unref, o próximo trim solta', async () => {
    const fake = fakeLoader();
    const r = residency(fake);
    await r.request('a.glb');
    r.acquire('a.glb');
    for (const url of ['b.glb', 'c.glb', 'd.glb']) await r.request(url);
    expect(r.isResident('a.glb')).toBe(true);
    expect(r.isResident('b.glb')).toBe(false);
    r.unref('a.glb');
    expect(r.isResident('a.glb')).toBe(true); // unref não solta na hora
    await r.request('e.glb');
    expect(r.isResident('a.glb')).toBe(false);
  });

  it('unref sem acquire fica em zero: um acquire depois ainda protege', async () => {
    const fake = fakeLoader();
    const r = residency(fake);
    await r.request('a.glb');
    r.unref('a.glb');
    r.unref('a.glb');
    r.acquire('a.glb');
    for (const url of ['b.glb', 'c.glb', 'd.glb']) await r.request(url);
    expect(r.isResident('a.glb')).toBe(true);
  });

  it('acquire antes de a carga terminar já protege', async () => {
    const fake = fakeLoader(['a.glb']);
    const r = residency(fake);
    r.acquire('a.glb');
    const pending = r.request('a.glb');
    await fake.open('a.glb');
    await pending;
    for (const url of ['b.glb', 'c.glb', 'd.glb']) await r.request(url);
    expect(r.isResident('a.glb')).toBe(true);
  });

  it('unhold não solta na hora; a URL fica descartável e sai quando falta espaço', async () => {
    const fake = fakeLoader();
    const r = residency(fake);
    await r.hold('m3', ['a.glb', 'b.glb', 'c.glb']);
    r.unhold('m3');
    expect(r.stats.resident).toBe(3);
    await r.request('d.glb');
    expect(r.isResident('a.glb')).toBe(false);
    expect(r.isResident('b.glb')).toBe(true);
  });

  it('a URL segura por dois donos só fica descartável depois dos dois unhold', async () => {
    const fake = fakeLoader();
    const r = residency(fake);
    await r.hold('m3', ['a.glb']);
    await r.hold('jogo', ['a.glb']);
    for (const url of ['b.glb', 'c.glb']) await r.request(url);
    r.unhold('m3');
    await r.request('d.glb');
    expect(r.isResident('a.glb')).toBe(true);
    r.unhold('jogo');
    await r.request('e.glb');
    expect(r.isResident('a.glb')).toBe(false);
  });

  it('trim nunca solta o que está em carga; unhold durante a carga deixa descartável na chegada', async () => {
    const fake = fakeLoader(['b.glb']);
    const r = new AssetResidency({ budgetBytes: UNIT, loader: fake.loader, sizeOf: () => UNIT });
    // dois residentes em uso já estouram o orçamento enquanto o b está em carga: o trim roda de verdade
    for (const url of ['a.glb', 'c.glb']) await r.request(url, { acquire: true });
    const held = r.hold('m', ['b.glb']);
    r.unhold('m');
    r.trim();
    expect(r.stats.overBudget).toBeGreaterThan(0);
    expect(fake.loader.release).not.toHaveBeenCalled();
    expect(r.release('b.glb')).toBe(false);
    await fake.open('b.glb');
    await held;
    expect(r.isResident('b.glb')).toBe(true);
    r.trim();
    expect(r.isResident('b.glb')).toBe(false);
    expect(r.isResident('a.glb') && r.isResident('c.glb')).toBe(true);
  });

  it('hold com uma carga que falha rejeita e tira a marca do dono daquela URL', async () => {
    const fake = fakeLoader(['x.glb']);
    const r = residency(fake);
    const held = r.hold('m', ['a.glb', 'x.glb']);
    await fake.fail('x.glb');
    await expect(held).rejects.toThrow('falhou x.glb');
    expect(r.isResident('x.glb')).toBe(false);
    expect(r.isResident('a.glb')).toBe(true);
    // A outra URL segue segura até o unhold.
    expect(r.release('a.glb')).toBe(false);
    r.unhold('m');
    expect(r.release('a.glb')).toBe(true);
  });

  it('loader que lança síncrono no hold rejeita sem prender a URL nem a marca do dono', async () => {
    let calls = 0;
    const gltf = fakeGltf(UNIT);
    const loader = {
      loadGLTF: (): Promise<GLTF> => {
        calls += 1;
        if (calls === 1) throw new Error('síncrono');
        return Promise.resolve(gltf);
      },
      release: vi.fn(() => true),
    };
    const r = new AssetResidency({ budgetBytes: BUDGET, loader, sizeOf: () => UNIT });
    await expect(r.hold('m', ['a.glb'])).rejects.toThrow('síncrono');
    await expect(r.request('a.glb')).resolves.toBe(gltf);
    expect(r.release('a.glb')).toBe(true); // sem a marca do dono que falhou
  });

  it('release solta na hora só o que está sem uso, sem dono e pronto', async () => {
    const fake = fakeLoader(['p.glb']);
    const onEvict = vi.fn();
    const r = residency(fake, { onEvict });
    await r.request('a.glb');
    await r.hold('m', ['h.glb']);
    r.acquire('a.glb');
    const pending = r.request('p.glb');
    expect(r.release('a.glb')).toBe(false);
    expect(r.release('h.glb')).toBe(false);
    expect(r.release('p.glb')).toBe(false);
    expect(r.release('nunca.glb')).toBe(false);
    r.unref('a.glb');
    expect(r.release('a.glb')).toBe(true);
    expect(onEvict).toHaveBeenCalledWith('a.glb', expect.anything());
    expect(fake.loader.release).toHaveBeenCalledWith('a.glb');
    await fake.open('p.glb');
    await pending;
  });

  it('onEvict que lança não impede o release', async () => {
    const fake = fakeLoader();
    const r = residency(fake, {
      onEvict: () => {
        throw new Error('jogo');
      },
    });
    await r.request('a.glb');
    expect(r.release('a.glb')).toBe(true);
    expect(fake.loader.release).toHaveBeenCalledWith('a.glb');
    expect(r.stats).toMatchObject({ resident: 0, bytes: 0, evictions: 1 });
  });
});

describe('estimateGltfBytes (SPEC-0753)', () => {
  /** Lado das texturas do teste, em texels. */
  const SIDE = 64;
  const RGBA = 4;

  it('textura com mips × 4/3, comprimida a 1 byte por texel, imagem dividida conta uma vez', () => {
    const tex = new THREE.Texture({ width: SIDE, height: SIDE } as never); // generateMipmaps: true
    const twin = tex.clone();
    const compressed = new THREE.CompressedTexture([], SIDE, SIDE);
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: tex })));
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: twin, alphaMap: compressed })));
    expect(estimateGltfBytes({ scene })).toBe(Math.ceil((SIDE * SIDE * RGBA * 4) / 3) + SIDE * SIDE);
  });

  it('geometria: atributos e índice, a mesma geometria (e o mesmo array) conta uma vez', () => {
    const geo = new THREE.BufferGeometry();
    const position = new Float32Array(9);
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(position, 3)); // mesmo array
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(3), 1));
    const scene = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial();
    scene.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, mat));
    expect(estimateGltfBytes({ scene })).toBe(position.byteLength + 3 * Uint16Array.BYTES_PER_ELEMENT);
  });

  it('é o sizeOf padrão da residência', async () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3));
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
    const gltf = { scene, animations: [] } as unknown as GLTF;
    const r = new AssetResidency({ budgetBytes: BUDGET * BUDGET, loader: { loadGLTF: async () => gltf, release: () => true } });
    await r.request('a.glb');
    expect(r.stats.bytes).toBe(estimateGltfBytes(gltf));
  });
});
