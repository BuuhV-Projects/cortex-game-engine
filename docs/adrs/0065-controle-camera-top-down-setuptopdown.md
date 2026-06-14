# 0065 - Controle + câmera top-down (setupTopDown)

**Data:** 2026-06-14
**Status:** aceito

## Contexto

O engine já tinha o `TopDownCameraSystem` (câmera 3/4 estilo Stardew que segue o
alvo no plano XZ), mas **não tinha o controle de andar** correspondente: nada que
lesse o teclado e movesse o personagem no plano do chão. Os helpers de bootstrap
existentes cobrem outros estilos — `setupPlatformer` (2.5D, anda só no X) e
`setupFirstPerson` (FPS, mouse-look + WASD relativo ao olhar). Faltava o terceiro
estilo: **top-down de andar livre no XZ** (farm sim / RPG), que é a base do jogo
Hearthvale (Stardew-like 3D; ver memória do projeto).

Sem isso, todo jogo top-down teria que escrever o movimento à mão no `main.ts`.

## Decisão

1. **Novo `TopDownMovementSystem`** (`src/systems/`) — move o player no **plano XZ**
   a partir de um **eixo (`readMove: () => {x,y}`)** que o **jogo** fornece (o input é
   responsabilidade do jogo — ADR-0066; o engine não lê tecla aqui). `x` = ±X, `y`
   cima = −Z; respeita o analógico (magnitude < 1 = mais devagar). Faz o personagem
   **virar na direção do movimento** (`transform.rotationY`). Mira o único player
   (entidade com `TransformComponent` + `CharacterBodyComponent`, `entities[0]` — mesmo
   padrão do ThirdPerson/FirstPerson). **O Y (gravidade/aterrar) fica com o
   `CharacterPhysicsSystem`** (registrado pelo `buildScene` pro nó `character`); este
   sistema só cuida do plano. `moveSpeed` é opção (default 5).

2. **Marca o alvo da câmera automaticamente.** O `TopDownCameraSystem` exige
   `FollowCameraTargetComponent`, mas o nó `character` não o ganha do `buildScene`.
   Pra não exigir autoria manual, o `TopDownMovementSystem` **adiciona o
   `FollowCameraTargetComponent` ao player no 1º update** (se faltar). Roda em
   `priority` baixa (antes da câmera, priority 30), então a câmera acha o alvo no
   mesmo tick.

3. **Helper `setupTopDown(game, opts)`** (`src/scene/TopDown.ts`, espelha
   `setupPlatformer`/`setupFirstPerson`) — registra `Object3DSyncSystem` +
   `TopDownMovementSystem` + `TopDownCameraSystem` (com `angle`/`height` 3/4 default).
   Pausa no editor/pause via `pauseWhen` (base `System.pauseWhen`: como o top-down
   **mostra** o player, não precisa do truque de pausa interna do FPS — pode deixar o
   World pular o update). Câmera em **perspectiva** (default do `Game`), não orto.

## Consequências

- Bootstrap de jogo top-down vira uma linha: `setupTopDown(game)` + player `character`
  na cena. É a base do Hearthvale (andar na fazenda); reutilizável por qualquer
  top-down/RPG.
- Single-player por design (alvo único, igual ThirdPerson/FirstPerson). Multi-player
  exigiria um marcador explícito em vez de `entities[0]`.
- Movimento é **mundo-relativo** (câmera fixa, não rotaciona) — combina com a câmera
  3/4 estática do farm sim. Se um dia a câmera girar, o movimento precisará virar
  câmera-relativo.
- `rotationY = atan2(dx, dz)` assume modelo com frente no +Z; o offset pode precisar
  de ajuste por modelo (placeholder cilíndrico não tem "frente" visível, então é
  inócuo até entrar a arte).
- API pública nova (`TopDownMovementSystem`, `setupTopDown`): exportada no
  `index-runtime`, nos tipos vendorizados (`VENDOR_TYPE_MODULES`) e documentada em
  `engine-api.md` (injetado no Chat IA). Relaciona-se com 0062 (3D por padrão), 0064
  (1ª pessoa) e o `TopDownCameraSystem` (ADR da camada 2D/câmeras).
