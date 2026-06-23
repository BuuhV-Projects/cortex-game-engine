# 0074 - Controle de terceira pessoa (port do Unity StarterAssets)

**Data:** 2026-06-22
**Status:** aceito — implementado (`ThirdPersonControlSystem`, `setupThirdPerson`)

## Contexto

O demo padrão de projeto novo era 1ª pessoa (`setupFirstPerson`, ADR-0064). Faltava um
**player de teste em 3ª pessoa** (personagem visível + câmera atrás), o estilo mais comum
pra open-world/aventura. A referência pedida foi o **Unity StarterAssets ThirdPerson**
(câmera orbital por mouse, movimento relativo à câmera, personagem vira pra direção do
movimento, corre/pula).

**⚠️ Licença.** O StarterAssets está sob **Unity Companion License (UCL)**, que permite
usar os assets **só em conjunto com a Unity**. Usar a **arte** (mesh/animações/texturas
do mannequin) noutra engine **viola a UCL**. Decisão: portar o **comportamento**
(código, que é lógica de jogo genérica reescrita no idioma da engine) e tratar a **arte
como placeholder temporário** — o dono do projeto assumiu a responsabilidade pela licença
e vai **substituir a arte** depois. A arte da Unity **não** é redistribuída no bundle do
engine (vai como asset de projeto).

## Decisão

### 1. Comportamento portado — `ThirdPersonControlSystem` (`src/systems/`)
Um sistema que mira a entidade com `TransformComponent` + `CharacterBodyComponent` e faz:
- **Câmera orbital** por mouse (pointer lock), pitch clampado (Unity TopClamp 70° /
  BottomClamp −30°), atrás/acima do alvo por yaw/pitch+distância.
- **Movimento relativo à câmera** (WASD), **corrida** com Shift (MoveSpeed 2 /
  SprintSpeed 5.335 do Unity), **pulo** com Espaço (sobre o `CharacterBodyComponent` —
  gravidade/colisão/aterragem já existentes).
- O **personagem vira** suavemente pra direção do movimento (RotationSmoothTime 0.12);
  `facingOffset` ajusta se o modelo nascer virado ao contrário.
- **Animação** (idle/walk/run/jump/fall) dirigida pelo estado (velocidade horizontal +
  `grounded` + `velocityY`) via `deriveLocomotion`/`autoMapPlayerClips` (ADR-0054) tocando
  no `SceneAnimator` (`userData.cortexAnim`).
- **`setupThirdPerson(game, opts)`** (`src/scene/ThirdPerson.ts`) espelha o
  `setupFirstPerson`: registra `Object3DSyncSystem` + o controle; pausa no editor (F2).

### 2. Pipeline de arte (FBX → GLB)
Script Blender (`.stage/convert_thirdperson.py`) importa o `Armature.fbx` + cada FBX de
animação, renomeia a action pro nome lógico (idle/walk/run/jump/fall/land), empilha em
NLA tracks e exporta **um GLB** com mesh rigado + clipes nomeados. O `buildScene` já cria
o `SceneAnimator` pra `model` com clipes; o player é um nó `model` `.glb` marcado
`character`. Animações **auto-mapeadas** pelos nomes (clipes já se chamam idle/walk/…).

### 3. Arte do personagem — **KayKit (CC0)**, não a da Unity
O port do mannequin Humanoid da Unity (StarterAssets) ficou ruim: animação Humanoid não
casa direto com o rig exportado (bugava/travava) **e** a arte é UCL (proibida fora da
Unity). **Decisão revista:** usar o **KayKit Character Animations** (Kay Lousberg, **CC0**),
que é **glTF-nativo** (sem retarget) e livre. Merge no Blender
(`.stage/convert_kaykit.py`): `Mannequin_Medium.glb` (mesh+rig) + clipes escolhidos dos
`Rig_Medium_*.glb` (Idle_A→idle, Walking_A→walk, Running_A→run, Jump_Full_Long→jump,
Jump_Idle→fall, Jump_Land→land) → **um GLB** (~0,6 MB). Vai no **template**
(`templates/new-project/assets/characters/player.glb`) via **Git LFS**. Sem problema de
licença. (O `convert_thirdperson.py` do FBX da Unity fica como referência, não usado.)

## Consequências

- **3ª pessoa numa linha** (`setupThirdPerson`) ao lado de `setupFirstPerson`/`setupTopDown`.
- **Reusa** CharacterBody/CharacterPhysics (gravidade/pulo/colisão de parede — ADR-0071) e
  o sistema de animação data-driven (ADR-0054). Sem física nova.
- **Sem risco de licença:** a arte virou **KayKit CC0** (a do Unity StarterAssets foi
  descartada — UCL + animação Humanoid bugava no port). O **comportamento** (controller)
  segue inspirado no StarterAssets, reescrito.
- **Fora de escopo:** strafe/aim-mode, animações de virar parado, footstep SFX, blend de
  velocidade (usa crossfade simples). Câmera com colisão (não atravessar parede) também.
- **API pública nova** (`setupThirdPerson`, `ThirdPersonControlSystem`) → `docs:engine`,
  `engine-api.md`/`architecture.md`, re-vendorizar.
