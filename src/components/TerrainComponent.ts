import { Component } from '../ecs/Component.js';
import type { Object3D } from 'three';
import type { Terrain } from '../scene/Terrain.js';

/**
 * Marca uma entidade como **terreno colidível** — guarda o {@link Terrain} (pra
 * amostrar a altura) e o `Object3D` (pra converter mundo↔local respeitando
 * posição/rotação/escala). O {@link TerrainCollisionSystem} usa isto pra manter
 * os corpos em cima da superfície. O {@link buildScene} cria essa entidade pra
 * cada nó `terrain` quando há `world` (terreno é **sólido por padrão**).
 */
export class TerrainComponent extends Component {
  constructor(
    /** O terreno (heightmap) — fonte da altura por `heightAt`. */
    public readonly terrain: Terrain,
    /** O mesh do terreno na cena — pra conversão de coordenadas mundo↔local. */
    public readonly object: Object3D,
  ) {
    super();
  }
}
