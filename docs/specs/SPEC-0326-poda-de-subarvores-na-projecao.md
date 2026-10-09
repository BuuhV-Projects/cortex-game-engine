# SPEC-0326 — Poda de subárvores na projeção do `three` (`ProjectionPruner`)

**Data:** 2026-10-09
**Status:** rejeitado — medido, não se paga; código fora da main (fica no histórico do branch `perf/r2-poda-projecao`, commit `e48938bf`)
**Decisão:** ADR-0327

## Contexto

Frente R2-D do ciclo "75 fps no export nativo do DDD 61". A R1b (export
release, main `1143723d`) mediu `three._projectObject` = **5,0 ms/quadro com
1.294 chamadas** e concluiu que a travessia da árvore (~10 mil nós) era um dos
maiores itens do render.

### Remedição (o número da R1b estava inflado)

A sonda da R1b embrulhava `_projectObject` com `onlyTop = false`: cada chamada
recursiva somava o próprio tempo INCLUSIVO, então um nó na profundidade 4 era
contado 4 vezes, e cada visita pagava dois `performance.now()`. Remedido no
export release (`.cortex/r2-d/runs/setorO-probe*`), cronometrando só a chamada
de topo e deixando a recursão ir direto ao original:

| passe | ms/quadro |
|---|---|
| cena, câmera do jogo (`PerspectiveCamera`) | **1,11–1,74** (estável ~1,2) |
| cena, câmera ortográfica (sombra) | 0,06–0,10 |
| quads de pós (2×) | 0,03–0,05 |

Bate com a sonda de fases da SPEC-0227 da própria R1b (`rpProject` = 1,4 ms,
3 chamadas de topo). Contagem no passe do jogo (setorO): **~1.330–1.460
visitas, ~650–730 malhas testadas, só ~150–170 itens empurrados**. A poda
ideal (subárvores que não empurram nada, menos a raiz) é **~640–730 visitas**,
por raiz da cena:

| raiz | visitas | podáveis (ideal) | por quê |
|---|---|---|---|
| `pedestres` | 306–374 | 305–373 | peças dos bonecos na camada 27 (lote instanciado), nada para a câmera |
| `lojas` | 273–282 | 76–85 | interiores fora da tela |
| `moradores-de-rua`, `gente-metro` | 52–73, 65 | ~todas | idem bonecos |
| `tiroteio-efeitos` | 44 | 43 | efeitos ocultos/sem desenho |
| `onibus-*`, `moto-*` | 58–63, 42–45 | 6–17 | veículos fora da tela |

**Teto honesto da frente: ~50% de ~1,2 ms ≈ 0,6 ms/quadro**, não os −2 a −3 ms
pedidos.

## Decisão

`src/render/ProjectionPruner.ts` (ADR-0327), instalado pelo `Game` no
`threeRenderer` depois da sonda de fases.

### Candidatas

Montadas por uma busca a partir dos filhos da cena (subárvore escondida é
pulada: o `three` já não entra nela). Para cada nó, `measureSubtree` conta os
nós da subárvore com a máscara de camadas da câmera:

- algum nó **faz trabalho na projeção** — luz, `LOD`, `BundleGroup`,
  `ClippingGroup`, ou malha/linha/pontos/sprite NA CAMADA da câmera —:
  não é candidata, a busca desce aos filhos;
- desenhável em OUTRA camada não conta (o `three` o descarta no
  `layers.test`) — é o caso das peças dos bonecos do DDD 61;
- subárvore com **< 3 nós** (`MIN_SUBTREE_NODES`): ignorada (não compensa);
- senão é candidata: independe do frustum e da posição.

### Por passe

O wrapper fica no `_projectObject` da INSTÂNCIA e só age na chamada de topo
com `object.isScene` e `camera === pruner.camera`:

1. remonta as candidatas se houve `childadded`/`childremoved` dentro de uma
   delas, se a máscara de camadas da câmera mudou, ou a cada 120 passes
   (`REBUILD_EVERY_PASSES` — filho novo fora de candidata só fica sem poda até
   lá, nunca some);
2. remede 4 candidatas em rodízio (`REFRESH_PER_PASS`); contagem diferente
   (ganhou desenhável, malha trocou de camada) ⇒ remonta no próximo passe;
3. cada candidata visível recebe `visible = false`;
4. aponta `this._projectObject` direto pro método do protótipo durante a
   travessia (a recursão não passa pelo wrapper), chama, e no `finally` volta o
   wrapper e devolve `visible = true` a quem foi escondido.

Sombra: a passada do `three` (dentro de `_renderObjects`) e a nativa (que lê o
`visible` no `update` do espelho, antes do render) acontecem fora da janela da
poda. Com o espelho da SPEC-0322 (só sincroniza nó sujo; `visible` conferido
por varredura em rodízio contra o último valor enviado), o `visible`
temporário não suja slot nenhum: a varredura só roda no `update`, e aí o valor
já voltou. O `scene.onBeforeRender` (lote de bonecos) também vem antes.

### Poda por frustum: tentada e retirada

A 1ª versão também guardava, por subárvore compacta (raio ≤ 40 m), uma esfera
no espaço local da raiz e escondia a raiz fora do frustum. No A/B (main
81a84ddd, `.cortex/r2-d/runs-v1`) o quadro caiu 2,3–3,3 ms, mas `tris` caiu
junto (setorO 1.009k→933k, Hélio 951k→777k): grupo parado com filho que anda
deixa a esfera velha e o objeto some. O ganho vinha de desenhar menos (e esse
A/B ainda tinha a baseline com `node_modules` por junction — ver Resultados). Como o teto dessa parte era ~110 visitas (~0,08 ms),
saiu inteira; ver ADR-0327 para a alternativa exata (bit por subárvore do C++).

### Onde liga

- Só no host nativo (`isNativeHost()`); `?projectionPrune=0` desliga (A/B).
- `pruner.camera` é posta por quadro pelo `Game`: a `_activeCamera` quando o
  jogo está desenhando; `null` no editor (F2), na câmera de inspeção, no
  carregamento e no quadro de aquecimento (ADR-0262, precisa ver tudo).
- Estatística a cada 300 passes em `debug('perf')`: candidatas, nós
  poupados/q (conta também nós já escondidos lá dentro — é teto, não visita
  real), ms/q da própria poda, remontagens.

## Resultados

Tudo no export RELEASE do DDD 61, janela 1280×720 com SSAA 2× (alvo interno
2560×1440), rodadas de 110–150 s serializadas por `.cortex/measure.lock`,
análise com t ≥ 30 s. Artefatos em `.cortex/r2-d/`.

### Sonda direta (main 13555386, setorO; mesma build, `?projectionPrune=0`)

| | visitas/q | `_projectObject` topo (ms/q) | custo da poda (ms/q) |
|---|---|---|---|
| sem poda | 1.264–1.468 | 0,95–1,08 | — |
| poda exata | 868 | 0,92–1,00 | 0,71–0,82 (0,27–0,67 nas rodadas do A/B) |

−40% de visitas, mas só **~0,08 ms** a menos na projeção: visita a grupo sem
malha custa ~0,15 µs no Hermes; o caro do `_projectObject` é a malha
(`intersectsObject` + `renderList.push`), e essas a poda exata não pula. O
custo do próprio pruner (rodízio de remedição e remontagens percorrendo as
subárvores dos bonecos, ~4.400 nós) supera o ganho.

### A/B final (engine 9371accd × branch; jogo 9be7c6f)

| ponto | base frameMs med (fps) | poda frameMs med (fps) | tris base / poda |
|---|---|---|---|
| setorO | 23,5 (42,6) | 22,0 (45,5) | 932,6k / 931,8k |
| comercial | 30,1 (33,2)* | 25,6 (39,1) | 1.227,8k / 1.239,7k |
| Hélio (drive) | 18,8 (53,2) | 21,0 (47,6) | 776,5k / 776,2k |

(*) a base do comercial teve uma janela anômala (23 fps, js 36,7 ms). A
RenderList sai igual (`tris`/`draws` batem) e as diferenças de fps mudam de
sinal entre pontos: **ruído**, coerente com o saldo ≈ 0 (ou negativo) da sonda.

### RENDER_SCALE=1 (pedido extra)

setorO, base 9371accd: `CORTEX_RENDER_SCALE=1` (alvo 1280×720) dá frameMs med
22,2 ms (45,0 fps) e gpu-latency med 9,6–10,4 / p95 15,2–16,2 ms, contra
23,5 ms e gpu-latency med 9,8–12,0 / p95 14,9–19,6 ms no padrão 2×
(2560×1440). Na R2 com main 81a84ddd: 10,1–10,3 nas duas escalas. A GPU não
está limitada por preenchimento nesta resolução e a mediana cabe em 13,3 ms; o
p95 (~15–16 ms) não. Tela cheia 2560×1440 nativa com 2× (5120×2880 interno)
não foi medida.

## Consequências

- Nenhum código entra na main. O `_projectObject` do `three` segue como está.
- Ficam registradas as três armadilhas (architecture.md §8e6): a sonda que
  dupla-conta recursão, a poda por esfera em cache que some com objeto, e a
  baseline de A/B com `node_modules` por junction.
- Se a projeção voltar a importar, o caminho exato é o bit "subárvore fora do
  frustum" agregado no espelho em C++ (ADR-0327) — e só vale se pular MALHAS.
