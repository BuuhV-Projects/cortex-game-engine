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
- Ficou de fora: o passo **horizontal** de um quadro de 100 ms correndo (>0,4 m) também poderia
  passar o centro da face de uma parede. Não foi visto no Port Hollow; fica registrado como risco.
