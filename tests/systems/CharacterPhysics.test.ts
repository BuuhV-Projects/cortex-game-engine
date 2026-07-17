/**
 * Testes do character controller (CharacterBodyComponent + CharacterPhysicsSystem)
 * + aterramento no terreno (TerrainCollisionSystem): gravidade limitada, pulo
 * (jumpForce/maxJumps), e o personagem ficando EM CIMA do terreno.
 */
import { describe, it, expect } from 'vitest';
import { Object3D, Mesh, SkinnedMesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { World } from '../../src/ecs/World.js';
import { Terrain } from '../../src/scene/Terrain.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { TerrainComponent } from '../../src/components/TerrainComponent.js';
import { CharacterPhysicsSystem } from '../../src/systems/CharacterPhysicsSystem.js';
import { TerrainCollisionSystem } from '../../src/systems/TerrainCollisionSystem.js';
import { Vegetation, makePlaceholderVegetation } from '../../src/scene/Vegetation.js';

describe('CharacterPhysicsSystem', () => {
  it('gravidade puxa pra baixo (limitada por fallSpeedMax)', () => {
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem());
    const e = world.createEntity();
    const t = new TransformComponent(0, 10, 0);
    const c = new CharacterBodyComponent({ gravity: 30, fallSpeedMax: 25 });
    e.addComponent(t);
    e.addComponent(c);
    world.tick(100); // 0.1s
    expect(c.velocityY).toBeCloseTo(-3); // -30*0.1
    expect(t.y).toBeLessThan(10);
    // acumula até o teto de queda
    for (let i = 0; i < 60; i++) world.tick(100);
    expect(c.velocityY).toBeCloseTo(-25); // limitado por fallSpeedMax
  });

  it('jump() aplica jumpForce e respeita maxJumps', () => {
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem());
    const e = world.createEntity();
    const c = new CharacterBodyComponent({ jumpForce: 9, maxJumps: 1 });
    e.addComponent(new TransformComponent(0, 0, 0));
    e.addComponent(c);
    c.jump();
    world.tick(16);
    expect(c.velocityY).toBeGreaterThan(0); // subiu (jumpForce - gravidade do tick)
    expect(c.jumpsUsed).toBe(1);
    c.jump(); // sem pulos disponíveis (maxJumps 1, não aterrou)
    const vBefore = c.velocityY;
    world.tick(16);
    expect(c.jumpsUsed).toBe(1); // não pulou de novo
    expect(c.velocityY).toBeLessThan(vBefore); // só caiu pela gravidade
  });
});

describe('CharacterBody + piso plano (groundY, sem raycast)', () => {
  it('cai e PARA no groundY (estável: não passa, não treme)', () => {
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem());
    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0);
    const c = new CharacterBodyComponent({ groundY: 0 });
    e.addComponent(t);
    e.addComponent(c);

    for (let i = 0; i < 120; i++) world.tick(16);
    expect(t.y).toBe(0); // aterrou exatamente no piso (clamp determinístico)
    expect(c.grounded).toBe(true);
    expect(c.velocityY).toBe(0);
    expect(c.jumpsUsed).toBe(0);

    // mais ticks no chão: continua cravado (sem tremor/oscilação)
    for (let i = 0; i < 10; i++) world.tick(16);
    expect(t.y).toBe(0);
  });

  it('groundY pode ser != 0 (altura de spawn em top-down)', () => {
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem());
    const e = world.createEntity();
    const t = new TransformComponent(0, 8, 0);
    const c = new CharacterBodyComponent({ groundY: 3 });
    e.addComponent(t);
    e.addComponent(c);
    for (let i = 0; i < 120; i++) world.tick(16);
    expect(t.y).toBe(3);
    expect(c.grounded).toBe(true);
  });
});

describe('CharacterBody + colisão real (raycast na geometria, tipo Unity)', () => {
  function sceneWithFloor(topY: number): Object3D {
    const scene = new Object3D();
    const floor = new Mesh(new BoxGeometry(40, 1, 40), new MeshBasicMaterial());
    floor.position.y = topY - 0.5; // topo do box em topY
    scene.add(floor);
    scene.updateMatrixWorld(true);
    return scene;
  }

  it('a geometria VENCE o piso de fallback (piso alto não mascara o chão real)', () => {
    // Regressão do print: marcar Character no alto gravava groundY alto; o piso NÃO
    // pode sobrepor a geometria embaixo (senão o personagem fica BOIANDO no ar).
    const scene = sceneWithFloor(2); // chão real em y=2
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const e = world.createEntity();
    const t = new TransformComponent(0, 12, 0); // bem no alto
    const c = new CharacterBodyComponent({ groundY: 50 }); // piso de segurança ALTO (acima do chão)
    e.addComponent(t);
    e.addComponent(c);

    for (let i = 0; i < 200; i++) world.tick(16);
    expect(t.y).toBeCloseTo(2, 1); // pousou no mesh (2), NÃO no piso alto (50)
    expect(c.grounded).toBe(true);
  });

  it('estável no chão: não treme (Y constante após pousar)', () => {
    const scene = sceneWithFloor(0);
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const e = world.createEntity();
    const t = new TransformComponent(0, 3, 0);
    e.addComponent(t);
    e.addComponent(new CharacterBodyComponent());
    for (let i = 0; i < 120; i++) world.tick(16); // pousa
    const settled = t.y;
    const ys: number[] = [];
    for (let i = 0; i < 30; i++) { world.tick(16); ys.push(t.y); }
    // sem oscilação: todo frame fica cravado na mesma altura
    for (const y of ys) expect(y).toBe(settled);
  });

  it('ignora o próprio mesh (não se apoia em si mesmo)', () => {
    const scene = sceneWithFloor(0);
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const selfMesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial());
    scene.add(selfMesh);
    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0);
    e.addComponent(t);
    e.addComponent(new Object3DComponent(selfMesh));
    e.addComponent(new CharacterBodyComponent());
    const sync = (): void => { selfMesh.position.set(t.x, t.y, t.z); selfMesh.updateMatrixWorld(true); };
    sync();
    for (let i = 0; i < 120; i++) { world.tick(16); sync(); }
    expect(t.y).toBeCloseTo(0, 1); // pousou no FLOOR, não no próprio mesh
  });

  it('sem raízes (sem colisão), usa só o piso groundY', () => {
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem()); // sem colisão
    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0);
    const c = new CharacterBodyComponent({ groundY: 1 });
    e.addComponent(t);
    e.addComponent(c);
    for (let i = 0; i < 120; i++) world.tick(16);
    expect(t.y).toBe(1);
    expect(c.grounded).toBe(true);
  });

  it('footOffset ancora os PÉS no chão (mesh de origem central não afunda)', () => {
    // Primitiva (cilindro/box) tem origem no CENTRO; footOffset = altura/2. A física
    // ancora os pés (t.y − footOffset) no chão → a origem fica footOffset acima.
    const scene = sceneWithFloor(0); // chão em y=0
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0);
    const c = new CharacterBodyComponent({ footOffset: 0.8 });
    e.addComponent(t);
    e.addComponent(c);
    for (let i = 0; i < 200; i++) world.tick(16);
    expect(t.y).toBeCloseTo(0.8, 1); // pés em 0 → origem em 0.8 (não afundou pra 0)
    expect(c.grounded).toBe(true);
  });
});

describe('SkinnedMesh nunca é chão (ADR-0118)', () => {
  it('personagem NÃO se apoia em malha skinada (cai até o groundY)', () => {
    // Raycast em SkinnedMesh computa o skinning por vértice na CPU a cada raio —
    // catastrófico no Hermes (~150 ms/frame; teste4 caiu a 4,7 fps quando o
    // cute_player denso entrou na cena). Personagem/NPC nunca é superfície
    // pisável, então o collectScene pula skinned por completo.
    const scene = new Object3D();
    const npc = new SkinnedMesh(new BoxGeometry(40, 1, 40), new MeshBasicMaterial());
    npc.position.y = 4.5; // "chão" skinado em y=5, entre o spawn e o groundY
    scene.add(npc);
    scene.updateMatrixWorld(true);

    const world = new World();
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const e = world.createEntity();
    const t = new TransformComponent(0, 10, 0);
    const c = new CharacterBodyComponent({ groundY: 0 });
    e.addComponent(t);
    e.addComponent(c);

    for (let i = 0; i < 200; i++) world.tick(16);
    expect(t.y).toBe(0); // atravessou o skinned e pousou no piso de segurança
    expect(c.grounded).toBe(true);
  });
});

describe('CharacterBody + terreno', () => {
  it('o personagem cai e PARA em cima do terreno via RAYCAST (grounded, pulos resetam)', () => {
    // O chão do character vem do raycast do CharacterPhysicsSystem (o terreno entra
    // como raiz), NÃO do TerrainCollisionSystem (que não trata Character — ver abaixo).
    const world = new World();
    const terrain = new Terrain({ size: 20, resolution: 20 }); // plano em y=0
    const scene = new Object3D();
    scene.add(terrain.mesh);
    scene.updateMatrixWorld(true);
    world.addSystem(new CharacterPhysicsSystem([scene]));

    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0); // começa no ar
    const c = new CharacterBodyComponent();
    e.addComponent(t);
    e.addComponent(c);

    for (let i = 0; i < 120; i++) world.tick(16); // ~2s caindo
    expect(t.y).toBeCloseTo(0, 1); // pousou na superfície (plano = 0)
    expect(c.grounded).toBe(true);
    expect(c.velocityY).toBe(0);
    expect(c.jumpsUsed).toBe(0); // resetou ao aterrar
  });

  it('NÃO atravessa morro íngreme: anti-clip sobe o personagem até a superfície', () => {
    // Regressão: num morro esculpido mais íngreme que o stepHeight, o raycast de chão
    // (origem em pés+stepHeight) não enxerga a superfície ACIMA dele → o personagem caía
    // no groundY plano e ATRAVESSAVA o morro. O clamp anti-clip (raycast só-terreno de
    // bem alto) sobe o personagem até a superfície.
    const world = new World();
    const terrain = new Terrain({ size: 20, resolution: 20 });
    terrain.sculpt(0, 0, 4, 10); // morro íngreme de ~10u no centro
    const surface = terrain.heightAt(0, 0)!;
    expect(surface).toBeGreaterThan(8); // sanity: morro alto

    const scene = new Object3D();
    scene.add(terrain.mesh);
    scene.updateMatrixWorld(true);
    world.addSystem(new CharacterPhysicsSystem([scene]));

    const e = world.createEntity();
    const t = new TransformComponent(0, 1, 0); // DENTRO do morro (abaixo da superfície ~10)
    const c = new CharacterBodyComponent({ groundY: 0 });
    e.addComponent(t);
    e.addComponent(c);

    world.tick(16);
    expect(t.y).toBeGreaterThan(surface - 0.5); // subiu pra superfície (não atravessou)
    expect(c.grounded).toBe(true);
  });

  it('anti-clip NÃO afeta quem está sobre o terreno plano (não levanta indevidamente)', () => {
    const world = new World();
    const terrain = new Terrain({ size: 20, resolution: 20 }); // plano em y=0
    const scene = new Object3D();
    scene.add(terrain.mesh);
    scene.updateMatrixWorld(true);
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const e = world.createEntity();
    const t = new TransformComponent(0, 3, 0);
    e.addComponent(t);
    e.addComponent(new CharacterBodyComponent());
    for (let i = 0; i < 120; i++) world.tick(16);
    expect(t.y).toBeCloseTo(0, 1); // pousou no plano (0), o anti-clip não empurrou pra cima
  });

  it('vegetação sólida empurra o player pra fora do tronco (cilindro, sem raycast)', () => {
    const world = new World();
    const veg = new Vegetation(makePlaceholderVegetation('tree'));
    veg.setInstances([0, 0, 0, 0, 1]); // uma árvore na origem (escala 1)
    veg.group.userData['cortexVegetation'] = veg; // (makeVegetation faz isso no engine)
    veg.group.userData['cortexSolid'] = true; // colide
    const scene = new Object3D();
    scene.add(veg.group);
    scene.updateMatrixWorld(true);
    world.addSystem(new CharacterPhysicsSystem([scene]));

    const e = world.createEntity();
    const t = new TransformComponent(0.1, 0, 0); // quase no centro do tronco
    e.addComponent(t);
    e.addComponent(new CharacterBodyComponent({ radius: 0.4, groundY: 0 }));

    world.tick(16);
    const dist = Math.hypot(t.x, t.z);
    expect(dist).toBeGreaterThan(0.7); // empurrado pra fora (raio tronco 0.4 + player 0.4)
  });

  it('vegetação SEM cortexSolid não empurra (grama é atravessável)', () => {
    const world = new World();
    const veg = new Vegetation(makePlaceholderVegetation('grass'));
    veg.setInstances([0, 0, 0, 0, 1]);
    const scene = new Object3D();
    scene.add(veg.group); // sem cortexSolid
    scene.updateMatrixWorld(true);
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const e = world.createEntity();
    const t = new TransformComponent(0.1, 0, 0);
    e.addComponent(t);
    e.addComponent(new CharacterBodyComponent({ radius: 0.4, groundY: 0 }));
    world.tick(16);
    expect(Math.hypot(t.x, t.z)).toBeCloseTo(0.1, 5); // não foi empurrado
  });

  it('TerrainCollisionSystem NÃO move o CharacterBody (raycast é a autoridade única)', () => {
    // Regressão: antes os dois aterravam o character e ele QUICAVA em rampas (raycast
    // no triângulo vs heightAt bilinear divergem). Agora o TerrainCollision ignora
    // Character — quem aterra é o raycast.
    const world = new World();
    world.addSystem(new TerrainCollisionSystem());
    const terrain = new Terrain({ size: 20, resolution: 20 }); // plano em y=0
    const te = world.createEntity();
    te.addComponent(new TerrainComponent(terrain, terrain.mesh));

    const e = world.createEntity();
    const t = new TransformComponent(0, -5, 0); // ABAIXO do terreno
    e.addComponent(t);
    e.addComponent(new CharacterBodyComponent());

    world.tick(16);
    expect(t.y).toBe(-5); // TerrainCollision não subiu o character pra superfície
  });
});
