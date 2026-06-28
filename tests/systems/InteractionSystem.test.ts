/**
 * Testes do InteractionSystem (src/systems/InteractionSystem.ts): acha o interagível
 * mais próximo em alcance do interator ativo, avisa o prompt e dispara no botão.
 */

import { describe, it, expect, vi } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { InteractionComponent } from '../../src/components/InteractionComponent.js';
import { InteractionSystem, type InteractionSystemOptions } from '../../src/systems/InteractionSystem.js';

function fakePad(pressed = false) {
  return { isButtonDown: () => pressed, getAxis: () => 0 };
}

function setup(opts: Partial<InteractionSystemOptions> & { interactor: InteractionSystemOptions['interactor'] }, pad: unknown) {
  const world = new World();
  const onPrompt = vi.fn();
  const sys = new InteractionSystem({ onPrompt, ...opts }, pad as never);
  world.addSystem(sys);
  return { world, sys, onPrompt };
}

function interactable(world: World, x: number, z: number, range: number, onInteract: () => void) {
  const e = world.createEntity();
  e.addComponent(new TransformComponent(x, 0, z, 0));
  e.addComponent(new InteractionComponent({ prompt: 'Entrar', range, onInteract }));
  return e;
}

describe('InteractionSystem', () => {
  it('mostra o prompt só quando o interator entra no alcance', () => {
    let pos = { x: 0, z: 0 };
    const { world, onPrompt } = setup({ interactor: () => pos }, fakePad());
    interactable(world, 5, 0, 3, () => {}); // a 5m, alcance 3

    world.tick(16); // longe → sem prompt
    expect(onPrompt).not.toHaveBeenCalled();

    pos = { x: 3, z: 0 }; // a 2m → dentro
    world.tick(16);
    expect(onPrompt).toHaveBeenCalledTimes(1);
    expect(onPrompt.mock.calls[0][0]?.prompt).toBe('Entrar');

    pos = { x: 0, z: 0 }; // saiu → prompt some (null)
    world.tick(16);
    expect(onPrompt).toHaveBeenLastCalledWith(null);
  });

  it('dispara onInteract na borda do botão (uma vez), só em alcance', () => {
    const pad = fakePad(false);
    const onInteract = vi.fn();
    const { world } = setup({ interactor: () => ({ x: 0, z: 0 }) }, pad);
    interactable(world, 1, 0, 3, onInteract); // em alcance

    pad.isButtonDown = () => true; // aperta
    world.tick(16);
    world.tick(16); // segura → não repete
    expect(onInteract).toHaveBeenCalledTimes(1);
  });

  it('escolhe o interagível MAIS próximo', () => {
    const longe = vi.fn();
    const perto = vi.fn();
    const pad = fakePad(true);
    const { world } = setup({ interactor: () => ({ x: 0, z: 0 }) }, pad);
    interactable(world, 2.5, 0, 5, longe);
    interactable(world, 1, 0, 5, perto);
    world.tick(16);
    expect(perto).toHaveBeenCalledTimes(1);
    expect(longe).not.toHaveBeenCalled();
  });

  it('ignora interação desabilitada (enabled=false)', () => {
    const onInteract = vi.fn();
    const pad = fakePad(true);
    const { world } = setup({ interactor: () => ({ x: 0, z: 0 }) }, pad);
    const e = interactable(world, 1, 0, 3, onInteract);
    e.getComponent(InteractionComponent)!.enabled = false;
    world.tick(16);
    expect(onInteract).not.toHaveBeenCalled();
  });
});
