# 0114 - Índice do engine-api.md no system prompt do Chat IA (leitura sob demanda)

**Data:** 2026-07-15
**Status:** aceito

## Contexto

O Chat IA do Studio (ADR-0017: backend `@anthropic-ai/claude-agent-sdk`)
injetava o `engine-api.md` **inteiro** no system prompt de toda sessão
(~63 KB ≈ 18k tokens). Isso tinha três custos:

1. **Cache write caro no 1º turno de toda sessão** — o Claude Code cacheia o
   prefixo do prompt, mas o write inicial é pago cheio (e conta contra o limite
   da assinatura do usuário).
2. **Janela de contexto ocupada** — 18k tokens fixos mesmo em conversas que não
   tocam a API do engine.
3. **Escala ruim** — cada seção nova no doc curado encarece TODAS as sessões.

Avaliamos plugar um RAG (embeddings + vector store) e descartamos: chunks
variáveis por mensagem **quebrariam o prompt caching** (podendo custar mais),
retrieval por similaridade é menos preciso que busca exata para código, e o
pipeline (indexação, re-embedding a cada mudança da API) é um subsistema sem
dono — exatamente o que a auditoria lean (ADR-0089) removeu.

## Decisão

**Divulgação progressiva usando o retrieval que o agente já tem (tool Read):**

- Novo módulo puro `electron/agent/engineApiIndex.ts`:
  `parseEngineApiSections()` divide o markdown em seções (headings `##`/`###`
  fora de code fences, com faixa de linhas) e extrai os **símbolos**
  documentados (1ª célula de tabelas; identificadores puros em crase na prosa,
  com stoplist e cap de 30/seção). `buildEngineApiIndex()` monta o índice:
  preâmbulo do doc (regras de import) + instruções de leitura + uma linha por
  seção (`título — Lx-y — símbolos`).
- `agentLoop.ts` injeta o **índice** (~2,6k tokens, −86%) em vez do doc quando
  recebe `engineApiPath` (caminho absoluto do `engine-api.md` empacotado, via
  `resourceBase()` no main). O agente lê a seção completa sob demanda com
  `Read(path, offset, limit)` — Read é auto-aprovada (`APPROVED_AUTO_TOOLS`),
  sem prompt de permissão. Sem `engineApiPath`, cai no comportamento antigo
  (doc inteiro) como fallback.
- O prompt-base ganhou a exceção explícita de leitura fora do cwd (só onde as
  instruções indicarem) e a regra "leia a seção antes de codar a feature".

## Consequências

- **−86% de tokens fixos da referência** (~18,2k → ~2,6k) no prefixo de toda
  sessão; o índice continua estável → prompt caching preservado.
- O agente conhece o **vocabulário completo** (o que existe + onde ler); as
  assinaturas exatas vêm da leitura sob demanda e dos `.d.ts` do vendor.
- Custo novo: 1 tool call Read por seção consultada (barato, cacheável na
  sessão). Risco: o agente pular a leitura e alucinar assinatura — mitigado
  pela instrução dupla (prompt-base + cabeçalho do índice) e pelos `.d.ts`.
- O índice é derivado em runtime — **nenhum passo novo de build**; mudanças no
  `engine-api.md` continuam fluindo direto (regra do CLAUDE.md inalterada:
  mantenha o doc curado ao mudar a API).
- Faixas de linha são recalculadas a cada geração, então o índice nunca
  desalinha do doc empacotado junto.
- Testes: `tests/electron/engineApiIndex.test.ts` (parsing, símbolos, fences,
  índice e integração com o doc real, incluindo o teto de tamanho).
