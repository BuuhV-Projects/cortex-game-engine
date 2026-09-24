# SPEC-0271 — Validação dos modelos 3D visível no chat

**Data:** 2026-09-24
**Status:** aceito
**Complementa:** SPEC-0267 (portão do modelo 3D)

## Contexto

O portão da SPEC-0267 roda **depois** da resposta final do Astra: cada `.glb`
novo ou alterado passa por refino e inspeção no Blender, um por vez, com até
120 s por etapa. Num cenário com 18 modelos (caso real: cenário tropical do
crash-bandicoot-racer) isso são minutos em que o chat não mostra nada — o
botão "Parar" segue ativo e o usuário não sabe o que está acontecendo. O chat
só falava no fim ("✔ Validação") ou numa reprovação.

## Decisão

Cada modelo validado vira um **card de tool** no chat, igual aos comandos do
Astra:

- ao começar: nome `Validação`, resumo `Validando modelo i/N: <caminho>`, em
  estado "rodando";
- ao terminar: resultado `aprovado`, ou os motivos da reprovação (card em erro).

O turno do Modelagem (`runModelingTurn`) recebe a dependência `card(summary)`,
que abre o card e devolve a função que o fecha. O runner a liga em
`onToolRequest` / `onToolExecuted`. No Orquestrador os cards passam direto pelo
`delegate_modeling`, que já repassa os cards do Astra (SPEC-0270).

As mensagens de texto de antes (✔ / ↻ / ⚠) continuam.

## Consequências

- Teste em `modelagemTurn.test.ts`: um card por modelo, na ordem, fechado com
  o veredito.
- A validação continua sequencial; paralelizar (Blender em paralelo) fica para
  quando o tempo total incomodar mesmo com o progresso visível.
