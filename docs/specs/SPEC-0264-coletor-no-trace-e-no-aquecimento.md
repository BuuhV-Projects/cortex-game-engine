# SPEC-0264 — Coletor de lixo no trace, e uma coleta no fim do aquecimento

**Data:** 2026-09-24
**Status:** aceito
**Relacionado:** ADR-0262, ADR-0153 (`__cortexGC`)

## Contexto

Depois do quadro de aquecimento (ADR-0262) o kart-racer parou de travar, mas a
largada ficou lenta: de 26 a 40 s o render foi de 9 para 15–37 ms e a física de
0,5 para 5–9 ms — os dois juntos, 2 a 3×, com o mesmo número de desenhos, e
voltaram ao normal de uma vez aos 40,4 s.

O heap do JS começa agora em 120 MB (41 MB antes): o quadro de aquecimento cria
de uma vez os objetos de render da cena inteira. Render e física são JS; a
hipótese é o coletor do Hermes (Hades) varrendo esse heap maior em pedaços, no
meio dos quadros. Nada no trace mede o coletor, então a hipótese não tem como
ser confirmada nem derrubada.

## Decisão

**Medir.** O host registra o callback de analytics do Hermes
(`GCConfig::withAnalyticsCallback`), que informa cada coleta: tipo (`young` ou
`old`), duração de parede e tempo de CPU. Os acumulados vivem em
`native/src/core/gc_stats.{h,cpp}` — atômicos, porque o Hades coleta numa
thread própria — e o JS lê por `__cortexGcStats()`:

```
{ youngCount, youngMs, oldCount, oldWallMs, oldCpuMs }
```

Cada amostra do `perf-trace.jsonl` leva esse objeto em `gc` (acumulado — a
diferença entre amostras diz o que coletou no intervalo). Uma coleta `old` que
atravesse a largada aparece com a duração de parede inteira.

**Correção candidata, no mesmo build.** O `game.precompile()` chama
`__cortexGC()` depois do quadro de aquecimento: a coleta grande, com o heap
recém-inflado, acontece sob a tela de carregamento.

As duas vêm juntas porque uma volta decide: lentidão sumiu + coleta `old` no
carregamento e não na largada → confirmado. Lentidão ficou sem coleta `old`
no trecho → a hipótese cai, e o contador mostra.

## Consequências

- Custo: um callback por coleta, com três incrementos atômicos.
- Fora do host (`__cortexGcStats` ausente) o campo `gc` não aparece.
- O `precompile` passa a custar também uma coleta completa — sob a tela de
  carregamento, onde é barato para o jogador.
