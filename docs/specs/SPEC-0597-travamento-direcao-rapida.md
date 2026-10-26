# SPEC-0597 — Travamento com o carro em velocidade (milhares de `writeBuffer` num quadro)

**Data:** 2026-10-25
**Status:** causa confirmada; conserto no jogo (Frente D). Item 1 de "O que falta para fechar o R1", PRD-0466

## Contexto

Teste real do usuário no export do DDD 61 (`C:\Users\buuhb\Documents\builded-ddd-61`, engine pós-R1.6,
renderer próprio **desligado**, caminho do three; `perf-trace.jsonl`, 115 s, 1080p):

- a pé (~3 m/s): 21,8 ms por quadro e 0 picos;
- com o carro (~15 m/s): 40,7 ms, e 20 de 69 amostras com quadro de 100 ms. Cada pico tem 10–40 mil
  `writeBuffer` (`napiWb`) num quadro, contra ~100 no normal, e `napi` de 75 a 1235 ms;
- no `perf-log.txt` dele, o heap de JS sobe de 367 para 758 MB em ~2 min (e cai para 324 MB no fim).

40 mil escritas num quadro são a cena inteira (`nodesTotal` 8789, poucos buffers por objeto), não os
~700 visíveis.

**Hipótese principal (Frente C).** A correção `ecaf612f` (SPEC-0555, "Emissivo animado") faz o
`RenderIdRefresh` forçar o refresh completo do three em **todo** render object que pulou quadros
(`frameId` com intervalo > 1). Ela era necessária só para o objeto cujo **material mudou** enquanto ele
estava fora (o instantâneo do material é um só por material no `NodeMaterialObserver`). Casos em que
muitos objetos pulam quadros de uma vez:
- objetos que voltam ao frustum (em velocidade a câmera varre a cidade);
- as cascatas da sombra que voltam ao three no quadro em que a sombra nativa recusa (geometria nova do
  streaming, SPEC-0289): todos os casters da cascata "pularam" quadros desde a última vez.

Outras hipóteses (do PRD): algo da missão de motorista de app no jogo; acúmulo de lixo por quadro.

## Instrumento

`?wbCensus=1` (host, desligado por padrão; `src/render/WriteBufferCensus.ts`): embrulha
`device.createBuffer` (guarda o rótulo de cada buffer) e `device.queue.writeBuffer` (conta por rótulo
normalizado, sem o id: `bindingBuffer_object_…`, `native.view`). A cada quadro (`frameId` do
`NodeFrame`) com ≥ 1000 escritas, uma linha no `debug('perf')`: total, os 5 rótulos que mais escreveram
e o `stats.full` do `RenderIdRefresh` naquele quadro. A cada 600 quadros, o total médio.

**Validação do instrumento (resposta conhecida):** com o renderer próprio ligado, `native.view` é escrito
exatamente 1 vez por quadro (`beginFrame`).

`?rangeCensus=1` (`pendingInstanceRanges`, chamado no tick do `Game` a cada 120 quadros): as `InstancedMesh`
e atributos instanciados com mais `updateRanges` pendentes (nome, atributo, faixas, `count`, visível), no
`debug('perf')` (`[rangeCensus]`) e no trace (evento `instanceRanges`, um por malha do top 6).

## Reprodução

Direção real: `?spawn=helio&drive=1` + autopiloto `drive` (o perfil próprio de teste no Comercial não
andou: o carro ficava preso). 135 s por braço, export da engine com o instrumento sobre o DDD 61 `290fcb5`.
Rodadas em `D:/jogos/detetive-brasilia/.cortex/stages/wb-repro2` e `wb-ranges`.

## Resultado

| braço (dirigindo) | picos ≥ 1000 escritas | escritas/quadro (média) | `native.view`/quadro |
| --- | --- | --- | --- |
| three padrão | 110 (6–14 mil) | 329 | — |
| three `?renderIdRefresh=0` | 137 | 224 | — |
| nativo | **0** | 35 | **1,00** (validação) |

- **Não é o `RenderIdRefresh`:** o braço sem ele tem os mesmos picos, e o `full` (refresh completo) é de
  8–25 por pico. A hipótese principal caiu.
- **Quem escreve:** ~99% das escritas de cada pico vão para buffers de **atributo** (`?u44` =
  VERTEX|COPY_DST|COPY_SRC), pela pilha `_renderObjectDirect → Geometries.updateForRender →
  updateAttribute`. O `updateAttribute` do three (`WebGPUAttributeUtils.js:177–216`) faz **um `writeBuffer`
  por `updateRange`** e só limpa as faixas (`clearUpdateRanges`) quando sobe o atributo.
- **Quem acumula** (`?rangeCensus=1`): só as malhas `quebravel-*` do `entities/breakableProps.ts` do jogo.
  O `cull()` roda quando o jogador anda (`viewGate.changed`), renumera todas as instâncias do alcance e
  soma uma faixa de 16 floats por instância (mais uma de cor com tinta), com índices contíguos. As
  faixas **crescem sem limpar**: `quebravel-compartilhado-wwhtor.instanceMatrix` 1140 → 2113 (three,
  2280 quadros) e → 2575 (nativo, 5160 quadros), com `count` ~45–55. Também `quebravel-dz5l7u`,
  `-6ywo0m`, `-0xt0ju`, `-t9uuf8`, `-wlo5lr` e o `instanceColor` de `quebravel-compartilhado-7idw86`
  (~990).
- **No three:** a malha fora da vista não é desenhada e acumula; quando volta, sobe tudo de uma vez
  (milhares de escritas num quadro). Em velocidade o `viewGate` abre mais, daí o crescimento com a
  velocidade e o travamento que continua depois de sair do carro.
- **No nativo:** o three nunca sobe esses atributos, então as faixas crescem para sempre (memória, sem
  custo no quadro); o renderer próprio sobe o buffer inteiro, 1 escrita por versão.

**Conserto:** no jogo, não na engine (vale para qualquer renderer): o `cull()` limpa as faixas e registra
uma só (`0..n*16`, e `0..n*3` para a cor) depois de renumerar. Fica com a Frente D (SPEC do jogo).
