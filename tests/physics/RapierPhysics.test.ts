/**
 * Spike da fase 2 (TDR-0002): valida a integração com o Rapier (WASM) — init async,
 * gravidade/colisão, empilhamento e sensor (trigger). O wrapper não vaza tipos do
 * Rapier (devolve handles próprios), pra a API pública/vendoring ficarem limpos.
 */
import { describe, it, expect } from 'vitest';
import { RapierPhysics } from '../../src/physics/RapierPhysics.js';

describe('RapierPhysics (spike fase 2)', () => {
  it('inicializa (WASM) e simula: caixa cai e POUSA no chão', async () => {
    const physics = await RapierPhysics.create({ x: 0, y: -9.81, z: 0 });
    physics.addBody({ type: 'fixed', shape: { kind: 'box', halfExtents: { x: 10, y: 0.5, z: 10 } } });
    const box = physics.addBody({
      type: 'dynamic',
      position: { x: 0, y: 10, z: 0 },
      shape: { kind: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    });
    for (let i = 0; i < 200; i++) physics.step();
    // topo do chão (0.5) + meia-altura da caixa (0.5) = 1.0
    expect(box.translation().y).toBeCloseTo(1.0, 1);
  });

  it('corpos dinâmicos colidem e EMPILHAM (não se interpenetram)', async () => {
    const physics = await RapierPhysics.create();
    physics.addBody({ type: 'fixed', shape: { kind: 'box', halfExtents: { x: 10, y: 0.5, z: 10 } } });
    const a = physics.addBody({
      type: 'dynamic',
      position: { x: 0, y: 2, z: 0 },
      shape: { kind: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    });
    const b = physics.addBody({
      type: 'dynamic',
      position: { x: 0, y: 6, z: 0 },
      shape: { kind: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    });
    for (let i = 0; i < 400; i++) physics.step();
    expect(a.translation().y).toBeCloseTo(1.0, 0); // a no chão
    expect(b.translation().y).toBeGreaterThan(a.translation().y + 0.8); // b empilhado em cima
  });

  it('sensor (trigger) NÃO bloqueia — a caixa atravessa', async () => {
    const physics = await RapierPhysics.create();
    physics.addBody({ type: 'fixed', isSensor: true, shape: { kind: 'box', halfExtents: { x: 10, y: 0.5, z: 10 } } });
    const box = physics.addBody({
      type: 'dynamic',
      position: { x: 0, y: 5, z: 0 },
      shape: { kind: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
    });
    for (let i = 0; i < 120; i++) physics.step();
    expect(box.translation().y).toBeLessThan(0); // passou direto pelo sensor
  });
});
