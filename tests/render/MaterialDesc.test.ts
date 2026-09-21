import { describe, it, expect } from 'vitest';
import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  Texture,
} from 'three';
import {
  describeMaterial,
  isDescribed,
  measureCoverage,
  type MaterialDesc,
} from '../../src/render/MaterialDesc.js';

describe('describeMaterial', () => {
  it('descreve o material padrão da engine sem perder nada', () => {
    const material = new MeshStandardMaterial({
      color: new Color(0.5, 0.25, 0.125),
      metalness: 0.8,
      roughness: 0.2,
      emissive: new Color(0.1, 0, 0),
    });

    const desc = describeMaterial(material) as MaterialDesc;

    expect(isDescribed(desc)).toBe(true);
    expect(desc.shading).toBe('standard');
    expect(desc.color[0]).toBeCloseTo(0.5);
    expect(desc.metalness).toBe(0.8);
    expect(desc.roughness).toBe(0.2);
    expect(desc.emissive[0]).toBeCloseTo(0.1);
    expect(desc.blend).toBe('opaque');
  });

  it('reconhece toon e unlit, que a engine produz nos presets', () => {
    expect((describeMaterial(new MeshToonMaterial()) as MaterialDesc).shading).toBe('toon');
    expect((describeMaterial(new MeshBasicMaterial()) as MaterialDesc).shading).toBe('unlit');
  });

  it('marca blend por transparent ou por opacidade', () => {
    expect((describeMaterial(new MeshStandardMaterial({ transparent: true })) as MaterialDesc).blend).toBe('blend');
    expect((describeMaterial(new MeshStandardMaterial({ opacity: 0.5 })) as MaterialDesc).blend).toBe('blend');
  });

  it('carrega doubleSided e toneMapped, que mudam o resultado na tela', () => {
    // `toneMapped: false` é o que mantém a UI fora do ACES (ADR-0105) — perder
    // isso mudaria a cor de toda a interface.
    const material = new MeshStandardMaterial({ side: DoubleSide });
    material.toneMapped = false;

    const desc = describeMaterial(material) as MaterialDesc;

    expect(desc.doubleSided).toBe(true);
    expect(desc.toneMapped).toBe(false);
  });

  it('guarda o id da textura base, não a textura', () => {
    // O C++ resolve o handle pelo id; passar o objeto não atravessaria a ponte.
    const map = new Texture();
    const desc = describeMaterial(new MeshStandardMaterial({ map })) as MaterialDesc;

    expect(desc.baseTextureId).toBe(map.uuid);
  });

  it('RECUSA em vez de aproximar quando há mapa que não representa', () => {
    // Aproximar produziria diferença visual sutil, que é o modo de falha mais
    // caro desta migração — daí recusar e deixar no caminho do three.
    const material = new MeshStandardMaterial();
    material.normalMap = new Texture();

    const resultado = describeMaterial(material);

    expect(isDescribed(resultado)).toBe(false);
    expect((resultado as { reason: string }).reason).toContain('normalMap');
  });

  it('recusa tipo fora do subconjunto', () => {
    const resultado = describeMaterial(new MeshPhysicalMaterial());
    expect(isDescribed(resultado)).toBe(false);
    expect((resultado as { reason: string }).reason).toContain('fora do subconjunto');
  });
});

describe('measureCoverage', () => {
  it('conta descritos e agrupa os motivos de recusa', () => {
    const comNormal = new MeshStandardMaterial();
    comNormal.normalMap = new Texture();

    const cobertura = measureCoverage([
      new MeshStandardMaterial(),
      new MeshToonMaterial(),
      comNormal,
      new MeshPhysicalMaterial(),
    ]);

    expect(cobertura.total).toBe(4);
    expect(cobertura.described).toBe(2);
    expect(Object.keys(cobertura.rejections)).toHaveLength(2);
  });

  it('aceita as variantes NodeMaterial, que sao o que o WebGPU usa', () => {
    // Na cena do kart-racer, 122 dos 271 materiais sao MeshBasicNodeMaterial.
    const node = new MeshBasicMaterial();
    Object.defineProperty(node, 'type', { value: 'MeshBasicNodeMaterial' });

    expect((describeMaterial(node) as MaterialDesc).shading).toBe('unlit');
  });

  it('recusa NodeMaterial com grafo TSL customizado', () => {
    // Se a aparencia vem de um grafo, a descricao nao representa o material.
    const node = new MeshBasicMaterial() as unknown as Record<string, unknown>;
    Object.defineProperty(node, 'type', { value: 'MeshStandardNodeMaterial' });
    node['colorNode'] = {};

    const resultado = describeMaterial(node as never);

    expect(isDescribed(resultado)).toBe(false);
    expect((resultado as { reason: string }).reason).toContain('colorNode');
  });
});