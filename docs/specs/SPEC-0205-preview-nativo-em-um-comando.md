# 0205 - Preview nativo em um comando e troca de fase (M4a do PRD-0007)

**Data:** 2026-09-19
**Status:** aceito — **primeira fatia** do M4

> **Implementação REMOVIDA da main** (ADR-0212): o preview nativo no Studio foi
> pausado e este código vive na branch `feature/preview-nativo-no-studio`.
> A spec fica como registro do que foi construído e de por que funcionava assim.

## Contexto

Depois do M3 o preview nativo funcionava, mas era inutilizável no dia a dia por
duas fricções registradas na SPEC-0201:

1. **Exigia um export pronto**, feito à mão, e ainda pedia a pasta num diálogo.
2. **Não trocava de fase**: o seletor de fase recarrega o iframe com `?level=`,
   caminho que não existe para a janela nativa.

## Decisão

### Um comando: exporta e abre

O item de menu passa a `buildAndStartNative()`: exporta o projeto aberto com
`--debug --editor` e sobe o host embutido na pasta resultante. Sem diálogo, sem
export manual.

O export reusa o **cache de cook por hash** (ADR-0104), então a primeira vez
paga o preço dos assets e as seguintes são rápidas. O `export:native` ganhou o
parâmetro `editor` — e o export de produção continua sem ele.

### Trocar de fase = reiniciar o host com a query

`NativePreview.restart(launchQuery)` sobe o processo de novo com
`CORTEX_LAUNCH_QUERY=level=<id>`, mantendo as demais opções (a mesma janela
pai). É deliberadamente o **mesmo caminho de boot** que o `?level=` do iframe
usa — nenhum comando novo no protocolo, nenhum estado a sincronizar.

`Preview.openLevel` passa a rotear: com o preview nativo no ar, reinicia o host;
sem ele, recarrega o iframe como sempre.

## Validação

- 11 unitários em `tests/electron/nativePreview.test.ts`, incluindo os novos:
  a fase vai como `CORTEX_LAUNCH_QUERY`, o `restart` preserva a janela pai e
  troca só a query, e `restart` sem `start` anterior é no-op.
- O caminho de export com `--editor` já estava validado pela SPEC-0202/0204
  (é o mesmo binário e as mesmas flags).
- O embed com `CORTEX_LAUNCH_QUERY` é o que o `test-embed.ps1` já exercita.

**O que NÃO foi exercitado:** o clique no item de menu dentro do Studio rodando.
A composição (menu → export → embed) está coberta por partes, não de ponta a
ponta com UI.

## O que falta para o M4 fechar

Dois itens dependem do mesmo problema — **airspace**: DOM não desenha sobre uma
janela nativa filha.

- **Drag-and-drop de asset**: hoje um overlay transparente sobre o iframe
  captura o drop e manda `nx`/`ny` normalizados. Sobre a janela nativa esse
  overlay não recebe nada. Saídas possíveis: o host tratar o drop (SDL tem
  eventos de drop), ou a IDE usar a posição global do mouse no `drop` da janela.
- **Overlays do viewport** (pills de ferramenta, zona de drop, seletor de fase):
  precisam sair do retângulo do preview ou ser desenhados pelo host.

E um terceiro, independente:

- **Screenshot/playtest** usa `capturePage` do Chromium, que não enxerga a
  janela nativa. O caminho provável é `PrintWindow` no lado do Electron (é o que
  os scripts de validação deste repo já usam) ou um readback no host.

**O M5 (desligar o iframe) não deve começar antes disso.** Sem drag-and-drop e
sem screenshot, desligar o caminho Chromium tiraria capacidade do Studio.
