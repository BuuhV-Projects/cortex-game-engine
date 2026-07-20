# 0118 - Raycast de física/câmera ignora SkinnedMesh + clamp de deltaTime no GameLoop

**Data:** 2026-07-17
**Status:** aceito

## Contexto

O export nativo do teste4 (fase 1 do mundo 1) ficou injogável: ~4,7 fps com o
personagem "respawnando sem parar" — a tela alternava entre o player no spawn e
o player sumido. No Studio (browser/V8) a mesma fase rodava a 60+ fps sem bug.

Diagnóstico (medido com instrumentação por-sistema no host Hermes):

1. **`CharacterPhysicsSystem` custava ~156 ms/frame e `ThirdPersonControlSystem`
   ~34 ms/frame** — juntos ~190 ms dos ~215 ms do frame (o render eram só
   ~19 ms). A causa: raycast contra **malha skinada**. O `three` computa o
   skinning **por vértice na CPU a cada raio** (`boneTransform`), e o BVH
   (SPEC-0108) pula skinned de propósito (a árvore seria da bind pose). A troca
   do player pro `cute_player` (rig denso, 16/jul) colocou a casca cute **e o
   mannequin oculto** (raycast do three NÃO pula objeto invisível) no caminho:
   - do raycast de chão do `CharacterPhysicsSystem` (13 raios/frame, e o
     `groundMeshes` incluía todo mesh da cena — o filtro `isUnder(self)` rodava
     só DEPOIS da interseção computada);
   - do spring arm do `ThirdPersonControlSystem` (raio que nasce na cabeça do
     personagem e atravessa a própria malha; o `isCamIgnored` também filtrava
     só nos hits).
   No V8 esse custo fica mascarado (5-10× mais rápido); no Hermes derrubou a
   fase a 4,7 fps.

2. **O respawn infinito era tunneling da física por deltaTime gigante.** O
   `GameLoop` repassava o dt cru; a 4,7 fps (dt ~215 ms) a gravidade integra
   `y += v*dt` num passo que desce mais que o `stepHeight` — o raycast de pouso
   (que parte de `pés + stepHeight`) nasce ABAIXO do topo da plataforma, não a
   vê, e o personagem atravessa o chão → `y < -3` → `rush:die` → respawn → cai
   de novo no tick seguinte. Limiar com os defaults (`gravity` 30, `stepHeight`
   0.4): qualquer fps < ~9 tunela **parado no spawn**.

## Decisão

1. **Malha skinada nunca entra em raycast de física/câmera.**
   - `raycastAccel.ts` ganha o helper `isSkinned()` (com a explicação do custo).
   - `CharacterPhysicsSystem.collectScene` pula `SkinnedMesh` ao montar
     `groundMeshes`/`solidMeshes`/`terrainMeshes` — personagem/NPC nunca é chão
     ou parede.
   - `ThirdPersonControlSystem.placeCamera` coleta os alvos do spring arm ANTES
     do raio (pulando skinned, `editorInternal` e o próprio personagem) em vez
     de raycastar `collisionRoot` inteiro e filtrar nos hits.
   - O **picking do editor continua** raycastando skinned normalmente (custo
     pontual de um clique, não por frame).

2. **`GameLoop` limita o deltaTime a 100 ms** (`MAX_DELTA_MS`). Frame mais lento
   que isso desacelera o jogo (time dilation) em vez de entregar um passo que
   teleporta/tunela a física — mesmo comportamento do `maximumDeltaTime` da
   Unity. O clamp também limita o acumulador do passo fixo (sem "spiral of
   death" após um hitch).

3. **Medidor de FPS do host virou opt-in permanente** (`game-diagnostics.js`):
   `globalThis.__cortexPerf = true` ou `cortexPerf=1` na `CORTEX_LAUNCH_QUERY`
   imprime `[perf] fps=… worst=…ms` a cada ~2 s no console do host.

Resultado medido na fase 1 (host windowed 1280×720, SSAA 2×): **4,7 fps →
~40 fps** e o respawn infinito sumiu (worst frame ~30 ms, longe do limiar de
tunneling — que agora nem existe mais, pelo clamp).

## Consequências

- Personagens/NPCs não bloqueiam a câmera de terceira pessoa (o spring arm
  ignora skinned). Na prática já era o comportamento desejado — o próprio
  player era ignorado por filtro pós-hit; agora nenhum rig é obstáculo.
- Malha skinada não pode ser usada como plataforma/chão andável. Se um dia um
  jogo precisar disso (ex.: andar em cima de uma criatura gigante), vai exigir
  um proxy estático (mesh invisível não-skinned acompanhando o rig).
- Abaixo de ~10 fps o jogo desacelera em vez de manter o relógio de parede
  (cronômetros in-game contam tempo de jogo, não tempo real). Trade-off
  deliberado: física estável vale mais que relógio fiel em máquina saturada.
- O gotcha fica registrado no architecture.md (armadilhas): **nunca** montar
  lista de raycast por-frame que inclua `SkinnedMesh`; filtrar ANTES do
  `intersectObjects`, não nos hits.
