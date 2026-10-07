# SPEC-0326 — Poda de subárvores na projeção do `three` (`ProjectionPruner`)

**Data:** 2026-10-07
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

Montadas por uma busca a partir dos filhos da cena. Para cada nó, mede a
subárvore (`measureSubtree`) com a máscara de camadas da câmera:

- **bloqueia** (a busca desce aos filhos): luz, `LOD`, `BundleGroup`,
  `ClippingGroup`; e, entre os desenháveis NA CAMADA da câmera, sprite,
  skinned, instanced, batched ou `frustumCulled = false`;
- desenhável em OUTRA camada não conta (o `three` o descarta no
  `layers.test`) — é o caso dos bonecos do DDD 61;
- subárvore com **< 3 nós** (`MIN_SUBTREE_NODES`): ignorada;
- **sem nada desenhável** pela câmera: candidata `always` (sai sempre, sem
  teste de esfera);
- esfera local com raio ≤ **40 m** (`MAX_CANDIDATE_RADIUS`): candidata com a
  esfera da geometria no espaço LOCAL da raiz, com folga ×1,25 + 1 m
  (`SPHERE_MARGIN_*`); maior que isso: desce aos filhos.

### Por passe

O wrapper fica no `_projectObject` da INSTÂNCIA e só age na chamada de topo
com `object.isScene` e `camera === pruner.camera` (não `ArrayCamera`):

1. remonta as candidatas se a cena mudou de estrutura (`childadded`/
   `childremoved` em qualquer nó, escutados como faz o espelho de cena) ou se a
   máscara de camadas da câmera mudou;
2. remede 16 candidatas em rodízio (`REFRESH_PER_PASS`); contagem ou
   "tem desenhável" diferente ⇒ remonta no próximo passe;
3. frustum da câmera (`projectionMatrix × matrixWorldInverse`, mesmo sistema
   de coordenadas do `three`); cada candidata visível fora dele (ou `always`)
   recebe `visible = false`;
4. aponta `this._projectObject` direto pro método do protótipo durante a
   travessia (a recursão não passa pelo wrapper), chama, e no `finally` volta o
   wrapper e devolve `visible = true` a quem foi escondido.

Sombra: a passada do `three` (dentro de `_renderObjects`) e a nativa (que lê o
`visible` no `update` do espelho, antes do render) acontecem fora da janela da
poda. O `scene.onBeforeRender` (lote de bonecos) também vem antes.

### Onde liga

- Só no host nativo (`isNativeHost()`); `?projectionPrune=0` desliga (A/B).
- `pruner.camera` é posta por quadro pelo `Game`: a `_activeCamera` quando o
  jogo está desenhando; `null` no editor (F2), na câmera de inspeção, no
  carregamento e no quadro de aquecimento (ADR-0262, precisa ver tudo).
- Estatística a cada 300 passes em `debug('perf')`: candidatas, podadas/q,
  nós poupados/q, ms/q da própria poda, remontagens.

## Resultados

(preenchido abaixo, após o A/B)

## Consequências

- Esfera em cache supõe subárvore rígida; o rodízio e a folga limitam o erro.
  Mudança de `layers`/`frustumCulled` sem evento de estrutura só é vista no
  rodízio — `invalidate()` força a remontagem.
- Remontagem é uma travessia completa da cena; cena que adiciona/remove nós
  todo quadro pagaria isso todo quadro (contador `remontagens` no log).
- Testes: `tests/render/ProjectionPruner.test.ts`.
