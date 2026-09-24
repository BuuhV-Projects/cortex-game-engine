# ADR-0269 — Chat IA: modo Orquestrador (padrão) delega entre Modelagem e Codificar

**Data:** 2026-09-24
**Status:** aceito
**Substitui em parte:** ADR-0265 (a alternativa descartada "roteamento automático")

## Contexto

O ADR-0265 deu ao Chat IA dois modos por tarefa — **Modelagem** (Astra, só
dado) e **Codificar** (Claude, código) — e deixou a escolha com o usuário. Dois
custos apareceram:

1. O usuário precisa saber em que lado da fronteira o pedido cai. "Faça um
   canhão que atira bolas" é modelo 3D **e** código: hoje exige dois turnos, em
   dois modos, na ordem certa.
2. Quem não pensa em "dado vs código" escolhe o modo errado, e o pedido é
   atendido pela metade (o guarda desfaz o código do Modelagem; o Codificar
   não tem o portão de modelo).

O ADR-0265 (e o ADR-0191 antes dele) descartou o roteamento automático porque
"classificar por texto erra em silêncio".

## Decisão

Um terceiro modo, **Orquestrador**, e ele é o **padrão** do chat.

O Orquestrador é a cabeça Claude (o mesmo modelo do Codificar: Sonnet, ou Opus
com o ajuste do projeto) com uma tool a mais, `delegate_modeling`, que roda um
**turno completo do Modelagem** — preâmbulo, guarda de código e portão de
`.glb` — e devolve o que o Astra respondeu. O Claude decide, pelo pedido, o que
delega (modelos 3D, cenário, efeitos em dado) e o que ele mesmo codifica.
Pedido misto: dado primeiro, código depois, no mesmo turno.

Não é roteamento por classificador: quem decide é o agente que entende o
pedido, e a decisão **aparece** — a delegação é um card no chat, o agente diz
antes qual especialidade cuida de cada parte, e os cards do trabalho do Astra
aparecem enquanto ele trabalha. O erro em silêncio, que era a objeção, vira um
card que o usuário vê e pode recusar (modo Ask).

Modelagem e Codificar continuam no seletor para quem quer forçar um lado.

### Alternativas descartadas

- **Classificador antes do turno** (uma chamada curta decide "modelagem" ou
  "codificar" e roteia o turno inteiro) — mais barato por turno, mas não
  resolve o pedido misto e é exatamente o "erra em silêncio" do ADR-0265.
- **Astra como orquestrador** — ele não tem as skills do plugin nem o índice
  da API, e a fronteira do Modelagem proíbe código.
- **Orquestrador sem cabeça própria, dois sub-agentes** — um terceiro modelo
  só para despachar, pagando contexto em dobro sem ganho: a cabeça que decide
  já é a melhor em código.

## Consequências

- Todo turno do Orquestrador roda o Claude, mesmo o pedido só de modelagem:
  custa uma fatia de cota a mais que o Modelagem puro.
- O Astra não vê a conversa: o pedido delegado precisa ser autocontido, e o
  prompt do Orquestrador exige isso.
- No Orquestrador a tool `generate_blender_model` sai: modelo 3D novo vai pelo
  Modelagem, que tem o portão com correção automática.
- A sessão do Astra é mantida por projeto enquanto o Studio está aberto, então
  delegações seguidas continuam o mesmo contexto.
