# ADR-0274 — Piloto no veículo: assento, animação e pose procedural

**Data:** 2026-09-25
**Status:** aceito

## Contexto

O jogo de corrida novo (ADR-0256) precisa de um personagem sentado no kart,
animado conforme a direção. Hoje a engine tem veículo (simulação e frota
arcade) e personagem animado (`SceneAnimator`, `PlayerAnimatorComponent`), mas
nada que ligue os dois: o jogo teria que parentear o piloto na mão, escolher
clipe por `if` e girar bone no `main.ts`.

O pedido tem três peças — assento, animador de estados e pose procedural — e
uma convenção de nomes de asset. Quatro escolhas nelas têm alternativa real.

## Decisão

### 1. Mixer próprio, não o `SceneAnimator`

O `VehicleAnimatorComponent` cria o seu `AnimationMixer`. O `SceneAnimator`
toca **um** clipe por vez com `fadeOut/fadeIn` fixo de 0,2 s e é dirigido pelo
nó da cena e pelo Inspector (`userData.cortexAnim`). O piloto precisa de outra
coisa: vários clipes em transição ao mesmo tempo e o estado decidido por
parâmetros contínuos a cada frame. Estender o `SceneAnimator` misturaria os
dois contratos; um piloto que também fosse nó `model` animado teria dois donos
do mesmo mixer.

### 2. Crossfade por peso, não `crossFadeTo`

Cada `AnimationAction` tem um peso-alvo (1 no estado ativo, 0 nos outros) e o
sistema move o peso em direção ao alvo a `dt / crossFade` por frame. A action
que chega a 0 é parada.

`crossFadeTo`/`fadeIn`/`fadeOut` do three agendam interpolantes que **não se
compõem**: trocar A→B→A no meio de um fade reinicia o peso de A e produz um
salto visível — e é exatamente o que o input de direção faz (esterço cruza o
limiar várias vezes por segundo). Com peso-alvo, qualquer sequência de trocas é
contínua por construção, e o mesmo passo para todas mantém a soma dos pesos em
≤ 1 (o que falta, o mixer completa com a pose de repouso — sem estalo).

### 3. Pose aditiva no referencial do piloto, não nos eixos locais do bone

A inclinação é calculada como rotação no **referencial do modelo do piloto**
(convenção glTF: +Z frente, +Y cima, +X esquerda) e convertida para o espaço do
pai de cada bone antes de ser multiplicada no quaternion local.

A alternativa — girar `bone.rotation.x/z` — depende de como cada ferramenta
orientou os eixos locais do rig (Mixamo, Blender e Unity divergem). "Inclinar
para a direita" viraria "torcer a coluna" num rig e "curvar para frente" em
outro. A conversão custa três `getWorldQuaternion` por piloto por frame.

O sistema também **desfaz a própria aditiva** quando o mixer não reescreveu o
bone no frame (bone sem track): sem isso a rotação se acumularia frame a frame.

### 4. Um sistema com ordem fixa, não três

`VehicleDriverSystem` processa, por entidade: assento → mixer → pose. A pose
**precisa** vir depois do mixer do mesmo piloto; com três sistemas essa ordem
dependeria de três prioridades mantidas em sincronia à mão. Os componentes
continuam independentes (cada um é opcional na entidade).

### Convenção de nomes

Nomes em português para os anchors do kart (`assento`, `volante`,
`roda_frente_esquerda`…) e nomes de bone em inglês sem prefixo (`Head`,
`Spine`, `Chest`…). Busca **exata**: um alias por ferramenta (`mixamorig…`,
`Spine2`) esconderia o problema em vez de apontá-lo. O relatório de validação
lista o que existe no asset para o autor renomear.

## Consequências

- Kart e piloto novos saem do Blender com nomes previsíveis e a validação diz,
  no carregamento, o que falta — em vez de um piloto flutuando ou um clipe que
  nunca toca.
- Rigs do Mixamo **não** passam direto (não têm `Chest`, os bones têm prefixo).
  É esperado: renomear no pipeline de asset (ver `mixamo-character-pipeline`),
  não na engine.
- A pose procedural assume o piloto virado para +Z. Um modelo virado para −Z
  inclina ao contrário — corrige-se na exportação ou com a rotação do assento.
- **Sem IK em runtime.** Mãos no volante e pés nos pedais são resolvidos no
  Blender e **baked em cada clipe** do piloto (idle/accelerate: volante reto;
  steer/drift: mãos e tronco acompanhando o volante para o lado; brake: pé
  direito no freio; victory: pose livre do volante). A engine só carrega, toca
  e faz crossfade; a pose procedural é ajuste fino de coluna, peito e cabeça
  por cima — por isso os limites padrão são pequenos. `LeftHand`/`RightHand`/
  `LeftFoot`/`RightFoot` e `volante` entram na convenção para a validação e
  para o autor alinhar o rig ao kart no Blender.
- O componente não é dado de cena (não aparece no Inspector). Se o jogo quiser
  autorar o piloto na cena, entra como campo de nó numa segunda rodada.
