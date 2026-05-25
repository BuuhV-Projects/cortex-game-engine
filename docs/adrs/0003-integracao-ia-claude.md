# 0003 - Integração de IA para geração de scripts via Claude API

**Data:** 2026-05-24
**Status:** aceito

## Contexto

O PRD exige suporte a IA para criar scripts de jogo em JavaScript. O script gerado deve ser compatível com o sistema ECS do motor (ADR-0002). As opções avaliadas foram:

- **OpenAI GPT-4o**: API madura, mas requer chave proprietária e não há vantagem comparativa neste contexto.
- **Modelo local (Ollama/LM Studio)**: sem custo de API, mas qualidade inferior para geração de código complexo e requer hardware local capaz.
- **Claude API (Anthropic)**: qualidade de código state-of-the-art, suporte a contexto longo (útil para injetar toda a documentação do ECS no prompt), SDK oficial para Node.js.

## Decisão

Usar a **Claude API** via `@anthropic-ai/sdk` no módulo `src/ai/ScriptGenerator.js`.

Estratégia de prompt:
1. O **system prompt** descreve a arquitetura ECS (classes `Entity`, `Component`, `System`, `World`) e as convenções do motor — isso é injetado uma vez com **prompt caching** (`cache_control: { type: "ephemeral" }`) para reduzir latência e custo em chamadas repetidas.
2. O **user message** recebe a descrição em linguagem natural do comportamento desejado (ex: "Sistema que faz o player pular ao pressionar espaço").
3. A resposta é extraída entre marcadores ` ```js ... ``` ` e validada com `new Function()` antes de ser retornada.

A chave da API é lida de `process.env.ANTHROPIC_API_KEY`. O módulo não é chamado em testes automatizados sem mock explícito.

## Consequências

- **Positivo**: scripts gerados são compatíveis com o ECS por design — o prompt cita as classes exatas.
- **Positivo**: prompt caching reduz custo em sessões interativas com múltiplas gerações.
- **Negativo**: dependência de rede e de chave de API externa; sem chave, o módulo falha graciosamente com erro descritivo.
- **Negativo**: a validação com `new Function()` detecta erros de sintaxe, mas não erros semânticos — a responsabilidade de testar o script gerado é do usuário.
