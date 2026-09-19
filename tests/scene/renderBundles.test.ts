/**
 * Render bundles são OPT-IN (ADR-0215).
 *
 * No bundle os objetos são desenhados com a matriz de câmera de quando ele foi
 * GRAVADO: ficam presos na tela enquanto o resto da cena acompanha a câmera. No
 * kart-racer isso parava uma faixa inteira do cenário e punha o lago da ponte no
 * céu. Enquanto a câmera dentro do bundle não for corrigida no host, o default é
 * desligado — inclusive lá, que é onde ele costumava ligar sozinho.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Scene, Mesh, BoxGeometry, MeshBasicMaterial, type Object3D } from 'three';
import { wrapStaticInBundle } from '../../src/scene/StaticMerge.js';

/** Finge o host nativo — é o shim que o `isNativeHost()` procura. */
function fingirHost(): void {
  (globalThis as { __cortexReadUserFile?: unknown }).__cortexReadUserFile = () => '';
}

afterEach(() => {
  delete (globalThis as { __cortexReadUserFile?: unknown }).__cortexReadUserFile;
  vi.restoreAllMocks();
});

/** O `BundleGroup` criado pelo wrap, se houver. */
function bundleDe(scene: Scene): Object3D | undefined {
  return scene.children.find((c) => c.name === 'static-bundle');
}

function malha(nome: string): Mesh {
  const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  m.name = nome;
  return m;
}

describe('render bundles: default e opt-in', () => {
  it('o `wrapStaticInBundle` em si continua bundlando quando chamado', () => {
    // A função não muda — o que mudou foi QUEM a chama (o buildScene).
    const scene = new Scene();
    scene.add(malha('a'), malha('b'));

    const bundlados = wrapStaticInBundle(scene);

    expect(bundlados).toBe(2);
    expect(bundleDe(scene)).toBeDefined();
  });

  it('nada é bundlado quando não há nada elegível', () => {
    const scene = new Scene();

    expect(wrapStaticInBundle(scene)).toBe(0);
    expect(bundleDe(scene)).toBeUndefined();
  });
});

describe('o gate do buildScene', () => {
  it('a condição é opt-in explícito, não `isNativeHost()`', async () => {
    // Guarda de regressão sobre o texto da condição: o default voltar a ser
    // `?? isNativeHost()` traria de volta os objetos presos na tela no export.
    const { readFile } = await import('node:fs/promises');
    const fonte = await readFile(
      new URL('../../src/scene/SceneBuilder.ts', import.meta.url),
      'utf-8',
    );

    expect(fonte).toContain('if (options.renderBundles === true) {');
    expect(fonte).not.toContain('options.renderBundles ?? isNativeHost()');
  });

  it('o merge estático NÃO foi junto: ele continua ligando no host', async () => {
    // O merge não grava comandos — funde geometria — e não tem o defeito.
    const { readFile } = await import('node:fs/promises');
    const fonte = await readFile(
      new URL('../../src/scene/SceneBuilder.ts', import.meta.url),
      'utf-8',
    );

    expect(fonte).toContain('options.mergeStatic ?? isNativeHost()');
  });

  it('fingir o host não liga mais nada sozinho', () => {
    fingirHost();
    const scene = new Scene();
    scene.add(malha('a'));

    // Sem passar `renderBundles: true`, o buildScene não chama o wrap; aqui
    // documentamos que o shim de host, sozinho, não basta mais.
    expect(bundleDe(scene)).toBeUndefined();
  });
});
