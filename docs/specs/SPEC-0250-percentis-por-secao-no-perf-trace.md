# SPEC-0250 — Percentis por seção no perf-trace

**Data:** 2026-09-23
**Status:** aceito

## Contexto

O que compromete a experiência no kart-racer não é a média: é a **oscilação**.
O jogo vai a 70 e cai a 50 em um segundo, e isso incomoda mais do que uma taxa
menor e estável incomodaria.

A SPEC-0249 mediu as fases do frame no host e fechou a questão de onde o tempo
está: `js` responde por **97%** do frame (`present` custa 0,29 ms). O alvo,
portanto, é a **variância dentro do JS** — qual seção do frame tem o pior caso
mais distante da mediana.

O `FrameProfiler` (SPEC-0134) **já mede exatamente isso**: ring buffer de 240
frames por seção, com média e p99, sobre **todos** os frames. O `DebugHud` lê e
mostra.

Só que o `PerfTrace`, que é o que grava o arquivo analisável, guarda o campo
errado — `PerfTrace.ts:344`:

```ts
for (const section of profiler.summary()) cpu[section.name] = section.lastMs;
```

`lastMs` é a duração de **um frame**, o último antes da amostragem, colhido uma
vez a cada ~0,5 segundo. Para caçar variância isso é amostra de conveniência:
de cada ~30 frames, 29 são descartados, e o que sobra é um sorteio.

Duas consequências medidas, as duas em cima deste defeito:

- **Correlações sem sentido.** `cpu.render` × draws caiu de r = 0,936 para
  r = 0,116, e nenhuma variável explicava o frame (todas entre 0,30 e 0,39).
- **Outliers impossíveis.** Um registro com `cpu.render` de 979 ms num frame
  cujo `frameMs` era 15,7 (ver a memória do projeto). Um valor cru de um frame
  isolado, sem nada que o contextualize.

## Decisão

Gravar as três estatísticas que o `FrameProfiler` já calcula, não só uma:

| campo no trace | origem | para que serve |
| --- | --- | --- |
| `cpu.<seção>` | `lastMs` | mantido — compatibilidade com o que já lê o trace |
| `cpuAvg.<seção>` | `avgMs` | o custo típico, sobre 240 frames |
| `cpuP99.<seção>` | `p99Ms` | **o pior caso** — a métrica da oscilação |

A distância entre `cpuP99` e `cpuAvg` de uma seção é a variância dela, medida
sobre todos os frames da janela em vez de um sorteio.

### Por que não trocar `lastMs` por `avgMs`

Seria mais limpo, mas quebraria a leitura de todo trace já coletado e das
ferramentas que os analisam. O campo fica, com a companhia que faltava.

### Por que p99 e não p95

É o percentil que o `FrameProfiler` já mantém, e trocá-lo mudaria o `DebugHud`
junto. Pegar o que existe custa zero e responde a pergunta.

## Consequências

- O trace cresce em três campos por seção. São ~8 seções; o arquivo já carrega
  a lista de objetos visíveis por amostra, que é ordens de grandeza maior.
- **Traces antigos continuam legíveis**, e traces novos respondem uma pergunta
  que os antigos não respondiam.
- Custo em runtime: zero. `profiler.summary()` já é chamado e já calcula
  média e p99; os valores estavam sendo descartados.
- Fica registrado que **`lastMs` não serve para análise de variância** — foi a
  causa de duas conclusões erradas nesta campanha.
