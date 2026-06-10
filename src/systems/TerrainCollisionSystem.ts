import { Vector3 } from 'three';
import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { TerrainComponent } from '../components/TerrainComponent.js';
import { PlatformerBodyComponent } from '../components/PlatformerBodyComponent.js';
import { KinematicBodyComponent } from '../components/KinematicBodyComponent.js';

const _v = new Vector3();

/**
 * **Colisão com o terreno** (heightmap) — mantém os corpos EM CIMA da superfície:
 * se um corpo cai abaixo da altura do terreno no seu `(x, z)`, é subido até a
 * superfície e **aterrado** (zera a velocidade pra baixo, marca `grounded`). Vale
 * pra `PlatformerBodyComponent` (2.5D) e `KinematicBodyComponent` (genérico) —
 * então serve pra jogos 3D, 2.5D ou top-down (a altura vem de {@link Terrain.heightAt}).
 * Terreno é **sólido por padrão**: o {@link buildScene} liga este sistema quando a
 * cena tem terreno.
 *
 * Roda **depois da física** (priority 5) e **antes do** `Object3DSyncSystem`
 * (priority 10), pra a mesh refletir a posição já corrigida.
 */
export class TerrainCollisionSystem extends System {
  static override requiredComponents = []; // todas as entidades — filtra dentro
  override priority = 7;

  override update(entities: Entity[]): void {
    // Coleta os terrenos e atualiza a matriz de mundo de cada um uma vez.
    const terrains: TerrainComponent[] = [];
    for (const e of entities) {
      const tc = e.getComponent(TerrainComponent);
      if (tc) {
        tc.object.updateWorldMatrix(true, false);
        terrains.push(tc);
      }
    }
    if (terrains.length === 0) return;

    for (const e of entities) {
      const t = e.getComponent(TransformComponent);
      if (!t) continue;
      const pb = e.getComponent(PlatformerBodyComponent);
      const kb = e.getComponent(KinematicBodyComponent);
      if (!pb && !kb) continue; // só corpos (o que cai/anda)

      for (const tc of terrains) {
        const surfaceY = surfaceWorldY(tc, t.x, t.z);
        if (surfaceY === null) continue; // fora da área do terreno
        if (t.y < surfaceY) {
          t.y = surfaceY;
          if (pb) {
            if (pb.vy < 0) pb.vy = 0;
            pb.grounded = true;
          }
          if (kb) {
            if (kb.velocityY < 0) kb.velocityY = 0;
            kb.grounded = true;
          }
        }
      }
    }
  }
}

/** Altura do terreno (Y em mundo) sob `(worldX, worldZ)`, ou `null` se fora dele. */
function surfaceWorldY(tc: TerrainComponent, worldX: number, worldZ: number): number | null {
  const obj = tc.object;
  _v.set(worldX, 0, worldZ);
  obj.worldToLocal(_v); // → coords locais do terreno (respeita pos/rot/escala)
  const h = tc.terrain.heightAt(_v.x, _v.z);
  if (h === null) return null;
  _v.y = h; // ponto da superfície em local (lx, h, lz)
  obj.localToWorld(_v); // → mundo
  return _v.y;
}
