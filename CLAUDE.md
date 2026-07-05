# CLAUDE.md — cortex-game-engine

Instruções específicas deste projeto. Decisões de arquitetura/tooling ficam em
`docs/adrs/` (ADR) e `docs/tdrs/` (TDR) — leia os relevantes antes de mudar uma área.

## Logging: use `debug(escopo, …)`, não `console.log`

Sempre instrumente com o logger `debug()` de `src/core/debug.ts` (desligado por
padrão; liga via `VITE_CORTEX_DEBUG` no `.env` em `electron:dev`, ou
`localStorage['cortex:debug']`, ou `setDebug()`). Nunca deixe `console.log` cru no
código do engine — ele aparece sempre, inclusive em produção. Ver
architecture.md §9.

## Mapa de arquitetura (LEIA antes de mexer; ATUALIZE ao mudar)

> **Host nativo (`native/`, port console/Xbox):** tem mapa PRÓPRIO em
> `docs/cortex-native/architecture.md` — leia antes de mexer lá e atualize na
> mesma mudança. Regras do native/: SOLID/arquivos pequenos, API fiel ao
> browser, manutenção AI-first (PRD-0004, ADR-0094).

`docs/cortex-game-engine/architecture.md` descreve **como tudo se conecta** (ECS,
cena data-driven + overlay, editor F2 + autorias + ponte com a IDE, física/Rapier,
build/vendoring, fluxo de ponta a ponta e **armadilhas conhecidas**). É a fonte de
verdade viva do desenho.

- **Antes** de mudar um subsistema, leia a seção relevante desse doc.
- **Sempre que** mudar a arquitetura (novo subsistema/fluxo, novo componente/sistema
  central, nova armadilha, mudança de precedência/vendoring), **atualize o
  architecture.md** na mesma mudança — junto do ADR/TDR quando for decisão.

## Física = dado da cena, editável no Inspector (não código)

Colisão/corpo é **propriedade do objeto** e tem que ficar **visível e editável no
Inspector** (seção "Física": Nenhum / Estático / Character). Ao gerar cena (inclui
o Chat IA), declare física nos **campos do nó** do `level.json` (`collider`, `player`,
`character`) — o Inspector lê e o usuário pode editar/remover/trocar (o overlay
`data.physics`/`data.colliders` **vence** o código/JSON). **NUNCA** crave colisão só
no **código** (`entity.addComponent(new Collider2DComponent/CharacterBodyComponent)`
espalhado no `main.ts`): some do Inspector e o usuário perde o controle.

## Documentação da API do engine (gerada)

A referência da API pública do engine é **gerada** a partir dos comentários TSDoc
com TypeDoc — **não edite à mão** os arquivos em `docs/cortex-game-engine/api/`.

- Gerar/atualizar: `yarn docs:engine` (config em `typedoc.json`; entry
  `src/index-runtime.ts`; saída em `docs/cortex-game-engine/api/`).
- **Regra:** sempre que mudar a API pública do engine — adicionar/remover/renomear
  exports em `src/index-runtime.ts`, ou alterar assinatura/TSDoc de uma classe
  pública em `src/core/`, `src/ecs/`, `src/components/`, `src/systems/`,
  `src/physics/`, `src/editor/`, `src/scene/`, `src/io/` — rode `yarn docs:engine`
  e **commite a doc regenerada** junto da mudança.
- `docs/cortex-game-engine/engine-api.md` — guia **curado** (catálogo + receitas),
  **não** gerado. É a fonte que a IDE empacota (extraResources) e **injeta no
  system prompt do Chat IA** (lida em runtime via `resourceBase()` no `ai:chat`),
  pra a IA já saber o que o engine expõe. Mantenha-o atualizado ao mudar a API
  pública (adicione classes/exports novos e receitas relevantes).

> Bons comentários TSDoc nas classes/métodos públicos viram boa doc
> automaticamente — descreva propósito, parâmetros e um `@example` quando ajudar.

## IDE: registrar módulo novo em `VENDOR_TYPE_MODULES` (senão o editor não resolve)

Ao adicionar um **módulo público novo** (arquivo em `src/<subdir>/` exportado pelo
`src/index-runtime.ts`), **adicione-o também em `VENDOR_TYPE_MODULES`** (`electron/main.ts`).
Essa lista alimenta DUAS coisas: (1) os `.d.ts` copiados pro `vendor/` de projetos novos e
(2) os tipos que o **editor do Studio (Monaco)** carrega via `readEngineTypes`. Se faltar,
o runtime funciona (bundle), mas o **editor mostra o tipo como não-resolvido** (foi o caso do
`ScriptBehavior`). É lista fixa — mantenha em sincronia com os `export * from './<subdir>/<mod>.js'`.
