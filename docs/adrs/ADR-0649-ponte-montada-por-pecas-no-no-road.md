# ADR-0649 - Ponte montada por peças no próprio nó `road`

**Data:** 2026-10-31
**Status:** aceito
**Numeração:** era ADR-0648 (colidia com a SPEC-0648 do raio de chão); renumerado em 31/10/2026

## Contexto

A SPEC-0631 §3c deu à estrada trechos de ponte (`bridge`): greide reto entre as cabeceiras e terreno sem aterro
embaixo. Sozinho, isso é só uma faixa de asfalto suspensa. O Port Hollow recebeu um pacote de ponte modular (peças de
pista, pilar, guarda-corpo), e a pergunta é **quem coloca as peças** ao longo do vão.

Alternativas:

1. **O jogo gera nós `model`** (uma peça por nó) no `level.json`, calculando a altura do vão por conta própria.
2. **A engine monta as peças** a partir de um campo no nó `road`, usando o greide que ela mesma calcula.

## Decisão

Opção 2: o nó `road` ganha `bridgeParts` (`deck`, `pillar`, `rail`, `scale`, `pillarEvery`), e a engine distribui as
peças ao longo de cada vão no mesmo passo em que gera a pista (SPEC-0631 §3d).

- O greide do vão só existe depois da média móvel e do `maxSlope` da engine. Na opção 1 o jogo teria que repetir esse
  cálculo, e a peça descolaria da pista perto das cabeceiras.
- Editar o traçado no F2 refaz a estrada; com as peças no nó, a ponte vai junto. Na opção 1, cada nó de peça ficaria
  para trás e precisaria ser regerado.
- Um campo de dado no nó continua editável pelo overlay `data.road[id]`, como o resto da estrada.

## Consequências

- As peças são filhas da malha da estrada e herdam o `cortexRoad`: viram colisão do carro (o guarda-corpo segura o
  carro, o pilar é obstáculo). Custo: o trimesh estático cresce com os triângulos das peças (guarda-corpo detalhado
  pesa mais que a pista inteira).
- Contrato de origem das peças (SPEC-0631 §3d): comprimento em Z, Y para cima; pista com o topo em y = 0; pilar com o
  topo em y = 0 (cresce para baixo); guarda-corpo com a base em y = 0. Pacote fora disso precisa ser convertido antes.
- A engine não traz peças: o modelo é asset do jogo.
- Uma peça por objeto (clones do `.glb`); o merge estático do jogo junta as que não mudam. Ponte muito longa editada no
  F2 desenha mais até o próximo build.
