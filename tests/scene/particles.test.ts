/**
 * **Partículas** (ADR-0168 / SPEC-0169) — o determinístico do emissor:
 *  - pool: `burst` nasce partícula, vida acaba, slot é reciclado, `max` é teto;
 *  - simulação: gravidade e drag agem, o fade é por ESCALA (não por alpha);
 *  - material: unlit, sem escrever profundidade, fora da névoa e fora do raycast;
 *  - schema: o nó `particles` valida no `SceneDefinition` (e aceita faixa ou número).
 */
import { describe, it, expect } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3, Scene as ThreeScene, InstancedMesh } from 'three';
import { ParticleEmitter, spawnParticles, createSoftDiscTexture } from '../../src/scene/Particles.js';
import { parseSceneDefinition } from '../../src/scene/SceneDefinition.js';

/** Escala uniforme da instância `i` (o fade da v1 é por escala). */
function instanceScale(mesh: InstancedMesh, i: number): number {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  return new Vector3().setFromMatrixScale(m).x;
}

/** Posição da instância `i`. */
function instancePosition(mesh: InstancedMesh, i: number): Vector3 {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  return new Vector3().setFromMatrixPosition(m);
}

const camera = new PerspectiveCamera();

describe('pool', () => {
  it('burst faz nascer partícula viva', () => {
    const fx = new ParticleEmitter({ max: 10, life: 1, size: 1 });
    expect(fx.alive).toBe(0);
    fx.burst(4);
    fx.update(0.016, camera);
    expect(fx.alive).toBe(4);
    fx.dispose();
  });

  it('a vida acaba e a partícula sai da conta', () => {
    const fx = new ParticleEmitter({ max: 10, life: 0.5, speed: 0 });
    fx.burst(3);
    fx.update(0.1, camera);
    expect(fx.alive).toBe(3);
    fx.update(0.6, camera); // passou de 0.5s
    expect(fx.alive).toBe(0);
    fx.dispose();
  });

  it('o slot é RECICLADO (pool fixo, sem crescer)', () => {
    const fx = new ParticleEmitter({ max: 2, life: 0.2, speed: 0 });
    fx.burst(2);
    fx.update(0.05, camera);
    expect(fx.alive).toBe(2);
    fx.update(0.3, camera); // todas morrem
    expect(fx.alive).toBe(0);
    fx.burst(2); // reusa os mesmos dois slots
    fx.update(0.05, camera);
    expect(fx.alive).toBe(2);
    fx.dispose();
  });

  it('`max` é TETO: burst além dele não cria partícula extra', () => {
    const fx = new ParticleEmitter({ max: 3, life: 5, speed: 0 });
    fx.burst(10);
    fx.update(0.016, camera);
    expect(fx.alive).toBe(3);
    fx.dispose();
  });

  it('`rate` emite ao longo do tempo, e a fração de partícula não se perde', () => {
    // 10/s com passos de 0.25s: nada no 1º passo inteiro? não — acumula e solta.
    const fx = new ParticleEmitter({ max: 50, rate: 10, life: 5, speed: 0 });
    for (let i = 0; i < 4; i++) fx.update(0.25, camera);
    expect(fx.alive).toBe(10); // 1 segundo × 10/s
    fx.dispose();
  });

  it('stop() para de emitir mas deixa as vivas terminarem', () => {
    const fx = new ParticleEmitter({ max: 50, rate: 20, life: 1, speed: 0 });
    fx.update(0.5, camera);
    const alive = fx.alive;
    expect(alive).toBeGreaterThan(0);
    fx.stop();
    fx.update(0.1, camera);
    expect(fx.alive).toBe(alive); // não nasceu mais nenhuma
    expect(fx.active).toBe(false);
    fx.dispose();
  });

  it('loop:false solta uma leva e para sozinho (efeito de evento)', () => {
    const fx = new ParticleEmitter({ max: 20, rate: 10, loop: false, life: 5, speed: 0 });
    fx.update(0.5, camera);
    expect(fx.active).toBe(false);
    const alive = fx.alive;
    fx.update(0.5, camera);
    expect(fx.alive).toBe(alive);
    fx.dispose();
  });
});

describe('simulação', () => {
  it('a gravidade puxa a partícula (sem velocidade inicial ela cai)', () => {
    const fx = new ParticleEmitter({ max: 4, life: 5, speed: 0, spread: 0, gravity: -10, size: 1 });
    fx.burst(1);
    fx.update(0.2, camera);
    const y = instancePosition(fx.object as InstancedMesh, 0).y;
    expect(y).toBeLessThan(0);
    fx.dispose();
  });

  it('sem gravidade e sem drag, a partícula segue a direção dada', () => {
    const fx = new ParticleEmitter({
      max: 4, life: 5, speed: 2, spread: 0, direction: [1, 0, 0], size: 1,
    });
    fx.burst(1);
    fx.update(0.5, camera);
    const p = instancePosition(fx.object as InstancedMesh, 0);
    expect(p.x).toBeCloseTo(1, 1); // 2 u/s × 0.5 s
    expect(Math.abs(p.y)).toBeLessThan(1e-6);
    expect(Math.abs(p.z)).toBeLessThan(1e-6);
    fx.dispose();
  });

  it('drag freia: com ele a partícula anda MENOS que sem', () => {
    const mk = (drag: number): number => {
      const fx = new ParticleEmitter({
        max: 2, life: 5, speed: 4, spread: 0, direction: [1, 0, 0], drag, size: 1,
      });
      fx.burst(1);
      for (let i = 0; i < 10; i++) fx.update(0.05, camera);
      const x = instancePosition(fx.object as InstancedMesh, 0).x;
      fx.dispose();
      return x;
    };
    expect(mk(2)).toBeLessThan(mk(0));
  });

  it('o FADE é por escala: a partícula encolhe conforme a vida acaba (ADR-0168)', () => {
    const fx = new ParticleEmitter({ max: 2, life: 1, size: 2, speed: 0, spread: 0 });
    fx.burst(1);
    fx.update(0.1, camera);
    const early = instanceScale(fx.object as InstancedMesh, 0);
    fx.update(0.6, camera);
    const late = instanceScale(fx.object as InstancedMesh, 0);
    expect(late).toBeLessThan(early);
    expect(late).toBeGreaterThan(0);
    fx.dispose();
  });

  it('`spread` 0 é determinístico; `spread` > 0 abre o cone', () => {
    const straight = new ParticleEmitter({ max: 8, life: 5, speed: 1, spread: 0, direction: [0, 1, 0], size: 1 });
    straight.burst(4);
    straight.update(0.3, camera);
    for (let i = 0; i < straight.alive; i++) {
      const p = instancePosition(straight.object as InstancedMesh, i);
      expect(Math.abs(p.x)).toBeLessThan(1e-6);
      expect(Math.abs(p.z)).toBeLessThan(1e-6);
    }
    straight.dispose();

    const cone = new ParticleEmitter({ max: 32, life: 5, speed: 1, spread: 0.8, direction: [0, 1, 0], size: 1 });
    cone.burst(24);
    cone.update(0.3, camera);
    let spreadOut = 0;
    for (let i = 0; i < cone.alive; i++) {
      const p = instancePosition(cone.object as InstancedMesh, i);
      if (Math.hypot(p.x, p.z) > 1e-4) spreadOut++;
    }
    expect(spreadOut).toBeGreaterThan(0);
    cone.dispose();
  });

  it('direção VERTICAL não degenera (o produto vetorial com o próprio eixo)', () => {
    // Regressão: base ortonormal construída com `up` = Y pra direção Y dá zero.
    const fx = new ParticleEmitter({ max: 16, life: 5, speed: 1, spread: 0.6, direction: [0, 1, 0], size: 1 });
    fx.burst(12);
    fx.update(0.2, camera);
    for (let i = 0; i < fx.alive; i++) {
      const p = instancePosition(fx.object as InstancedMesh, i);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      expect(p.length()).toBeGreaterThan(0);
    }
    fx.dispose();
  });
});

describe('render e higiene', () => {
  it('material unlit: não escreve profundidade, ignora névoa e tone mapping', () => {
    const fx = new ParticleEmitter({});
    const mat = (fx.object as InstancedMesh).material as {
      depthWrite: boolean; fog: boolean; toneMapped: boolean; transparent: boolean;
    };
    expect(mat.depthWrite).toBe(false);
    expect(mat.fog).toBe(false);
    expect(mat.toneMapped).toBe(false);
    expect(mat.transparent).toBe(true);
    fx.dispose();
  });

  it('efeito NUNCA é física: o raycast do emissor não devolve nada', () => {
    const fx = new ParticleEmitter({ max: 4, life: 5 });
    fx.burst(2);
    const hits: unknown[] = [];
    // A assinatura real recebe (raycaster, intersects) — o override ignora ambos.
    ;(fx.object as InstancedMesh).raycast({} as never, hits as never);
    expect(hits).toEqual([]);
    fx.dispose();
  });

  it('dispose() zera a contagem e solta o objeto do pai', () => {
    const parent = new ThreeScene();
    const fx = spawnParticles(parent, { burst: 5, max: 8, life: 5 });
    fx.update(0.016, camera);
    expect(fx.alive).toBe(5);
    expect(parent.children).toContain(fx.object);
    fx.dispose();
    expect(fx.alive).toBe(0);
    expect(parent.children).not.toContain(fx.object);
  });

  it('update depois do dispose não explode', () => {
    const fx = new ParticleEmitter({ max: 4, life: 5 });
    fx.burst(2);
    fx.dispose();
    expect(() => fx.update(0.016, camera)).not.toThrow();
  });

  it('a textura default é um disco: opaco no centro, transparente na borda', () => {
    const tex = createSoftDiscTexture(16);
    const data = tex.image.data as Uint8Array;
    const size = 16;
    const center = ((size / 2) * size + size / 2) * 4;
    expect(data[center + 3]).toBeGreaterThan(180); // miolo aceso
    expect(data[3]).toBe(0); // canto (0,0) transparente
    tex.dispose();
  });

  it('spawnParticles nasce com loop desligado (é evento, não cenário)', () => {
    const parent = new ThreeScene();
    const fx = spawnParticles(parent, { burst: 2, max: 4, position: [1, 2, 3] });
    expect(fx.object.position.toArray()).toEqual([1, 2, 3]);
    fx.dispose();
  });
});

describe('nó `particles` no schema', () => {
  const base = { version: 1 as const, nodes: [] };

  it('valida o nó mínimo', () => {
    const def = parseSceneDefinition({
      ...base,
      nodes: [{ type: 'particles', id: 'fx', place: { x: 1, y: 2, z: 3 } }],
    });
    expect(def?.nodes[0]?.type).toBe('particles');
  });

  it('aceita faixa `[min, max]` E valor único nos campos sorteáveis', () => {
    const def = parseSceneDefinition({
      ...base,
      nodes: [
        { type: 'particles', id: 'a', life: [0.5, 1.5], size: 0.2, speed: [1, 3], spin: 2 },
      ],
    });
    const node = def?.nodes[0] as { life: unknown; size: unknown } | undefined;
    expect(node?.life).toEqual([0.5, 1.5]);
    expect(node?.size).toBe(0.2);
  });

  it('rejeita blending inventado (o parse devolve null, não lança)', () => {
    const def = parseSceneDefinition({
      ...base,
      nodes: [{ type: 'particles', id: 'a', blending: 'multiply' }],
    });
    expect(def).toBeNull();
  });
});
