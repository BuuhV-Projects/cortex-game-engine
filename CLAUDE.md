# CLAUDE.md — cortex-game-engine

Instruções específicas deste projeto. Decisões de arquitetura/tooling ficam em
`docs/adrs/` (ADR) e `docs/tdrs/` (TDR) — leia os relevantes antes de mudar uma área.

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
- Mantenha em sincronia também (não são gerados):
  - `docs/cortex-game-engine/engine-api.md` — guia curado (catálogo + receitas);
  - o bloco "Catálogo do que o engine expõe" no system prompt do agente em
    `electron/agent/agentLoop.ts` — é o que faz o Chat IA já saber o que existe.

> Bons comentários TSDoc nas classes/métodos públicos viram boa doc
> automaticamente — descreva propósito, parâmetros e um `@example` quando ajudar.
