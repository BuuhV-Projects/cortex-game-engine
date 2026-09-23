# SPEC-0248 — Reúso da textura de texto do HUD

**Data:** 2026-09-22
**Status:** aceito

## Contexto

Medição no host nativo (kart-racer, 2 min de corrida) mostrou **~45
rasterizações de texto por segundo** — praticamente um label por frame. O
`heap-js` sobe até 138 MB e despenca em coletas repetidas.

O caminho é `RendererUiBackend._rasterInto`. Hoje, **toda** mudança de texto
refaz a cadeia inteira:

| passo | custo por raster |
| --- | --- |
| `__cortexRasterText` (stb_truetype) | ~11 KB de `ArrayBuffer` nativo |
| cópia `flipped` (inverte as linhas para a UV do plane) | ~11 KB de heap JS |
| `new THREE.DataTexture` | objeto + upload para a GPU |
| `new THREE.MeshBasicMaterial` | objeto + **bind group novo** |
| `dispose` adiado de textura e material (graveyard de 2 frames) | churn de GPU |

O agravante é o material. O comentário do código explica por que ele é
recriado: *"trocar só o `map` não força o rebind no WebGPURenderer"*. Só que
material novo é **chave de cache nova** no `Pipelines` do `three` — o mesmo
mecanismo que produz os picos de `cpu.render` tratados na SPEC-0249.

### Por que cache por string não resolve

A tentação é um LRU chaveado por `texto|fontSize`. Não serve para o caso
dominante: o cronômetro (`1:23.45`) **nunca repete valor**. Um cache com 100%
de miss só adiciona memória e código.

O que de fato se repete é a **forma**: `1:23.45` e `1:23.46` têm exatamente as
mesmas dimensões em pixels, porque os dígitos da Roboto são tabulares. O mesmo
vale para `120 km/h` → `121 km/h`.

## Decisão

Quando o bitmap novo tiver **exatamente as mesmas dimensões** do que já está na
textura do widget, escrever os pixels **no lugar** e marcar `needsUpdate`, em
vez de construir textura e material novos.

```
mesma largura E mesma altura  ->  flipInto(textura.image.data); needsUpdate = true
qualquer outra coisa          ->  caminho atual (textura + material novos)
```

O caminho antigo continua inteiro como fallback — texto que muda de tamanho
(entra um dígito a mais, muda a fonte) segue funcionando como hoje.

Ganho por raster reaproveitado: some a cópia `flipped`, a `DataTexture`, o
`MeshBasicMaterial`, as duas entradas no graveyard e a criação de bind group.
Resta o raster nativo e o upload da textura — os dois inevitáveis, porque os
pixels realmente mudaram.

### O que NÃO muda

- **O jogo não é alterado para ganhar perf.** Cronômetro com centésimos é
  característica do gênero; degradar para `.toFixed(1)` seria trocar produto
  por milissegundo. A correção fica na engine e vale para todos os jogos.
- A telemetria `text=Nx/MB` do host continua como está — ver Consequências.

## Consequências

- `_textWidth` lê `visual.texture.image.width`; no caminho de reúso a largura é
  a mesma por construção, então o layout não muda.
- O `flipInto` passa a escrever num `Uint8Array` já existente. Ele precisa ser
  o buffer da própria textura (`image.data`), não uma cópia — senão o upload
  não vê a mudança.
- **A métrica `text=` do host não vai cair proporcionalmente.** Ela conta
  rasterizações acumuladas desde o boot (`perf_arraybuffer.cpp` só tem
  `fetch_add`, nunca `fetch_sub`), e o raster nativo continua acontecendo. O
  que cai é a alocação em JS e o churn de GPU — visível no `heap-js` e na
  frequência de GC, não naquele contador.
- Fica registrado que o contador `text=` é **histórico, não um gauge de memória
  viva**. Lê-lo como "63 MB em uso" é erro de leitura — foi o que motivou esta
  investigação.
