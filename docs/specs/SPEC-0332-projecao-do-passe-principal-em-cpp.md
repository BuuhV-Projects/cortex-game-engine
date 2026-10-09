# SPEC-0332 — Projeção do passe principal em C++ (etapa (a) do ADR-0330)

**Data:** 2026-10-09
**Status:** aceito — implementado e medido (A/B no fim)

## Contexto

No DDD 61 o `_projectObject` do `three` custa **1,5–2,2 ms por quadro**
(SPEC-0227, R2b): ele percorre em JS a árvore visível de ~10 mil nós, testa
cada malha contra o frustum e calcula o `z` de ordenação. O `SceneMirror`
(SPEC-0233/0234) já tem, em C++, a hierarquia, as matrizes de mundo em dia
(SPEC-0322) e a esfera local de cada geometria (SPEC-0245). Falta só usá-lo
para a câmera do passe principal.

## Comportamento

### O que vai para o C++

`native/src/scene/main_pass_culler.*` reproduz o `_projectObject` sobre o
espelho, numa passada linear (pai antes de filho):

1. **visibilidade herdada** — `visible === false` poda a subárvore (lápide é
   invisível);
2. **recusa** — nó alcançável com `kMainUnsupported` devolve `-1` e o índice
   dele: `LOD` (troca filhos dentro da projeção), `ClippingGroup`,
   `BundleGroup`, ou `Group` com `renderOrder ≠ 0` (vira o `groupOrder` dos
   descendentes, que a lista nativa não carrega). O `three` projeta o quadro;
3. **malha/linha/pontos sem esfera própria** (`kNodeMainCull`) — centro da
   esfera local × matriz de mundo, raio × `getMaxScaleOnAxis()`, teste contra
   os 6 planos (se `frustumCulled`), e `z` = linha z da view-projection
   aplicada ao centro de mundo **sem dividir por w** (o `Vector4` do `three`
   tem w = 1 e ele não divide);
4. **pass-through** — luz (`kNodeLight`) e `kNodeMainJsCull` (`Sprite`,
   `InstancedMesh`, `SkinnedMesh`, `BatchedMesh`: a esfera que o `three` usa é a
   do OBJETO, que o espelho não tem) entram quando visíveis, sem culling.

A matemática de esfera (`maxScaleOnAxis`, `transformPoint`,
`intersectsSphere`) saiu do enumerador de sombra para `scene/sphere_math.h`,
compartilhada pelos dois.

Ponte (`native/src/shims/main_pass_shim.*`, global `__cortexMainPass`):

| chamada | o quê |
| --- | --- |
| `project(planos: Float64Array(24), viewProj: Float64Array(16), indices: Int32Array, z: Float64Array)` | devolve quantos candidatos; `-1` = recusa (nó em `indices[0]`), `-2` args, `-3` saída pequena |
| `setBounds(indice, cx, cy, cz, raio)` | a geometria do nó mudou |

Tudo em `double` (regra da SPEC-0234).

### O que fica em JS (`src/render/NativeMainProjection.ts`)

`installNativeProjection` embrulha o `_projectObject` do renderer. Só assume a
chamada de **topo** (`groupOrder === 0`) cuja raiz é a **cena espelhada**, com
`sortObjects !== false` e câmera que não é `ArrayCamera`. Qualquer outra
(subárvore, UI, quad de pós, cena de carregamento, editor) segue no `three`.

Por candidato, o JS faz o que depende de JS, na regra do `three`:

- `object.layers.test(camera.layers)`;
- luz → `renderList.pushLight`;
- `kNodeMainJsCull` → o teste exato do `three` (`intersectsSprite` /
  `intersectsObject`) e o `z` dele;
- material em array → um `push` por grupo da geometria com material visível;
  material único → `push` se `material.visible`.

A **ordem de inserção** difere da travessia em profundidade do `three` (o
espelho é em largura, com reuso de slot). Não muda a imagem: o sort da
RenderList (`groupOrder`, `renderOrder`, `z`, `id`) é uma ordem **total** — por
isso `sortObjects = false` é recusa. As luzes são ordenadas por `id` dentro do
`LightsNode`.

### Estado por quadro que o host passou a receber

| dado | canal | atraso máximo |
| --- | --- | --- |
| `visible` | **gancho** no objeto (acessor, como `position`), suja o slot na escrita | **0 quadros** |
| `frustumCulled` cru | bit `kSyncFrustumCulled` da linha (varredura da SPEC-0322) | 8 quadros |
| tipo/ordem não reproduzível | bit `kSyncMainUnsupported` (varredura) | 8 quadros |
| esfera da geometria | `setBounds` quando a varredura vê `geometry` trocada | 8 quadros |
| escrita feita **durante** o render | `syncPending()` antes de projetar | 0 quadros |

O `visible` era só varrido (até 8 quadros de atraso) — aceitável no passe de
sombra, visível no principal (objeto aparecendo/sumindo atrasado). Com o
gancho, a sombra também passa a ver a mudança no mesmo quadro.

### Interruptores

- `?nativeMainPass=0` desliga todo o caminho novo do passe principal (ADR-0330);
- `?nativeProjection=0` desliga só esta etapa.

Padrão ligado no host (só onde há `__cortexMainPass` e espelho instalado). O
Studio não tem a ponte: segue 100% no `three`.

## Limitações conhecidas

- **`geometry.boundingSphere` recalculada na MESMA geometria** (geometria
  dinâmica que cresce) não é vista: a varredura compara a identidade da
  geometria, não a esfera. Nenhuma malha do DDD 61 faz isso; se aparecer, o
  objeto pode ser cortado cedo na borda da tela.
- `frustumCulled`/`renderOrder` de grupo mudados em runtime chegam em até 8
  quadros (varredura). O pior caso é um objeto cortado por ≤ 8 quadros na
  borda da tela, ou um quadro projetado pelo nativo com `groupOrder` velho.
- A projeção é por chamada de `render()`: se o passe de sombra do `three`
  rodar (gate da SPEC-0245 recusando), ele também passa por aqui com a câmera
  da cascata — o resultado é o mesmo do `three`.

## Testes

- C++ (`native/tests/main_pass_culler_test.cpp`, 7 casos): visibilidade
  herdada, raio pela maior escala, `z` sem divisão por w, pass-through de luz e
  JS-cull, recusa só quando alcançável (e por linha de sincronização),
  `frustumCulled` por quadro, `setBounds`.
- Vitest (`tests/render/NativeMainProjection.test.ts`): classificação, a
  RenderList contra os ramos do `_projectObject` (material invisível com filho
  que desenha, material em array com grupo invisível, camada, luz, pai
  invisível, instanciado cortado pela esfera do objeto, `z` igual ao do
  `three`), e o que volta ao `three`.
- Vitest (`tests/core/NativeSceneMirror.test.ts`): `visible` no mesmo quadro,
  `syncPending`, troca de geometria → `setBounds`, gancho desfeito na remoção.

## A/B

Export **release** do DDD 61 (jogo `9be7c6f`), `node_modules` real nos dois
lados (`boot.hbc` da main 4.126.763 B; deste ramo 4.134.858 B — +8 KB, só o
código novo). Três braços intercalados por ponto (main, `?nativeProjection=1`,
`?nativeProjection=0` na MESMA build), sob o `measure.lock`, 135 s por rodada
(150 s no hélio dirigindo), amostras com t ≥ 30 s. Medianas de `cpuAvg`.

A máquina derivou muito entre rodadas (o `world`, que nenhum braço muda, foi de
4,4 a 8,6 ms). Por isso a leitura principal é **on × off da mesma build** e a
razão `render / (update + world)`, que desconta a deriva comum.

Voltas v3 (main `761e7957`, 2 voltas) e v4 (main `8c8eeb11`, 1 volta):

| ponto | volta | render on | render off | main | µs/draw on | µs/draw off | razão on | razão off |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| setorO | v3 | **11,2** | 13,2 | 12,7 | 72,6 | 86,7 | 1,217 | 1,294 |
| setorO | v4 | **10,2** | 10,9 | 10,5 | 66,7 | 73,1 | 1,200 | 1,313 |
| comercial | v3 | 13,0 | 13,0 | 12,5 | 104,9 | 107,0 | 0,942 | 1,057 |
| comercial | v4 | **11,3** | 12,8 | 13,2 | 89,2 | 105,3 | 0,934 | 1,041 |
| hélio (dirigindo) | v3 | **7,4** | 8,2 | 8,0 | 71,8 | 79,8 | 0,871 | 0,872 |
| hélio (dirigindo) | v4 | 8,2 | 8,4 | 7,8 | 76,8 | 81,9 | 0,891 | 0,933 |

- **Ganho:** `render` cai **0,2–2,0 ms** (on × off), ~**7–14 µs por draw**; a
  razão normalizada é menor no braço on em **6 de 6** pares (setorO −6 a −9%,
  comercial −10 a −11%, hélio 0 a −5%). Faixa realista: **~0,7–1,5 ms** de
  render, dentro do previsto pelo ADR-0330 (1,2–2,2) no limite inferior — o
  `renderList.push` e as camadas continuam em JS.
- **Sem regressão:** a seção `mirror` (varredura + sincronização) fica igual à
  da main (setorO 1,2–1,6 ms nos três braços). A primeira versão desta etapa
  custava +0,6 ms aqui (varredura lendo `visible` pelo acessor e reclassificando
  o tipo do nó); corrigido lendo o armazenamento do gancho e o tipo calculado
  na adoção.
- **Paridade:** `draws`/`tris` iguais entre os braços (ex.: setorO 149 × 148,
  931 mil tris); **0 recusas** em todas as rodadas (`[nativeProjection]
  nativas=N recusadas=0`); captura do setorO idêntica à do `three` (só NPC e
  mensagem da central mudam), com sombra, contorno, céu e UI.
