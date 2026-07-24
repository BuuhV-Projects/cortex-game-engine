# SPEC-0151 - Anotação semântica durável no kit (mechanic/note/altUse/standalone)

**Data:** 2026-07-24
**Status:** aceito

## Contexto

O `kit.json` (ADR-0053) descreve cada asset em três eixos — `role` / `tags` /
`gameplayRole` — mas não dizia **o que uma peça faz** (mecânica) nem **como usá-la**.
Isso já vinha sendo suprido à mão: a cópia do kit `platformer-space` carregada pelo
engine tinha blocos `mechanic` (behavior/script/params) e um bloco kit-level
`scripts` (ADR-0085) editados diretamente no arquivo.

O problema: o `gen-kit.mjs` (gerador do kit a partir de `sizes.json` + `--overrides`)
**só emitia** `role`/`tags`/`size`/`gameplayRole`/`collider`/`anchors`/`thumb`. Ou
seja, qualquer **reprocesso do kit apagava** essas anotações — elas viviam só na
saída, não na fonte (`overrides.json`), e não sobreviviam a regenerar.

## Decisão

A anotação semântica passa a morar na **fonte** (`_stage/<kit>/overrides.json`) e o
`gen-kit.mjs` a **repassa** pro `kit.json`, tornando-a durável (reprocessável).

**Campos por asset** (no `overrides.json`, copiados pro `kit.json`):
- `mechanic` — `{ behavior, script, params?, animation?, note? }`: a mecânica
  default da peça (qual script anexar e com quais parâmetros).
- `note` — texto livre: o que a peça é / como usar / armadilhas.
- `altUse` — usos alternativos (ex.: `["conveyor", "sign"]`).
- `standalone` — `true` se a peça funciona sozinha (não depende de outra pra fazer
  sentido).

**Campo kit-level** `_kit` no `overrides.json` — objeto espalhado no manifesto (fora
de `assets`). Hoje carrega o bloco `scripts` (ADR-0085): `dir`/`provides`/`note`/
`animationRule`. Como `_doc`/`_kit` nunca casam com nome de `.glb`, não viram asset.

O schema zod do kit (`src/scene/Kit.ts`) é **não-estrito**: campos desconhecidos são
descartados no `parseKit()`, então adicionar `mechanic`/`note`/`altUse`/`standalone`/
`scripts` **não quebra** validação nem quem consome o kit — é metadado de autoria
(Chat IA, skills de montagem, humanos), não runtime.

## Consequências

- **A semântica sobrevive ao reprocesso.** `node gen-kit.mjs … --overrides …`
  regenera o `kit.json` já com as anotações; medido no `platformer-space`: a
  regeneração é **puramente aditiva** (zero drift de role/size/tags/anchors vs a
  versão à mão) e reproduz o bloco `scripts` idêntico.
- **Fonte única.** Editar o comportamento de uma peça é editar o `overrides.json`,
  não caçar o `kit.json` gerado (que pode ser sobrescrito).
- O schema formal do kit (`Kit.ts`) **não** validou os campos novos de propósito —
  se virarem contrato de runtime um dia, aí entram no zod. Por ora são opcionais e
  livres.
- Aplicado ao `platformer-space` (2026-07-24): 17 peças com `mechanic`, 10 com
  `note`; semântica dos `obstacle_1..19` + `fence_002..004` autorada pelo usuário
  (esteiras standalone, `obstacle_18/19` land cheia/vazada, martelo que arremessa,
  báscula por tempo, lasers intermitentes — algumas com script `a implementar`).
