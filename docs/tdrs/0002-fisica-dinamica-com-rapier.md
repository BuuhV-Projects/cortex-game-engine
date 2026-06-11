# 0002 - Física dinâmica com Rapier

**Data:** 2026-06-10
**Status:** aceito (planejado — fase 2, depois da decomposição do editor ADR-0060)

## Contexto

A física hoje está **fragmentada em 4 "mundos" paralelos** que se sobrepõem e não
batem com o modelo mental de quem vem da Unity:

| Mundo | Componentes | Uso |
|---|---|---|
| `core/Physics.ts` | `RigidBodyComponent` + `ColliderComponent` + `PhysicsSystem` (3D AABB, massa) | genérico |
| 2.5D | `Collider2DComponent` + `PlatformerBodyComponent` | plataforma |
| Character | `CharacterBodyComponent` + `CharacterPhysicsSystem` | player/NPC |
| Kinematic | `KinematicBodyComponent` + `TerrainCollisionSystem` | terreno |

São colisões caseiras (AABB/raycast), sem corpos dinâmicos de verdade (empilhar,
empurrar, juntas, materiais, sleeping), e cada uma com autoria/edição própria. O
objetivo é uma física **alinhada à Unity**: Rigidbody (dynamic/kinematic/static) +
Collider (box/sphere/capsule, `isTrigger`) + CharacterController, com autoria em
camadas (script/JSON → Inspector → overlay).

## Decisão

Adotar **Rapier** (`@dimforge/rapier3d`, WASM) como motor de física dinâmica,
substituindo gradualmente os mundos caseiros por um único modelo Unity-like.
Rapier (vs cannon-es / ammo): API moderna determinística, performático (Rust/WASM),
mantido, com character controller embutido (kinematic capsule + colisão/step/slope)
— cobre exatamente o nosso caso.

Encaixa no **módulo de autoria de física** isolado pela decomposição do editor
(ADR-0060): o overlay vira a fonte de dados (`data.physics[id]`), o Inspector
visualiza/edita, e o `PhysicsAuthoring` mapeia isso pra corpos/colliders do Rapier.

### Pacote: `@dimforge/rapier3d-compat` (empacotado), não o addon por CDN

O three.js tem um helper `RapierPhysics` (`examples/jsm/physics/RapierPhysics.js`),
mas ele faz `import()` **dinâmico de um CDN** (`cdn.skypack.dev/@dimforge/rapier3d-compat`)
— **inviável** pro nosso engine **vendorizado/offline** (a IDE empacotada não pode
buscar JS em runtime). Então:
- instalar **`@dimforge/rapier3d-compat`** como dependência e **empacotar no bundle**
  (a variante `-compat` **embute o WASM inline em base64** no próprio JS → **sem
  `.wasm` separado**, só um `await RAPIER.init()` async no boot — vendoring simples);
- usar o addon do three só como **referência** (geometria→shape, step, sync de mesh);
  a integração real é um **`RapierPhysicsSystem` nosso** (ECS + `GameLoop` de timestep
  fixo + `KinematicCharacterController`), lendo dos componentes data-driven.

## Consequências

- **+** Física dinâmica robusta (empurrar/empilhar/juntas), character controller
  pronto, um modelo só alinhado à Unity. Acaba a fragmentação.
- **−** Nova dependência **WASM** (~bundle): carregar/instanciar o módulo no boot
  (async), empacotar o `.wasm` no vendor e no build da IDE. Integrar o passo do
  Rapier ao `GameLoop` (fixed timestep) e sincronizar com o `Object3D` (ECS).
- **−** Migração: mapear/aposentar os 4 mundos atuais sem quebrar jogos existentes
  (plataform-25d, farm-villey) — feito por fases, com fallback enquanto convive.
- **Pré-requisito:** ADR-0060 (editor decomposto) — pra a física entrar num módulo
  dedicado. Detalhes do modelo de componentes virão num ADR próprio na fase 2.
