# SPEC-0709 - "Gravar no GLB do jogo" leva a pegada da arma mesmo sem clipe a assar

**Data:** 2026-11-07
**Status:** aceito
**Continua:** SPEC-0704 (botão Gravar), SPEC-0703 (arma na mão), SPEC-0708 (personagens)

## Contexto

O jogo lê a pegada de cada arma do JSON do skin (`weaponGrips[ARMA]`), não da config do personagem. O botão
Gravar só escrevia `weaponGrips` para as armas das chaves `clipe@ARMA` que ele assava. Quem ajustava só a
pegada (mover/girar a arma, Salvar pose), sem posar osso num clipe com arma, recebia "Nada a gravar: o GLB
já está igual ao desejado" e a pegada nova não chegava ao jogo.

## Comportamento

- Depois de salvar a config, o Gravar compara cada pegada salva (`skinned.weaponGrips` da config) com a do
  JSON do skin de cada par que ele grava: o do player (na visão do player) e o dos NPCs (quando a config
  tem personagens). Pegada ausente ou diferente (a 6 casas) no JSON do skin = pegada a gravar.
- Sem clipe a assar e sem pegada a gravar: "Nada a gravar", como antes.
- Só pegada a gravar num par: o JSON do skin ganha `weaponGrips` novo e o GLB é regravado igual (o par vai
  junto para o `.bak`, ADR-0705). Confirmação e estado têm texto próprio ("Gravar N pegada(s) de arma em…"); com
  clipes e pegadas, o texto dos clipes ganha "Mais N pegada(s)". A comparação lê a pegada como a config (não
  depende da ordem das chaves do JSON).
- Com clipes a assar, as pegadas das armas deles continuam indo junto, como antes.

## Fora

- Pegada zerada para o padrão sai da config, mas a entrada antiga do JSON do skin fica (o jogo continua com
  ela). Remover a entrada do JSON fica para quando zerar pegada for pedido.
