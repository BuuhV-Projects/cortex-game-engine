# SPEC-0326 — Poda de subárvores na projeção do `three` (`ProjectionPruner`)

**Data:** 2026-10-09
**Status:** aceito
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
junto (setorO 1.009k→933k, Hélio 951k→777k) e a moto da Hélio Prates **sumiu**
da screenshot: grupo parado com filho que anda deixa a esfera velha. O ganho
vinha de desenhar menos. Como o teto dessa parte era ~110 visitas (~0,08 ms),
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

(preenchido abaixo, após o A/B)

## Consequências

- Exata por construção; o único atraso possível é malha mudar de camada (ou
  nascer desenhável) sem evento de estrutura — rodízio/remontagem pegam,
  `invalidate()` força.
- Remontagem é uma travessia da cena; cena que adiciona/remove nós dentro de
  candidatas todo quadro pagaria isso todo quadro (contador `remontagens`).
- Testes: `tests/render/ProjectionPruner.test.ts`.
