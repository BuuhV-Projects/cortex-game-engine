# CLAUDE.md — cortex-game-engine

Instruções específicas deste projeto. Decisões de arquitetura/tooling ficam em
`docs/adrs/` (ADR) e `docs/tdrs/` (TDR) — leia os relevantes antes de mudar uma área.

## REGRA ABSOLUTA: gerenciador de pacotes é o YARN

**Sempre `yarn`, nunca `npm`.** Vale para tudo: instalar (`yarn add`, `yarn add -D`),
remover (`yarn remove`), rodar script (`yarn <script>`) e instalar do zero
(`yarn install`). O lockfile do repo é o `yarn.lock` — rodar `npm install` cria um
`package-lock.json` concorrente e reescreve a árvore de `node_modules` com outra
resolução, o que quebra o build de formas difíceis de rastrear.

Se um `yarn add` falhar com `EBUSY ... electron\dist\resources\default_app.asar`, é
o **Studio aberto** segurando o arquivo: feche o Studio e repita o comando — não
troque pro npm pra contornar. Versões sempre **pinadas** (`-E`), nunca `latest`.

## REGRA ABSOLUTA: registro ANTES do código (spec/ADR primeiro)

**Nenhuma modificação na engine (ou num jogo que a consome) começa pelo código.**
Antes de escrever/alterar qualquer código, crie o registro correspondente e só
então implemente:

1. **Sempre** crie uma **SPEC** (`docs/specs/SPEC-NNNN-*.md`) descrevendo o
   comportamento/fluxo/formato do que vai ser construído ou alterado.
2. Se a mudança envolver uma **decisão com alternativas reais** (tecnologia,
   padrão, design de API), crie **também** um **ADR** (`docs/adrs/ADR-NNNN-*.md`)
   com a escolha e os trade-offs — a spec referencia o ADR.
3. A implementação vem **depois** do registro, na mesma mudança/commit-série.
   Se durante a implementação o desenho mudar, **atualize o registro** antes de
   seguir.

Exceção única: correções triviais sem mudança de comportamento (typo, formatação,
comentário). Fix de bug com mudança de comportamento observável **tem** registro.
Nos jogos (ex.: teste4), o registro fica no `docs/specs/` do próprio jogo.

## ADR vs Spec (`docs/adrs/` vs `docs/specs/`)

- **ADR** (`docs/adrs/`, prefixo `ADR-NNNN`) — registra uma **decisão** onde havia
  alternativas reais pesadas: o núcleo é a **escolha** e o racional/trade-offs
  (tecnologia, padrão estrutural, design de API, princípio de camada). Formato
  mental: "escolhemos X em vez de Y por causa de Z".
- **Spec** (`docs/specs/`, prefixo `SPEC-NNNN`) — **especifica** como uma
  feature/subsistema funciona ou foi construído (comportamento, formato de dado,
  fluxo de UI, detalhes de implementação), **sem** uma bifurcação arquitetural
  real. É documentação do que foi construído, não do porquê-esta-abordagem.

Ambos usam o mesmo template (Contexto/Decisão/Consequências) e o **mesmo espaço de
numeração** (o número é preservado ao reclassificar; o prefixo `ADR-`/`SPEC-`
desambigua). Ao criar um registro novo, escolha a pasta pelo critério acima; na
dúvida (contém uma escolha arquitetural real dentro de uma spec), fica como ADR.

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
> browser, manutenção AI-first (PRD-0004, ADR-0100).

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
  **não** gerado. É a fonte que a IDE empacota (extraResources) e injeta no Chat IA
  como **ÍNDICE no system prompt** (seções + linhas + símbolos, derivado em runtime
  por `electron/agent/engineApiIndex.ts`; o agente lê seções completas sob demanda
  via Read — ADR-0114). Mantenha-o atualizado ao mudar a API pública (adicione
  classes/exports novos e receitas relevantes) — o índice deriva dele sozinho.

> Bons comentários TSDoc nas classes/métodos públicos viram boa doc
> automaticamente — descreva propósito, parâmetros e um `@example` quando ajudar.

## IDE: registrar módulo novo em `VENDOR_TYPE_MODULES` (senão o editor não resolve)

Ao adicionar um **módulo público novo** (arquivo em `src/<subdir>/` exportado pelo
`src/index-runtime.ts`), **adicione-o também em `VENDOR_TYPE_MODULES`** (`electron/main.ts`).
Essa lista alimenta DUAS coisas: (1) os `.d.ts` copiados pro `vendor/` de projetos novos e
(2) os tipos que o **editor do Studio (Monaco)** carrega via `readEngineTypes`. Se faltar,
o runtime funciona (bundle), mas o **editor mostra o tipo como não-resolvido** (foi o caso do
`ScriptBehavior`). É lista fixa — mantenha em sincronia com os `export * from './<subdir>/<mod>.js'`.
