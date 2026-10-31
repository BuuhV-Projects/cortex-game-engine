# SPEC-0625 - Câmera de 3ª pessoa não atravessa objeto (raio da câmera, encolher na hora, desvio)

**Data:** 2026-10-31
**Status:** revertido (pedido do usuário, 31/10/2026) — o braço volta à SPEC-0302/0311

## Contexto

No Port Hollow, com o detetive colado numa parede de tijolo, girar a câmera para
trás dele punha a câmera **dentro** da parede. Pedido do usuário: a câmera deve
chegar perto do personagem (mas não demais) **ou desviar girando rápido** para o
outro lado, nunca pegar o objeto por dentro.

Causas no spring arm do `ThirdPersonControlSystem.placeCamera`:

1. o braço ficava em `max(acerto − 0,3, 0,8)`: com a parede a menos de 0,8 m do alvo,
   o **mínimo** de 0,8 m punha a câmera do outro lado da superfície;
2. o encolhimento era suavizado a 12 m/s (SPEC-0311): girando rápido, a câmera
   passava quadros dentro da parede antes de alcançar o alvo;
3. um raio só (centro): de raspão, o near plane da câmera cortava a parede;
4. com ombro (`shoulderOffset`), o alvo deslocado podia nascer dentro da parede ao
   lado — e aí nenhum raio acerta (sai de dentro da malha).

## Decisão

A lógica do braço sai para `src/systems/thirdPersonCameraArm.ts` (interno, não
exportado pelo `index-runtime`); o sistema só orquestra.

- **Raio da câmera** (`CAM_RADIUS` = 0,25 m): a distância livre é o menor acerto
  entre 5 raios paralelos — centro e 4 deslocados de `CAM_RADIUS` (direita, esquerda,
  cima, baixo da câmera) — mais o raio do peito (SPEC-0302), menos `CAM_RADIUS`. É
  uma esfera aproximada barata: os raios usam o mesmo índice `NearMeshIndex`
  (SPEC-0328) e só o que cruzam.
- **Nunca atravessa:** a distância final é `min(livre, distância desejada)`, sem
  mínimo que empurre para dentro. O antigo `CAM_MIN_DIST` (0,8 m) vira o mínimo
  **preferido** — abaixo dele entra o desvio.
- **Encolher é imediato:** se o alvo é menor que o braço atual, o braço vai direto ao
  alvo no mesmo quadro. A espera (`CAM_RELEASE_HOLD`) e a volta devagar
  (`CAM_RELEASE_SPEED`) da SPEC-0311 continuam: obstáculo que se repete (vigas)
  segura o braço curto, então só a 1ª entrada é um degrau, sem vai-e-volta.
- **Desvio (yaw), só no modo `free`:** se a distância livre < 0,8 m, sonda ângulos de
  yaw em passos de 15° até 165° (`CAM_SWING_STEP` × `CAM_SWING_STEPS`) e gira o yaw
  a `CAM_SWING_SPEED` (10 rad/s) para o mais perto que libera 0,8 m. Para **não
  brigar com o jogador**:
  - jogador girando a câmera (mouse/stick mexeu o yaw neste quadro) → só sonda o
    lado para onde ele gira; o desvio acelera o giro dele "por cima" da parede. Se
    esse lado não libera, não desvia (só encolhe) — nunca empurra contra a mão;
  - sem giro do jogador → os dois lados, o mais perto; um desvio em andamento fica
    no mesmo lado enquanto ele libera (não oscila);
  - nenhum lado libera (canto fechado) → fica no yaw e só encolhe até a distância
    livre (o personagem esconde abaixo de `CAM_HIDE_DIST`, como antes).
  - No modo `locked` (ângulo roteirizado pelo jogo) não há desvio: só encolhe.
- **Ombro:** um raio da cabeça do personagem para o lado do ombro encurta o
  `shoulderOffset` usado neste quadro até o acerto − `CAM_RADIUS`; assim a origem dos
  raios do braço é a mesma da câmera e nunca nasce dentro da parede.
- Opção `cameraAvoid` (default `true`) em `ThirdPersonControlOptions` desliga o
  desvio. Ligado por padrão porque só age quando a câmera já estava em estado de
  defeito (dentro/rente a um objeto) — em espaço aberto nada muda para os jogos.

Alternativas consideradas:

- *Esfera de verdade (shape cast do Rapier)*: o braço testa malhas visuais
  (`NearMeshIndex`), não colliders; muita malha não tem collider. Os 5 raios cobrem o
  near plane com custo previsível.
- *Mínimo menor fixo (ex. 0,3 m)*: ainda atravessa parede mais perto que isso e não
  dá o desvio pedido.
- *Desviar para o lado mais perto sempre*: briga com o jogador que gira para o lado
  oposto (a câmera voltaria contra a mão dele).

## Consequências

- Câmera nunca fica dentro de malha que esteja entre os alvos do braço; perto de
  parede, ou encolhe na hora ou gira para o lado livre.
- A 1ª entrada de um obstáculo é um degrau de distância (antes era um deslize de
  ~0,25 s pela parede). O teste da viga (SPEC-0311) passa a aceitar um degrau só.
- Custo: 6 raios por quadro (antes 2) e 1 de ombro quando `shoulderOffset ≠ 0`; as
  sondas de desvio (até 22 × 6 raios curtos) só rodam quando o braço está bloqueado.
- A sonda de desvio usa o alvo do quadro atual (o deslocamento do ombro muda com o
  yaw): aproximação; o quadro seguinte refaz o teste completo no yaw novo.

## Reversão (31/10/2026)

O usuário pediu para remover o ajuste: o comportamento (encolher imediato + desvio
de yaw quando nem 0,8 m cabe) "não funciona como eu gostaria" e será repensado
depois. Além disso, no Port Hollow (export nativo) o sistema custava ~5 ms/quadro
pelos 6 raios + sondas de desvio. O código da `7b32f59a` foi revertido: o braço
volta a ser o da SPEC-0302/0311 (raio central + raio do peito, mínimo de 0,8 m,
encolher suavizado, sem sondas de desvio), sai `systems/thirdPersonCameraArm.ts` e a
opção `cameraAvoid` de `ThirdPersonControlOptions`. Os problemas do §Contexto
(câmera dentro da parede com o jogador colado nela) voltam a existir até um novo
desenho.
