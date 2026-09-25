# ADR-0276 - Codificar roda no Opus 5.5 com esforço médio

**Data:** 2026-09-25
**Status:** aceito (substitui a escolha de modelo do Codificar no ADR-0130 e no ADR-0265)

## Contexto
O ADR-0130 pôs o Chat IA em **Sonnet por padrão** porque a cota do Opus no plano de
assinatura é bem menor; o ADR-0265 manteve isso no modo Codificar, com Opus só por um
ajuste por projeto. Numa sessão real (crash-bandicoot-racer, 2026-09-25) o Codificar em
Sonnet 4.6 passou ~1h40 sem resolver um kart que atravessava a pista: oscilou entre
hipóteses, ajustou números no chute, gravou memórias erradas e perdeu por compactação a
causa raiz que já tinha achado. O mesmo bug foi resolvido em minutos lendo o código e
fazendo a conta. Tarefa de código com diagnóstico é justamente onde o modelo mais forte
compensa a cota.

Alternativas:
1. **Manter Sonnet e só melhorar ferramentas/prompt** (SPEC-0277) — necessário, mas não
   cobre o raciocínio fraco em depuração de várias etapas.
2. **Opus no alias `opus` com esforço padrão** — o alias resolve para a versão que o
   Claude Code escolher, e o esforço padrão (alto) gasta mais cota que o necessário.
3. **Id fixo `claude-opus-5-5` com esforço `medium`** — versão previsível; o médio
   equilibra qualidade e consumo.

## Decisão
Opção 3, pedida explicitamente pelo usuário.
- `modelForTask('coding')` devolve sempre `opus` (o ajuste do projeto deixa de valer para
  o Codificar).
- O Orquestrador continua em Sonnet, com Opus pelo ajuste "modelo mais forte" (rótulo
  agora cita só o Orquestrador).
- No `agentLoop`, `sdkModelOptions('opus')` vira `{ model: 'claude-opus-5-5', effort:
  'medium' }`; os demais aliases seguem sem `effort` (padrão do SDK).

## Consequências
- O Codificar consome a cota do Opus: o limite semanal chega mais rápido. Para tarefas
  triviais, o Orquestrador (Sonnet) continua disponível.
- Trocar de versão do Opus exige mudar o id em `agentTypes.ts` (um lugar só).
- `effort` exige SDK ≥ 0.3.17x (travado em 0.3.177 no `yarn.lock`).
