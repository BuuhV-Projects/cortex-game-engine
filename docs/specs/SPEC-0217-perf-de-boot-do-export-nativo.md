# 0217 - Perf de boot do export nativo

**Data:** 2026-09-20
**Status:** aceito

## Contexto

O `kart-racer` exportado (194 MB, 194 nós, 7,4 M tris) leva **~19 s** até
desenhar o primeiro pixel. Durante todo esse tempo a janela fica **preta** — a
splash da engine (ADR-0109) não chega a aparecer, e o jogo surge de uma vez, já
montado.

A tela preta tem causa estrutural, medida:

- no host nativo o `fetch` é **síncrono** (`native/js/src/shims/net.js` →
  `__cortexReadFile`), então cada `await` do boot resolve numa microtask e a
  cadeia inteira roda sem devolver o controle ao host;
- o host só desenha a splash **dentro do loop** (`native/src/main.cpp`), que só
  roda depois de `runBoot` + `drainMicrotasks`;
- resultado: o `requestAnimationFrame` do jogo é agendado aos **0,2 s** e só é
  atendido aos **15,9 s**.

Esta spec trata do **custo real** (os segundos de CPU). A percepção (mostrar o
logo já no primeiro segundo e animar a splash enquanto carrega) fica para um
registro próprio — ela depende de tornar o I/O do host assíncrono, que é uma
decisão de outra natureza.

### Método de medição (reprodutível)

Profiler de boot (`src/core/bootProfile.ts`), ligado pelo escopo `boot` do
`debug()`: `bootMark(label)` carimba um instante desde o início do bundle e
`bootAcc`/`bootSync` acumulam tempo por chave. Para medir um export sem refazer
o `.pak`: copie a pasta exportada, gere o bundle com
`node native/scripts/bundle.mjs <out.js> <jogo>/main.ts`, compile com
`native/build/bin/hermesc.exe -emit-binary -O -w -out boot.hbc <out.js>` e
troque só o `boot.hbc` da cópia.

### Perfil medido (kart-racer, janela 1280×720)

| fase | custo |
| --- | --- |
| shims + UI do jogo + `game.start()` | 0,20 s |
| HDRI `ceu-claro.hdr` + PMREM | 2,26 s |
| instanciar 194 nós | 1,65 s |
| **merge estático** (`mergeStaticScene`) | **4,76 s** |
| 6 carros (`createCar`) | 4,83 s |
| míssil + registro de sistemas | 0,77 s |
| **primeiro frame** (compila pipelines) | **3,03 s** |
| **até a primeira imagem** | **~19 s** |

Por dentro dos blocos (acumulados):

| chave | custo | n |
| --- | --- | --- |
| `merge: applyMatrix4` | 3,41 s | 1600 |
| `car: mergeSubtree` (roda) | 2,18 s | 48 |
| `HDR: RGBELoader.loadAsync` | 1,74 s | 1 |
| `merge: mergeGeometries` | 1,28 s | 75 |
| `HDR: applyEnvironment` (PMREM) | 0,53 s | 1 |
| `car: addSolid/trimesh` | 0,48 s | 1 |
| `car: instance` (clone de roda) | 0,43 s | 48 |
| `AssetLoader.loadGLTF` | 0,31 s | 88 |
| `merge: flatSource+clone` | 0,05 s | 1600 |

**O I/O não é o gargalo**: ler os 75 `.glb` do `.pak` de 179 MB custa 0,23 s. O
boot é CPU em JS/Hermes, concentrada em transformar e copiar vértices.

## Decisão

Quatro correções, na ordem de impacto. Cada uma é verificável pelo profiler.

### 1. Merge estático numa passada só (alvo: −3,5 s)

Hoje cada instância elegível paga três varreduras dos vértices:
`flatSource().clone()` → `applyMatrix4()` → `mergeGeometries()`. O
`BufferGeometry.applyMatrix4` do three transforma vértice a vértice com
`Vector3`/`Matrix4` temporários — 3,41 s em 1600 instâncias no Hermes, contra
0,05 s do clone.

Passa a alocar o buffer do grupo **uma vez** (somando os counts) e escrever cada
instância já transformada direto no destino, com loop plano sobre os
`Float32Array` (coeficientes da matriz em variáveis locais, sem objeto por
vértice). Some o `clone` e o `mergeGeometries`, que deixam de existir.

O mesmo caminho serve o `mergeSubtree` (SPEC-0213), que é o custo das rodas.

**Feito** (`src/scene/bakeMerge.ts`). Medido: merge estático 4,76 s → **0,63 s**,
rodas 2,18 s → **0,26 s**, primeira imagem 18,5 s → **11,2 s**.

### 2. ~~Subárvore fundida reaproveitada~~ — resolvida pela correção 1

`createCar` funde a mesma roda 48 vezes (6 carros × 4 rodas × 2 variantes). Era
2,18 s a ~45 ms por roda; com o bake da correção 1 caiu para **0,26 s** (~5 ms
cada), porque o `mergeSubtree` usa o mesmo caminho. Um cache de subárvore
fundida economizaria ~0,2 s e adicionaria invalidação por material — não se
paga. Fica registrado como não-feito, de propósito.

### 3. Decodificador de HDR próprio (alvo: −1,5 s)

Decodificar o `.hdr` (2048×1024, 194 KB em RLE) com o `HDRLoader` do three
custa 1,74 s em Hermes — mesma doença do merge: por pixel ele chama
`Math.pow(2, e-128)` e quatro `DataUtils.toHalfFloat`, ou seja ~10 M operações
caras para 2 M pixels. O I/O do arquivo é irrelevante.

Passa a usar decodificador próprio (`src/core/hdrDecode.ts`): tabela de 256
escalas pré-computadas (mata o `pow`), conversão float→half inline por
manipulação de bits (mata o `toHalfFloat`) e laço plano sobre o `Uint8Array`.
O PMREM (0,53 s) continua em runtime.

> Registrado antes como "cozinhar o `.hdr` em KTX2 no export". Trocado durante a
> implementação: cozinhar mudaria o formato do asset e o pipeline de export —
> que vive no Studio empacotado — para atacar um custo que não é de I/O nem de
> formato, e sim da conversão por pixel. O decodificador próprio resolve no
> mesmo lugar da correção 1, sem mexer em asset, host ou export, e mantém
> Studio e browser lendo o mesmo `.hdr`.

### 4. Pipelines do primeiro frame (alvo: −1,5 s)

O `precompile` (SPEC-0196) já existe, mas é disparado sem ser aguardado e só
termina bem depois do jogo na tela — o primeiro frame paga 3,03 s compilando o
que aparece. Passa a ser aguardado antes do primeiro render, o que só vale junto
com a splash animando (registro da percepção) — por isso fica por último.

## Consequências

- O merge deixa de usar `mergeGeometries` do three e passa a ter código próprio
  de cópia de atributos: mais código nosso para manter, em troca de ~4 s por
  carga. Os casos de borda que o three cobria (atributos ausentes em parte do
  grupo, morph targets) precisam de teste — grupos assim continuam caindo no
  caminho conservador (mantém as malhas separadas).
- O engine passa a decodificar `.hdr` por conta própria, em vez de delegar ao
  `HDRLoader` do three: um formato de arquivo a mais sob nossa
  responsabilidade. Mitigado por teste que compara a saída com a do three,
  pixel a pixel, inclusive nos casos de borda do RLE (linha curta, repetição
  longa, arquivo sem compressão).
- Bake offline do merge (pré-fundir células no export, M-perf-4 do PRD-0005)
  **não** é feito aqui: a fusão depende da cena montada (overlay do editor,
  matrizes de mundo, o que é dinâmico). Com o custo em runtime caindo de 4,8 s
  para ~1 s, o bake deixa de ser urgente e continua valendo para mundo aberto.
- `src/core/bootProfile.ts` passa a ser permanente, desligado por padrão
  (escopo `boot` do `debug()`), como instrumento de regressão de boot.
