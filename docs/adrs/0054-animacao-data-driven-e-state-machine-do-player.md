# 0054 - Animação data-driven e state machine de animação do player

**Data:** 2026-06-08
**Status:** aceito

## Contexto

Os kits trazem personagens animados (KayKit/Quaternius — idle/run/jump/death/…),
mas o engine não tinha caminho **data-driven** pra animação: tocar um clipe exigia
código de jogo (`AnimationMixer` à mão), e o objeto da cena (clone do glTF) nem
carregava os clipes (vivem no `gltf.animations`). Pior pro player: andar/pular eram
comandos soltos no código, sem padrão — não dava pra a IA preencher de forma
consistente, nem pra o editor mostrar/editar a animação por ação.

Queríamos: (1) tocar animação de um modelo via JSON; (2) um **padrão** de animação
do player por **ação** (idle/walk/run/jump/fall) que a IA preenche e o editor edita;
(3) tudo **explícito** — o usuário rejeitou inferência escondida em runtime ("a IA
pode inferir, mas tem que ficar escrito no JSON ou no código"); (4) animação **não
obrigatória**.

## Decisão

Três peças, no mesmo padrão data-driven + ECS do resto (ADR-0044), com precedência
sempre **overlay (editor) > nó (JSON) > default**:

1. **`SceneAnimator`** (`src/scene/`) — envolve um `AnimationMixer` + os clipes do
   glTF (`clipNames`/`play`/`stop`). O `buildScene` cria um por modelo animado e o
   guarda em `obj.userData.cortexAnim`; tica todos no `handle.update`. Nó `model`
   ganhou o campo **`animation`** (`{ clip, loop, speed, autoplay }`) pra um clipe
   só. Editor: seção **"Animação"** no inspector (preview play/stop/loop/velocidade),
   persistida em `data.animation[id]`.

2. **State machine do player** — `PlayerAnimatorComponent` (o **mapa ação→clipe**, o
   "contrato"/padrão) + `PlatformerAnimationSystem` (deriva a ação do
   `PlatformerBodyComponent`: idle/walk/run no chão, jump/fall no ar; toca o clipe
   mapeado no `SceneAnimator`; one-shots via `trigger('attack')`). Campo **`animations`**
   no nó player. `setupPlatformer` registra o system (pausa no editor). Fallback
   automático cobre uma ação sem clipe (run↔walk, fall↔jump, land→idle). Editor:
   seção **"Ações do player"** (dropdown + ▶ preview por ação), persiste em
   `data.playerAnimations[id]`.

3. **Explícito, nunca escondido (correção do usuário).** O `buildScene` **não**
   auto-mapeia em runtime: o player usa só o mapa escrito. A inferência por nome
   (`autoMapPlayerClips`) é uma **conveniência materializada** — botão "Auto-mapear
   pelos nomes" no editor (que GRAVA) ou a IA escreve o mapa no JSON (prompt +
   `engine-api.md` orientam isso). Sem mapa = sem animação (opcional).

"Pulo + pose no ar" sai de graça: `jump` (subindo) e `fall` (no ar) são ações
SEPARADAS — N fases viram N ações, sem mecanismo extra.

## Consequências

- A IA preenche `animation`/`animations` no JSON em vez de escrever `AnimationMixer`;
  o editor edita por ação com preview. Tudo discoverable no projeto (nada escondido).
- O mixer tica no editor (`Game._tick` chama `onUpdate` sempre) e o system pausa no
  editor, então a preview manual não briga com o gameplay.
- Lógica pura (`deriveLocomotion`/`resolvePlayerClip`/`autoMapPlayerClips`) testável;
  `evalSensors`-style sem WebGPU.
- **Limitação:** uma ação ainda é **1 clipe** (1:1). Variantes por contexto (duplo
  pulo = 2 clipes na mesma ação) e variações aleatórias pedem `clips[action]` como
  LISTA + seletor de variante — extensão futura (não bloqueia o caso comum).
- Vendorizado (`PlayerAnimatorComponent`/`PlatformerAnimationSystem`/`SceneAnimator`
  no `VENDOR_TYPE_MODULES`); re-vendorizar projetos. Relaciona-se com ADR-0044
  (cena data-driven), 0046 (overlay/write-back) e 0053 (kits trazem os clipes).
