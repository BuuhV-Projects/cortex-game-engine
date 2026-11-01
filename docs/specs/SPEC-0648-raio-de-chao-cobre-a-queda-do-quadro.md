# SPEC-0648 - Raio de chão cobre a queda do quadro inteiro (personagem não atravessa o chão em quadro longo)

**Data:** 2026-10-31
**Status:** aceito

## Contexto

No export nativo do Port Hollow o detetive afundava no chão perto dos prédios. Primeiro ficava até o
peito na calçada, depois "caía para dentro do bloco". No navegador não acontecia.

Para achar a causa, uma sonda temporária gravou em arquivo, ao lado do exe, cada quadro em que o chão
sob o personagem mudava. O raycast nativo (SPEC-0347) está certo: o caminho JS dá o mesmo resultado.
O que falha é a ordem dos passos do `CharacterPhysicsSystem`:

1. A gravidade move o personagem (`t.y += velocityY * dt`).
2. Só então o raio de chão sai de `pés + stepHeight + SKIN` (~0,45 m acima dos pés **já movidos**).

Se a queda de um quadro passa de ~0,45 m, a origem do raio fica **abaixo** da superfície que ele
acabou de atravessar. O raio acha a próxima superfície, que no Port Hollow é o terreno 1,5 m abaixo do
patamar das quadras.

Caso medido: pulo parado na calçada (chão em 7,26 m), descida a 8,8 m/s num quadro de 86 ms, queda de
0,76 m. A origem do raio ficou em 7,17 m e o personagem caiu para o terreno. A partir daí ele anda
**por baixo** das caixas `plat-`/`wall-` (os raios de parede ficam abaixo delas), e é isso que aparece
como "dentro do prédio".

No navegador, a ~16 ms por quadro, a mesma queda é de 0,14 m. O nativo tem quadros de 50–100 ms
durante o jogo (o `GameLoop` corta em 100 ms).

## Decisão

O raio de chão sai da altura dos pés **antes** da queda deste quadro:
`pés + queda_do_quadro + stepHeight + SKIN`, com `queda_do_quadro = max(0, -velocityY · dt)`.

- Toda superfície cruzada pela queda fica abaixo da origem: o 1º acerto é ela, e o personagem pousa.
- Parado ou subindo, `queda_do_quadro` é 0 e o comportamento não muda.
- Nenhum raio a mais: só a origem sobe.

## Consequências

- O pouso independe do tamanho do quadro: a mesma queda pousa igual a 16 ms e a 100 ms.
- O degrau de subida continua `stepHeight`.

## Segundo caso: o passo horizontal entra no sólido

Uma segunda rodada da sonda, já com a correção acima, achou o outro caminho. O detetive andava na
calçada (6,40 m) junto à face do patamar elevado `plat-…`, uma caixa invisível que vai de 4,3 a 7,9 m,
com a face em z = 9,0. O empurrão de parede o segurava em z = 8,65. Num quadro de 100 ms o passo foi
de 0,6 m, maior que o raio, e o centro foi para z = 9,13, **dentro** da caixa.

De dentro da caixa, os raios de parede só encontram a face de trás (`FrontSide` descarta), então não
há empurrão. O raio de chão sai abaixo do topo (7,9 m) e cai no terreno (4,39 m).

**Decisão:** o `CharacterPhysicsSystem` guarda por entidade a posição XZ resolvida no fim do quadro
anterior. Logo depois da gravidade e **antes** do raio de chão, se o passo do quadro num eixo passa de
`SWEEP_MIN_STEP` (0,5) × `radius`, ele varre o passo:

- Eixo por eixo (X, depois Z a partir do X já resolvido), raios nas 3 alturas da cápsula partindo da
  posição anterior, com alcance `|passo| + radius + SKIN`, contra os sólidos perto do segmento.
- Com acerto, o passo para a `radius + SKIN` da face. O outro eixo segue andando, então o
  personagem desliza na parede.
- Passo maior que `SWEEP_MAX_STEP` (8 m) é teletransporte do jogo e não é varrido. O 1º quadro da
  entidade também não.
- Quem já está dentro de um sólido não é travado, porque de dentro os raios não acertam a face, e
  pode sair.

**Custo:** em quadro normal (passo menor que metade do raio), zero raios a mais. Em quadro longo, até
6 raios contra os sólidos perto, que no host rodam em C++ (SPEC-0347).

**Por que o DDD 61 não sofria:** ele roda a ~50–60 fps no nativo, e o chão dele é a própria malha,
com meio-fio baixo. O Port Hollow tem quadros de até 100 ms e um chão feito de caixas invisíveis, com
patamares 1,5 m acima da calçada e o terreno logo abaixo.
