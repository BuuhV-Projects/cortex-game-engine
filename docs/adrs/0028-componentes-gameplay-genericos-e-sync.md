# 0028 - Componentes de gameplay genéricos + Object3DSyncSystem no engine

**Data:** 2026-05-31
**Status:** aceito

## Contexto

O projeto cliente `corrida-teste` desenvolveu uma base de gameplay reutilizável
que vivia acoplada ao jogo: um transform lógico (`TransformComponent`), a ligação
entidade↔mesh (`Object3DComponent`), o sistema que sincroniza um no outro
(`Object3DSyncSystem`) e estado físico (`velocityY`/`grounded`/`speed`) embutido
no `VehicleComponent`. Nada disso é específico de corrida — qualquer jogo precisa.

Esta é a **Fase 1** da migração descrita em `D:\jogos\corrida-teste\ENGINE_MIGRATION.md`
(decisão de migrar tudo, faseado). As fases seguintes (física kinemática, câmera de
perseguição, editor, cena em JSON) dependem desta fundação.

Decisão de modelo (com o usuário): o engine adota um **transform lógico** separado do
`Object3D` de renderização, espelhando o padrão do corrida-teste, em vez de operar
direto no `Object3D` ou reusar o `RigidBodyComponent` (que tem propósito diferente —
colisão por impulso).

## Decisão

Adicionados ao engine, re-exportados em `src/index-runtime.ts`:

**Componentes** (`src/components/`):
- `TransformComponent { x, y, z, rotationY }` — transform lógico no plano XZ + altura.
- `Object3DComponent { object }` — liga a entidade ao mesh.
- `KinematicBodyComponent { velocityY, grounded, horizontalSpeed }` — estado de corpo
  movido por raycast (generaliza o acoplamento que estava em `VehicleComponent`).
- `FollowCameraTargetComponent`, `EditableTargetComponent` — marcadores.

**Sistema** (`src/systems/`):
- `Object3DSyncSystem` (priority 10) — copia `TransformComponent`→`Object3D` e força
  `rotation.order = 'YXZ'` a cada frame, pra que sistemas downstream (ex.: conformação
  ao terreno, que **fica no jogo**) apliquem pitch/roll locais ao yaw já aplicado.

**Re-exports de three** (item 7 do doc): `Audio`, `PositionalAudio`, `AudioListener`,
`DoubleSide`/`FrontSide`/`BackSide`, e os addons `TransformControls`/`OrbitControls`
(de `three/examples/jsm/controls/*`). Evita import direto de `three` no projeto
vendoriado (que não tem `three` no node_modules).

**Suporte de tooling:**
- `VENDOR_TYPE_MODULES` em `electron/main.ts` estendido com `components` e `systems`,
  pra os `.d.ts` irem ao projeto vendoriado e ao Monaco.
- Regex do agregador de types do Monaco passou a strippar `.js` de **qualquer** import
  (não só relativos), pra os addons `three/examples/jsm/...` resolverem contra
  `@types/three`.

## Consequências

- Coexiste com `RigidBodyComponent`/`PhysicsSystem` (src/core/Physics.ts), que continuam
  sendo a via de colisão por impulso/AABB. São abstrações distintas para usos distintos;
  um próximo ADR cobrirá a física kinemática raycast (Fase 2).
- `KinematicBodyComponent` ainda **não** é usado pelo corrida-teste — o `VehicleComponent`
  segue com `velocityY/grounded/speed` até a Fase 2, quando os sistemas de física que os
  consomem forem migrados (evita quebrar sistemas locais ainda não portados).
- Conformação ao terreno (pitch/roll, ex-`VehicleSuspensionSystem`) **não migrou** —
  decisão do usuário: não é primitivo de engine (Unity/Unreal resolvem via suspensão de
  rodas, não via componente). Fica no jogo, e depende do `rotation.order='YXZ'` que o
  `Object3DSyncSystem` garante.
- corrida-teste migrado: imports locais trocados por `cortex-game-engine`, arquivos
  locais removidos, build (`vite build`) verde.
