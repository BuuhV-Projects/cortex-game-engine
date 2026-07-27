# SPEC-0162 - Kit platformer-obstacles: pivô CENTRAL nas peças modulares

**Data:** 2026-07-27
**Status:** aceito

## Contexto

As `platform_001..027` vinham do pack com o pivô na ARESTA de encaixe (bbox
`z[−prof, 0]`). Pivô excêntrico brigou com todo o ferramental que assume
centro: caixas de seleção, gizmos de collider (SPEC-0161 corrigiu o offset,
mas a UX segue confusa), Inspector (duas peças "na mesma posição" nas juntas)
e o instinto de quem edita — decisão do usuário: **anotar/normalizar o pivô no
próprio kit**.

## Decisão

Pivô **CENTRAL em X e Z** (Y preservado), aplicado na GEOMETRIA dos `.glb`
(translação dos POSITION + min/max dos accessors — sem nó extra, sem mudança
de hierarquia). Fonte durável: `_stage/obstacles/recenter-pivots.mjs` — rodar
após qualquer reprocesso do pack. `kit.json`: âncoras `top.at[2] = 0` e nota
"Pivô CENTRAL" por peça. `platform_028..030` (empilhados) já eram centrados.

Consumo (jogos): posicionar a peça pelo CENTRO — o cursor de trecho do teste4
passou de "origem na aresta" pra "centro do intervalo" (spec 0019, ajuste 6).

## Consequências

- Caixas/gizmos/Inspector se comportam como qualquer objeto da engine; nas
  juntas cada peça mostra o próprio pivô no MEIO do próprio corpo.
- Âncoras de ENCAIXE explícitas (futuro: curvas L/seta) continuam sendo o
  caminho pra juntas complexas — o pivô central não as substitui.
- Builders que assumiam origem na aresta precisam da matemática de centro
  (teste4 atualizado em conjunto; o lint geométrico de sobreposição pega
  qualquer descuido).
