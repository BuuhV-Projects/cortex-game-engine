# 0064 - Câmera/controle de 1ª pessoa (FPS) e demo padrão 3D

**Data:** 2026-06-13
**Status:** aceito

## Contexto

O ADR-0062 estabeleceu o engine como **3D por padrão** (sem tipo de projeto). Mas o
template de "projeto novo" (`templates/new-project/`) ainda entregava um **platformer
2.5D**: `level.json` com chão/plataformas em box + um `player` (corpo de plataforma)
e `main.ts` chamando `setupPlatformer` (câmera 2D-follow no plano XY). O primeiro
contato com o engine, portanto, contradizia o "3D por padrão".

O engine já tinha as peças de física pra um player 3D — `CharacterBodyComponent`
(cápsula: gravidade/pulo/step) + `CharacterPhysicsSystem` (aterra por raycast na
cena, inclui terreno) e o nó `terrain` (esculpível/pintável, ADR-0059/0063) — mas
**não tinha câmera de primeira pessoa**: só `FollowCamera2DSystem` (2.5D),
`ThirdPersonCameraSystem` e `TopDownCameraSystem`.

## Decisão

1. **Novo `FirstPersonCameraSystem`** (`src/systems/`) — câmera + controle de 1ª
   pessoa num só sistema (`priority = 20`, roda depois da física): mouse-look com
   *pointer lock* (yaw/pitch, pitch clampado), caminhada WASD no plano XZ relativa
   ao olhar (escreve `transform.x/z` + `rotationY`), pulo no Espaço
   (`CharacterBody.jump()`) e a câmera na **altura dos olhos** (pés + `eyeHeight`).
   Mira o **único** player (entity com `TransformComponent` + `CharacterBodyComponent`),
   mesmo padrão "espera no máximo um" do `ThirdPersonCameraSystem`. Estado de
   yaw/pitch é interno (single-player). Trava o cursor ao clicar no canvas, **só**
   quando não pausado.

2. **Helper `setupFirstPerson(game, opts)`** (`src/scene/FirstPerson.ts`, espelha
   `setupPlatformer`) — registra `Object3DSyncSystem` + `FirstPersonCameraSystem`
   com `pauseWhen = () => game.editorActive || game.gameplayPaused`. A física
   vertical do player vem do `buildScene` (que registra o `CharacterPhysicsSystem`
   ao ver o nó `character`).

3. **Demo padrão = terreno vazio + player cápsula em 1ª pessoa.** O
   `templates/new-project/scenes/level.json` passa a ter um nó `terrain` (plano,
   `size: 60`) e um nó `player` `primitive` cilindro com campo `character` (cápsula);
   o `main.ts` usa `setupFirstPerson`. A física do player continua **dado da cena**,
   editável no Inspector (regra do CLAUDE.md / ADR-0058): o que é "wiring de
   gameplay" (mover/olhar) fica no `main.ts`, não na cena.

4. **Sem mudar `SceneDefinition`/`SceneBuilder`.** Reusa o nó `character` e o
   `CharacterBodyComponent` existentes; o alvo é resolvido por query. Mínima
   superfície de mudança.

## Consequências

- O primeiro contato com o engine é um jogo **3D em 1ª pessoa**, coerente com o
  "3D por padrão" (ADR-0062). Quem quer 2.5D/2D pede pro Chat IA ou troca a câmera
  (a camada 2.5D `setupPlatformer`/`FollowCamera2DSystem` continua intacta).
- O FPS é **single-player** por design (yaw/pitch internos ao sistema, alvo único).
  Multi-câmera/split-screen ou personagem trocável exigiria mover o estado pra um
  componente (`FirstPersonControllerComponent`) — evolução natural se precisar.
- O pointer lock depende do navegador conceder o lock no clique do canvas; em
  contextos sem `document` (headless) o look é inerte (consome o delta sem girar).
- API pública nova (`FirstPersonCameraSystem`, `setupFirstPerson`): exportada em
  `src/index-runtime.ts`, documentada em `engine-api.md` (injetado no Chat IA) e na
  API gerada (`yarn docs:engine`). Relaciona-se com 0062 (3D por padrão), 0059
  (terreno) e 0040 (template rico).
