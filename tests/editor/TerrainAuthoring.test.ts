/**
 * TDD do módulo de autoria de terreno (ADR-0060). A parte testável (sem DOM): brush
 * (raio/força), sessão de esculpir, persistência (`overlay.data.terrain[nome]`) e a
 * matemática da pincelada (`paintAt`: world→local respeitando ESCALA + Terrain.sculpt).
 * Os efeitos do editor (gizmo/hud/brushRing) são injetados como hooks e aqui só
 * conferimos que foram chamados.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, BoxGeometry, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { Terrain } from '../../src/scene/Terrain.js';
import { createAuthoringContext } from '../../src/editor/authoring/AuthoringContext.js';
import { createTerrainAuthoring } from '../../src/editor/authoring/TerrainAuthoring.js';
import type { Game } from '../../src/core/Game.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

function setup() {
  const overlay = { version: 1, objects: {}, data: {} } as unknown as SceneFileV1;
  let persists = 0;
  const ctx = createAuthoringContext({} as unknown as Game, new Object3D(), overlay, () => {
    persists++;
  });
  const calls = { start: 0, stop: 0, toasts: [] as string[] };
  const terrainAuthoring = createTerrainAuthoring(ctx, {
    onSculptStart: () => {
      calls.start++;
    },
    onSculptStop: () => {
      calls.stop++;
    },
    toast: (m) => calls.toasts.push(m),
  });
  return { overlay, ctx, calls, ta: terrainAuthoring, persists: () => persists };
}

function terrainMesh(name: string): { mesh: Mesh; terrain: Terrain } {
  const terrain = new Terrain({ size: 20, resolution: 20 });
  terrain.mesh.name = name;
  return { mesh: terrain.mesh, terrain };
}

describe('TerrainAuthoring', () => {
  it('get: null em não-terreno; brush default em terreno', () => {
    const { ta } = setup();
    expect(ta.api.get(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()))).toBeNull();
    const { mesh } = terrainMesh('t');
    expect(ta.api.get(mesh)).toEqual({
      sculpting: false,
      mode: 'sculpt',
      radius: 6,
      strength: 0.5,
      textures: [],
      texture: null,
      tileMeters: 4, // default: ~1 tile a cada 4m (size 20, escala 1 → tile de 4m)
    });
  });

  it('setBrush atualiza raio/força', () => {
    const { ta } = setup();
    const { mesh } = terrainMesh('t');
    ta.api.setBrush(12, 1.5);
    expect(ta.api.get(mesh)).toMatchObject({ radius: 12, strength: 1.5 });
  });

  it('startSculpt em não-terreno avisa (toast) e não inicia', () => {
    const { ta, calls } = setup();
    ta.api.startSculpt(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
    expect(ta.isSculpting()).toBe(false);
    expect(calls.start).toBe(0);
    expect(calls.toasts.length).toBeGreaterThan(0);
  });

  it('startSculpt em terreno inicia a sessão + dispara onSculptStart', () => {
    const { ta, calls } = setup();
    const { mesh } = terrainMesh('t');
    ta.api.startSculpt(mesh);
    expect(ta.isSculpting()).toBe(true);
    expect(ta.sculptObject()).toBe(mesh);
    expect(ta.api.get(mesh)!.sculpting).toBe(true);
    expect(calls.start).toBe(1);
  });

  it('paintAt SOBE no centro; SHIFT (lower) ABAIXA', () => {
    const { ta } = setup();
    const { mesh, terrain } = terrainMesh('t');
    ta.api.startSculpt(mesh);
    ta.paintAt(new Vector3(0, 0, 0), false);
    expect(terrain.heightAt(0, 0)!).toBeGreaterThan(0); // subiu
    const up = terrain.heightAt(0, 0)!;
    ta.paintAt(new Vector3(0, 0, 0), true);
    expect(terrain.heightAt(0, 0)!).toBeLessThan(up); // abaixou
  });

  it('paintAt respeita a ESCALA (raio em unidades de mundo)', () => {
    const { ta } = setup();
    const { mesh, terrain } = terrainMesh('t');
    mesh.scale.setScalar(2);
    mesh.updateMatrixWorld(true);
    ta.api.startSculpt(mesh);
    // hit no mundo em (2,0,0) → local (1,0,0) na grade; deve subir perto dali
    ta.paintAt(new Vector3(2, 0, 0), false);
    expect(terrain.heightAt(1, 0)!).toBeGreaterThan(0);
  });

  it('modo paint: setTexture aloca camada, paintAt pinta o splat, SHIFT apaga', () => {
    const { ta } = setup();
    const { mesh, terrain } = terrainMesh('t');
    ta.setAvailableTextures(['assets/textures/grama.png']);
    ta.api.startSculpt(mesh);
    ta.api.setMode('paint');
    expect(ta.mode()).toBe('paint');
    ta.api.setTexture(mesh, 'assets/textures/grama.png');
    expect(terrain.getLayers().map((l) => l.url)).toEqual(['assets/textures/grama.png']);
    ta.paintAt(new Vector3(0, 0, 0), false);
    const painted = terrain.getPaint()!;
    expect(Buffer.from(painted.splat, 'base64').some((b) => b > 0)).toBe(true); // pintou
    // não mexeu na ALTURA (paint ≠ sculpt)
    expect(terrain.getHeights().every((h) => h === 0)).toBe(true);
    // SHIFT apaga (reduz o peso)
    ta.paintAt(new Vector3(0, 0, 0), true);
    const max = (b64: string): number => Buffer.from(b64, 'base64').reduce((m, b) => (b > m ? b : m), 0);
    expect(max(terrain.getPaint()!.splat)).toBeLessThanOrEqual(max(painted.splat));
  });

  it('modo paint sem textura escolhida: não pinta e avisa (toast)', () => {
    const { ta, calls } = setup();
    const { mesh, terrain } = terrainMesh('t');
    ta.api.startSculpt(mesh);
    ta.api.setMode('paint');
    const toasts = calls.toasts.length;
    ta.paintAt(new Vector3(0, 0, 0), false);
    expect(terrain.getPaint()).toBeNull();
    expect(calls.toasts.length).toBeGreaterThan(toasts);
  });

  it('setTileSize converte metros→tiles (ciente da escala) e persiste', () => {
    const { ta, overlay, persists } = setup();
    const { mesh, terrain } = terrainMesh('terreno1'); // size 20, escala 1 → mundo 20m
    ta.api.startSculpt(mesh);
    ta.api.setMode('paint');
    ta.api.setTexture(mesh, 'assets/textures/grama.png');
    const before = persists();
    ta.api.setTileSize(mesh, 2); // tile de 2m → 20/2 = 10 tiles
    expect(terrain.getLayers()[0]!.repeat).toBe(10);
    expect(persists()).toBe(before + 1);
    const saved = (overlay.data['terrainPaint'] as Record<string, { layers: { repeat: number }[] }>)['terreno1'];
    expect(saved.layers[0]!.repeat).toBe(10);
  });

  it('stopSculpt no modo paint salva a pintura em data.terrainPaint[nome]', () => {
    const { ta, overlay } = setup();
    const { mesh } = terrainMesh('terreno1');
    ta.api.startSculpt(mesh);
    ta.api.setMode('paint');
    ta.api.setTexture(mesh, 'assets/textures/grama.png');
    ta.paintAt(new Vector3(0, 0, 0), false);
    ta.api.stopSculpt();
    const saved = (overlay.data['terrainPaint'] as Record<string, { layers: { url: string }[]; splat: string }>)['terreno1'];
    expect(saved.layers[0]!.url).toBe('assets/textures/grama.png');
    expect(saved.splat.length).toBeGreaterThan(0);
  });

  it('stopSculpt salva o heightmap no overlay + persiste + onSculptStop', () => {
    const { ta, overlay, calls, persists } = setup();
    const { mesh } = terrainMesh('terreno1');
    ta.api.startSculpt(mesh);
    ta.paintAt(new Vector3(0, 0, 0), false);
    const before = persists();
    ta.api.stopSculpt();
    const saved = (overlay.data['terrain'] as Record<string, number[]>)['terreno1'];
    expect(Array.isArray(saved)).toBe(true);
    expect(saved.some((h) => h > 0)).toBe(true); // gravou as alturas esculpidas
    expect(persists()).toBe(before + 1);
    expect(calls.stop).toBe(1);
    expect(ta.isSculpting()).toBe(false);
  });
});
