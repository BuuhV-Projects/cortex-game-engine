import type { World, Entity } from 'cortex-game-engine'
import { GameStateComponent } from '../components/GameStateComponent'

/**
 * Singleton de sessão: uma entity só com GameStateComponent. Os Systems
 * de UI/ondas/pause leem dela.
 */
export function createGameSession(world: World): Entity {
  const e = world.createEntity()
  e.addComponent(new GameStateComponent())
  return e
}
