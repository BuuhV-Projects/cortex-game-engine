/**
 * Testes da camada 2D/pixel: spritesheet (recorte UV), animação de sprite e
 * tilemap (geometria + colliders). Lógica pura — roda em node.
 */
import { describe, it, expect } from 'vitest';
import { Texture } from 'three';
import { Spritesheet } from '../../src/scene/Spritesheet.js';
import { buildTilemap } from '../../src/scene/Tilemap.js';
import { SpriteAnimationComponent } from '../../src/components/SpriteAnimationComponent.js';
import { SpriteAnimationSystem } from '../../src/systems/SpriteAnimationSystem.js';
import { Collider2DComponent } from '../../src/components/Collider2DComponent.js';
import { World } from '../../src/ecs/World.js';

describe('Spritesheet.applyFrame', () => {
  const tex = new Texture();
  const sheet = new Spritesheet(tex, { frameWidth: 16, frameHeight: 16, columns: 4, rows: 2 });

  it('frame 0 = topo-esquerda (V invertido)', () => {
    sheet.applyFrame(tex, 0);
    expect(tex.repeat.x).toBeCloseTo(0.25, 6);
    expect(tex.repeat.y).toBeCloseTo(0.5, 6);
    expect(tex.offset.x).toBeCloseTo(0, 6);
    expect(tex.offset.y).toBeCloseTo(0.5, 6); // metade de cima
  });

  it('frame 5 = col 1, linha 1 (de baixo no UV)', () => {
    sheet.applyFrame(tex, 5);
    expect(tex.offset.x).toBeCloseTo(0.25, 6);
    expect(tex.offset.y).toBeCloseTo(0, 6);
  });
});

describe('SpriteAnimationSystem', () => {
  it('avança os frames pela cadência (fps) e faz loop', () => {
    const tex = new Texture();
    const sheet = new Spritesheet(tex, { frameWidth: 16, frameHeight: 16, columns: 4, rows: 1 });
    const anim = new SpriteAnimationComponent(sheet, { run: { frames: [0, 1, 2], fps: 10 } }, tex, 'run');
    const world = new World();
    world.addSystem(new SpriteAnimationSystem());
    const e = world.createEntity();
    e.addComponent(anim);

    world.tick(0);
    expect(anim.frameIndex).toBe(0);
    world.tick(110); // 0.11s * 10fps → frame 1
    expect(anim.frameIndex).toBe(1);
    world.tick(200); // +0.2s → t=0.31 → floor(3.1)=3 → 3%3=0 (loop)
    expect(anim.frameIndex).toBe(0);
  });
});

describe('buildTilemap', () => {
  const tex = new Texture();
  const map = buildTilemap({
    tileset: tex,
    tileWidth: 16,
    tileHeight: 16,
    tilesetColumns: 4,
    data: [
      [-1, 0, 0],
      [1, -1, 1],
    ],
  });

  it('gera 4 verts por tile não-vazio', () => {
    const pos = map.mesh.geometry.getAttribute('position');
    expect(pos.count).toBe(4 * 4); // 4 tiles não-vazios
  });

  it('addColliders mescla runs horizontais por linha', () => {
    const world = new World();
    map.addColliders(world);
    // linha 0: run [1,2] = 1 collider; linha 1: [0] e [2] = 2 colliders → 3
    expect(world.query(Collider2DComponent).length).toBe(3);
  });
});
