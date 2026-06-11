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
    expect(ta.api.get(mesh)).toEqual({ sculpting: false, radius: 6, strength: 0.5 });
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
