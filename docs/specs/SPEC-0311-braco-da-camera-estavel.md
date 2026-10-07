# SPEC-0311 - Braço da câmera de 3ª pessoa estável (encolhe rápido, volta devagar)

**Data:** 2026-10-07
**Status:** aceito

## Contexto

No Detetive Brasília, andando de metrô, "a partir da Ceilândia Centro a câmera fica
pulando sem parar". A sonda por quadro (distância câmera↔jogador + qual malha o raio
do braço acerta) mostrou, com o trem andando devagar perto das estações:

- a distância alterna entre ~5,4 m (teto/cobertura da vala, `Mesh<ceilandia`) e
  ~2,4 m (vigas da estação, `estacao`), de 2 a 5 vezes a cada 3 s — saltos de ~3 m
  de um quadro pro outro;
- em Águas Claras, um obstáculo fino cruza o raio do peito por 1 quadro (24,5 → 22,3
  → 24,5);
- parado na plataforma ou no túnel (teto contínuo), a distância é estável.

Todos os acertos eram de malhas **visíveis**, e o A/B com o engine de antes da
SPEC-0307 (que varria a cena inteira, sem poda nem lista refeita a cada 250 ms) deu
**o mesmo padrão**. Não é regressão do filtro de colisão: o spring arm
(`ThirdPersonControlSystem.placeCamera`) usava a distância do raio **daquele quadro**,
sem memória. Com a câmera ao longo do eixo do movimento, cada viga que entra e sai
do raio vira um salto instantâneo de distância — o mesmo vale pra qualquer obstáculo
fino que passa (poste, árvore, grade) andando ou girando a câmera.

## Decisão

O braço passa a ter estado (`armDist`) e o raio dá só o **alvo** da distância:

- **encolher** (algo entrou entre o alvo e a câmera): vai na direção do alvo a
  `CAM_PULL_IN_SPEED` m/s (rápido — 12 m/s: 0,2 m por quadro a 60 fps e 0,4 m a 30 fps; fecha 3 m em
  ~0,25 s, sem salto de um quadro);
- **segurar**: depois de encolher, fica parado `CAM_RELEASE_HOLD` s antes de voltar.
  Cada novo encolhimento renova a espera — obstáculo que se repete (vigas, postes,
  árvores) mantém o braço curto em vez de bater e voltar;
- **voltar** (o caminho liberou): só depois da espera, a `CAM_RELEASE_SPEED` m/s
  (devagar), até a distância livre.
- **Corte de câmera**: `setOrbit(...)` (o jogo troca modo/ângulo/distância, ex.
  embarcar no trem) e o 1º quadro **encaixam** direto, sem transição; com o jogo
  pausado (editor) também encaixa.

Alternativas consideradas:

- *Tempo mínimo de oclusão* (Cinemachine `MinimumOcclusionTime`): ignora obstáculo
  que dura pouco — resolve o poste, mas deixa a câmera dentro/atrás da parede nesse
  intervalo e não resolve viga que se repete.
- *Esfera/vários raios* (sweep mais grosso): reduz buraco entre vigas, mas não tira
  a borda — a viga que sai do raio continua sendo um degrau; e custa N raios.
- Corrigir no jogo (marcar as vigas `cortexNoCollide`): esconde o sintoma numa
  estação; qualquer outro obstáculo fino continua pulando. O defeito é do braço.

## Consequências

- Sem salto > 0,5 m entre quadros (a ≥ 30 fps) causado por obstáculo intermitente.
- Ao rodar a câmera de perto de uma parede pra área livre, ela demora
  `CAM_RELEASE_HOLD` + (distância / `CAM_RELEASE_SPEED`) pra voltar — comportamento
  padrão de câmera de 3ª pessoa (damping de retorno).
- Durante o encolhimento (~0,1–0,25 s), a câmera pode ficar por alguns quadros atrás
  do obstáculo que acabou de entrar (troca de "pulo" por "deslize").
- Custo: três comparações por quadro; nenhum raio a mais.
- Mudança de distância pelo jogo deve passar por `setOrbit` (encaixa); mexer na
  distância de outro jeito volta devagar.
