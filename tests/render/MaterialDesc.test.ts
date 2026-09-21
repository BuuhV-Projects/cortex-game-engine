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

  it('RECUSA material standard/toon com alphaTest > 0 (recorte alfa)', () => {
    // A engine USA recorte alfa (folhagem, grade, cerca) — desenhar sem o
    // corte pelo caminho nativo é o "modo de falha mais caro" (SPEC-0241).
    const material = new MeshStandardMaterial();
    material.alphaTest = 0.5;

    const resultado = describeMaterial(material);

    expect(isDescribed(resultado)).toBe(false);
    expect((resultado as { reason: string }).reason).toContain('alphaTest');
  });

  it('continua descrevendo normalmente quando alphaTest é 0 ou ausente', () => {
    // A recusa não pode pegar o que já funcionava.
    const semAlphaTest = new MeshStandardMaterial();
    const comZero = new MeshStandardMaterial();
    comZero.alphaTest = 0;

    expect(isDescribed(describeMaterial(semAlphaTest))).toBe(true);
    expect(isDescribed(describeMaterial(comZero))).toBe(true);
  });

  it('recusa a casca de contorno também quando ela carrega alphaTest > 0', () => {
    // `Materials.ts` monta a casca com `alphaTest: o.alphaTest ?? 0`, e o
    // ramo do contorno retorna ANTES da checagem geral — a recusa precisa
    // valer também aqui, senão o caso mais comum (folhagem com contorno)
    // continuaria passando como sólido.
    const outline = new MeshStandardMaterial();
    outline.alphaTest = 0.3;
    outline.userData['cortexOutlineThickness'] = 0.02;

    const resultado = describeMaterial(outline);

    expect(isDescribed(resultado)).toBe(false);
    expect((resultado as { reason: string }).reason).toContain('alphaTest');
  });

  it('continua descrevendo a casca de contorno sem alphaTest', () => {
    const outline = new MeshStandardMaterial();
    outline.userData['cortexOutlineThickness'] = 0.02;

    const desc = describeMaterial(outline) as MaterialDesc;

    expect(isDescribed(desc)).toBe(true);
    expect(desc.shading).toBe('outline');
    expect(desc.outlineThickness).toBe(0.02);
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

  it('reflete a recusa por alphaTest na contagem de cobertura', () => {
    const comRecorte = new MeshStandardMaterial();
    comRecorte.alphaTest = 0.5;

    const cobertura = measureCoverage([
      new MeshStandardMaterial(),
      comRecorte,
    ]);

    expect(cobertura.total).toBe(2);
    expect(cobertura.described).toBe(1);
    const motivo = Object.keys(cobertura.rejections).find((r) => r.includes('alphaTest'));
    expect(motivo).toBeDefined();
    expect(cobertura.rejections[motivo!]).toBe(1);
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