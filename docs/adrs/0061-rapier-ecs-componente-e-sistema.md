# 0061 - Rapier no ECS: componente de corpo + sistema (dono do transform)

**Data:** 2026-06-11
**Status:** aceito

## Contexto

O spike (TDR-0002) validou o `RapierPhysics` (wrapper headless: cria mundo, adiciona
corpos, dá `step`) e o lazy-load do WASM. Falta **plugar no ECS** pra um jogo usar:
declarar um corpo num objeto e ver o Rapier mover a malha.

Decisões em aberto: como o corpo vira **componente** (dado), e **quem é dono do
transform** de um corpo dinâmico (o Rapier calcula posição+rotação por frame).

## Decisão

### Um componente: `RapierBodyComponent`

Pra v1, **um componente só** carrega corpo + collider (em vez de `RigidBody` +
`Collider` separados como na Unity) — casa com o gesto "torna esse objeto físico" e
é simples de autorar. Dado:

```ts
new RapierBodyComponent({
  type: 'dynamic' | 'fixed' | 'kinematic',     // default 'dynamic'
  shape: { kind: 'auto' }                        // caixa do bounds do mesh (default)
       | { kind: 'box'; halfExtents }
       | { kind: 'ball'; radius }
       | { kind: 'capsule'; halfHeight; radius },
  restitution?, friction?, isSensor?,
})
```

Guarda o handle do corpo (`body: PhysicsBody | null`), criado preguiçosamente pelo
sistema. `auto` deriva uma caixa do `Box3.setFromObject` (respeita escala).

### `RapierPhysicsSystem(physics)` — o Rapier é DONO do transform

`requiredComponents = [Object3DComponent, RapierBodyComponent]`. Recebe um
`RapierPhysics` **já criado** (o `await create()` async fica fora — no boot do jogo),
então o sistema é **síncrono** (encaixa no `World.tick`). Por tick:
1. cria os corpos que faltam (a partir da pose ATUAL do `Object3D` + a spec);
2. avança a simulação com **timestep fixo** (acumulador, 1/60, com teto de passos
   pra evitar "spiral of death");
3. **escreve direto no `Object3D`** (posição + **quaternion**) a partir do corpo.

**Dono do transform:** um corpo físico é governado pelo Rapier — o sistema escreve no
`Object3D` direto, **fora** do `TransformComponent`/`Object3DSyncSystem`. Então uma
entidade física **não** deve também rodar o `Object3DSyncSystem` (que escreveria a
partir do `TransformComponent` e brigaria). Quem usa Rapier num objeto não usa o
caminho cinemático antigo nele.

### Async no boot

O jogo faz `const physics = await RapierPhysics.create(gravity)` e
`world.addSystem(new RapierPhysicsSystem(physics))`. O lazy-load do `rapier.js`
acontece nesse `create` (sob demanda).

## Consequências

- **+** Declarar física vira dado num componente; o Rapier cuida de gravidade/colisão/
  empilhamento de verdade. Testável (sistema síncrono recebe o `physics` pronto).
- **+** Base pronta pra autoria data-driven (overlay/Inspector) e pro
  `CharacterController` do Rapier numa próxima fatia.
- **−** "Dono do transform" exige disciplina: não misturar Rapier + Object3DSync na
  mesma entidade. Documentado; o `buildScene` cuidará disso na fatia data-driven.
- **−** Timestep: v1 com acumulador simples (1/60). Determinismo fino/sub-stepping
  avançado fica pra depois.
- Migração dos 4 mundos atuais (core/Physics, 2.5D, Character, Kinematic) pro Rapier
  vem por fases — convivem enquanto isso. Ver TDR-0002.
