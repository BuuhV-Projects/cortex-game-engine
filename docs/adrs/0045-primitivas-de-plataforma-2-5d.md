# 0045 - Primitivas de plataforma 2.5D no engine

**Data:** 2026-06-05
**Status:** aceito

## Contexto

O produto passou a focar em jogos de plataforma 2.5D estilo Mario Wonder /
Rayman Legends (PRD-0003): gameplay no plano **XY** (cima, baixo, lados), com
profundidade visual em Z e câmera que segue o player no plano, podendo ter um
leve giro 2.5D no eixo central. O engine tinha física genérica de impulso
(`PhysicsSystem`/`ColliderComponent` 3D) e física de veículo (removida,
ADR-0029), mas **nada** que entregasse o feel de plataforma: gravidade
consistente, colisão AABB previsível, plataformas atravessáveis por baixo
(one-way), input de pulo e câmera 2D-follow. Cada projeto reescreveria isso à
mão — inconsistente e fora do foco do produto.

## Decisão

Conjunto de primitivas de plataforma 2.5D no engine, montáveis numa linha:

1. **`Collider2DComponent`** (`src/components/`): AABB no plano XY —
   `(halfWidth, halfHeight, solid = true, oneWay = false)`. Nome com sufixo `2D`
   pra não colidir com o `ColliderComponent` 3D de `core/Physics.ts`.

2. **`PlatformerBodyComponent`**: estado do corpo dinâmico — `vx, vy, grounded,
   moveDir, jumpQueued` + ctor `(moveSpeed, jumpSpeed, gravity, maxFall)`. Só os
   atores (player/inimigos) têm body; o cenário tem só `Collider2D` (sólido).

3. **`PlatformerPhysicsSystem`** (priority 5): separa atores (com body) de
   sólidos; aplica gravidade e resolve colisão **AABB por eixo** (move X, resolve;
   move Y, resolve) — evita travar em quinas. Plataformas `oneWay` colidem só por
   cima (atravessa subindo, pousa descendo). Testável em Node (sem WebGPU).

4. **`PlatformerInputSystem`**: teclado → intenção (`moveDir`, `jumpQueued`) no
   body, sem tocar na física diretamente.

5. **`FollowCamera2DSystem`**: segue o `FollowCameraTarget` no plano XY (offset,
   distância, bounds); `setRoll(rad)` aplica o leve giro 2.5D via `camera.up =
   (sin, cos, 0)` — **travado por padrão** (roll 0), liberável pelo dev.

6. **`setupPlatformer(game, opts)`** (`src/scene/Platformer.ts`): registra
   `Object3DSyncSystem` + input + física + câmera de uma vez; retorna
   `{ followCamera }`. Input e física recebem `pauseWhen = () => game.editorActive`
   (ADR-0046). Reduz o bootstrap de um nível a uma linha.

7. **Integração data-driven** (ADR-0044): nós de cena com `collider`/`player`
   (schemas em `SceneDefinition`) viram entidades ECS via
   `createPlatformerEntity` dentro de `buildScene(..., { world })`. O nível é
   autorado como JSON; a física vem das primitivas.

Exports adicionados em `src/index-runtime.ts`; vendoring de tipos do IDE e
`engine-api.md` (curada, injetada no prompt da IA) atualizados.

## Consequências

- Um nível de plataforma jogável sai de `setupPlatformer` + `buildScene` — o
  template já abre rodando (PRD-0003). Dev não reescreve física por projeto.
- O engine permanece 3D por baixo (three/WebGPU); a "2.5D" é convenção de
  gameplay (plano XY) + câmera, não um motor 2D separado.
- Física de plataforma é **AABB**, não a física de impulso genérica — coexistem,
  mas um jogo de plataforma usa as primitivas novas, não `PhysicsSystem`.
- Câmera com roll mexe em `camera.up`; se o dev liberar giros fortes, conferir
  que o frustum/projeção ainda enquadram a ação.
- Validável em Node: `PlatformerPhysicsSystem` tem testes unitários (sem WebGPU).
- Relaciona-se com ADR-0028 (componentes de gameplay genéricos + sync), 0044
  (cena data-driven que instancia essas entidades), 0046 (editor pausa a
  gameplay) e PRD-0003 (a direção de produto que motiva tudo isto).
