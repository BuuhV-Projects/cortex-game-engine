# 0235 - O teto de 17% da submissão é estrutural

**Data:** 2026-09-20
**Status:** aceito

## Contexto

Esta hipótese já foi proposta três vezes, em formas diferentes, e cada vez
parece nova:

1. "mover a submissão de draw para C++" (SPEC-0225) — medida, teto de 17%,
   descartada;
2. "o `three` monta uma RenderList e o C++ faz bind+draw" — proposta de novo na
   fase 4 do ADR-0232, e é a mesma coisa com outro nome;
3. qualquer variante em que o `three` continue **visitando os objetos em JS**.

Este ADR existe para que a quarta vez não aconteça.

## A conta que fecha a questão

Duas medições independentes dão o mesmo número, e é isso que o torna confiável:

- **SPEC-0225**, com cronômetro dentro das funções NAPI: dos 88 us por draw,
  **15 us são a ponte** (setPipeline/setBindGroup/draw/writeBuffer) e **73 us
  são o `three` em JS, antes de chegar na ponte**.
- **SPEC-0227**, decompondo o `renderObject` por dentro: `backend.draw` é
  **18%** do custo; o resto é `_nodes.*` (33%), `_objects.get` (15%),
  `_bindings` (12%), `_pipelines` (11%) e geometria (4%).

`backend.draw` **é** a parte que a ponte cobre. Ou seja: os dois caminhos de
medição chegam a ~17-18%, e esse é o teto de qualquer desenho que mova só a
submissão.

## Decisão

**Não reabrir a hipótese de mover a submissão para C++ mantendo a resolução de
cena em JS.** Vale para qualquer formulação, inclusive as que não usam a palavra
"submissão" — o critério é outro:

> Se o `three` ainda percorre os objetos em JS para produzir o que o C++ vai
> consumir, o teto é ~17%. Não importa o formato do que atravessa a ponte.

E há um agravante que derruba até o ganho parcial: montar essa lista em JS custa
**≥0,3 ms para 250 objetos** (1,1 us por objeto, medido hoje no Hermes). O que
se ganha na submissão volta na montagem.

Superar o teto exige tirar **`_nodes`, `_bindings` e `_pipelines` inteiros** do
JS — reescrever a parte do renderer do `three` que resolve material e binding
por objeto. É a reescrita de meses que o ADR-0232 já dimensionou, e ela não se
faz em fatias pequenas.

## Pergunta que fica em aberto (não medida)

`_bindings` (12%) e `_pipelines` (11%) mudam **muito menos** por frame que a
matriz — um material que não trocou não precisa reconstruir binding. Se forem
cacheáveis entre frames, existe um recorte menor que os 23% combinados, dentro
do JS mesmo.

**Isso não foi medido.** Fica registrado como pergunta, não como plano: medir
primeiro (com a sonda da SPEC-0227, que já sabe abrir o `renderObject`), e só
então decidir.

## Consequências

- A fase 4 do ADR-0232 fica **parada e registrada**, não abandonada: o caminho
  existe, o custo está dimensionado, e o gatilho para retomá-la é uma decisão de
  produto (reescrever o renderer), não uma ideia nova de engenharia.
- O próximo alvo de performance passa a ser o **`world`** (9,3 ms, 29% do
  frame), que nunca foi investigado — terreno virgem tem mais chance de ganho
  barato do que um caminho já mapeado até o osso e com teto conhecido.
