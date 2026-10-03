# SPEC-0297 - Câmera de ombro e modo mira na 3ª pessoa

**Data:** 2026-10-03
**Status:** aceito

## Contexto

O `ThirdPersonControlSystem` (SPEC-0074) mira a câmera exatamente na cabeça do
personagem (`lookTarget = pés + cameraHeight`). Para um jogo de **tiro em 3ª
pessoa** isso não serve: o centro da tela, onde fica a mira, cai em cima do próprio
personagem. Além disso, o personagem sempre vira para a direção do **movimento**.
Ao andar para o lado mirando, ele fica de perfil e o tiro sai "das costas".

Os jogos do gênero (Gears, Fortnite, RE4 remake) resolvem as duas coisas com o
mesmo par de recursos: câmera deslocada para o ombro e, enquanto se mira, o
personagem encarando a câmera (strafe).

## Decisão

Duas opções novas em `ThirdPersonControlOptions`, também expostas como
**propriedades públicas mutáveis** do sistema, para o jogo alternar em tempo real
(por exemplo, ao segurar o botão de mirar):

- `shoulderOffset` (m, default `0`): desloca **alvo e câmera** juntos ao longo do
  vetor "direita" da câmera, no plano XZ. Valor positivo põe a câmera sobre o
  ombro direito, e o personagem aparece à esquerda da mira. O spring arm
  (colisão) usa o alvo já deslocado.
- `faceCamera` (default `false`): quando `true`, o personagem vira suavemente
  para a direção da câmera (yaw da câmera + `facingOffset`) **todo frame**,
  mesmo parado ou andando de lado, com o mesmo `rotationSmoothTime`. Quando
  `false`, o comportamento é o de antes (vira para onde anda).

A distância da câmera continua sendo trocada com `setOrbit('free', { distance })`.
Com isso o "zoom de mira" é só mais uma chamada.

Não é ADR: não há bifurcação arquitetural, só dois parâmetros no sistema
existente.

## Consequências

- Default `0`/`false` não muda nenhum jogo existente (teste de regressão cobre).
- Com `shoulderOffset` grande e parede logo ao lado, o alvo deslocado pode
  ficar dentro da parede e o spring arm não protege esse trecho. Valores de
  0,5 a 0,8 m não têm esse problema na prática.
- A animação de locomoção continua a mesma: andar de lado em `faceCamera` toca o
  clipe de walk/run de frente (sem blend de strafe, que o rig não tem).
