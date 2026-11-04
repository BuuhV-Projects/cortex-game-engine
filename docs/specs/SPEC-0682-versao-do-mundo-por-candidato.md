# SPEC-0682 — Versão da matriz de mundo por candidato da projeção nativa

**Data:** 2026-11-04
**Status:** implementado (passo 1 da ADR-0683; o passo 2, item de desenho retido, fica registrado na ADR-0683)

## Contexto

DDD 00 (Port Hollow), export nativo, poses fixas (2026-11-04, depois das Fases 0–3): no centro, `render` 9,4 ms,
dos quais `nativeProject` 4,3 ms e `nativeEmit` 1,2 ms. A ADR-0677 mediu que o custo restante da projeção é o laço
JS por candidato. Uma das partes desse laço é conferir se a matriz de mundo do objeto mudou desde a última gravação:

- RS1 (`RenderServer.offer` → `ServerAccess.check`): `matrixMatch`, 16 comparações de `matrixWorld.elements`
  contra o instantâneo b.1.
- Renderer nativo (ADR-0465, ligado no DDD 00 pelo `GameOptions.nativeRenderer`): `NativeRenderer.take` →
  `_refreshInstance`, 16 `Math.fround` comparados com a cópia `last` do bloco de objeto.

No DDD 00 quase nada se move (SPEC-0678: `nodesUnchanged 13.805/13.837`), então essas 16 comparações dão
"igual" em quase todo candidato, todo quadro.

## Decisão

### Host (`native/src/scene/world_versions.{h,cpp}`, `main_pass_culler.cpp`, `main_pass_shim.cpp`)

`WorldVersions` guarda, por slot do espelho, uma **foto** da matriz de mundo (16 doubles) e uma **versão**. No fim
de um `MainPassCuller::cull` aceito, para cada candidato, o C++ compara a matriz de mundo atual com a foto:

- igual: a versão fica;
- diferente (ou slot nunca visto: a foto nasce com `NaN`): a foto é copiada e o slot recebe `++contador`.

O contador é **global** (não por slot) e de 64 bits. Uma versão identifica, então, um **conteúdo** de matriz:
duas leituras com a mesma versão, em qualquer slot e em qualquer quadro, viram a mesma matriz. É isso que deixa o
mecanismo independente de quem escreveu o mundo (o `updateAndCull`, o `updateWorldMatrix` sob pedido da SPEC-0340
escrevendo direto na fatia, a reutilização de slot depois de uma lápide, uma reconstrução do espelho). Versão 0
nunca é dada; o JS usa -1 para "sem versão".

A versão vai para o JS num 5º argumento opcional de `__cortexMainPass.project`, um `Float64Array` (a ponte é
`double`, SPEC-0234; 2^53 versões não acabam). O host publica `__cortexMainPass.worldVersions = true`; sem isso
(host antigo) o JS não passa o argumento e tudo segue como antes. Um quadro recusado (`kMainCullRefused`) não
mexe nas fotos.

### JS

`MainProjector.project` lê a versão do candidato `k` e a passa a `RenderServer.offer(…, z, version)` e a
`offerNative(…, z, version)`. O padrão é -1 (sem versão), que mantém o caminho de hoje.

- **Renderer nativo** (`NativeRenderer.take(object, material, geometry, version)`): a instância guarda
  `worldVersion`. Versão igual à guardada → pula o laço de `fround` (não moveu). Diferente → o laço de sempre
  (escreve o bloco se moveu) e **adota** a versão. Adotar é correto porque a escrita usa a matriz deste
  instante, que é a matriz da foto daquela versão (nada no laço da projeção escreve matriz).
- **RS1** (`ServerAccess.check(g, version)`): `restMatch` como antes; depois, versão igual à da gravação →
  `Clean` sem `matrixMatch`. Diferente → `matrixMatch`; se bater, adota a versão (`Clean`), senão `Moved`.
  A versão da gravação volta a -1 em toda escrita do instantâneo: a regravação pelo `three` (`gravar`) e o
  plano de movimento (`aplicarMovimento`, que copia a matriz na hora da emissão ou do desenho direto, não na da
  projeção). O quadro seguinte a um movimento paga um `matrixMatch` e readota.
- O caminho direto do b.1 (`_renderObjectDirect`, itens que ficaram na RenderList do `three`) não recebe versão
  e segue com `matrixMatch`.

### Divisões de arquivo (SPEC-0668)

Mexer nesses arquivos exige trazê-los para 500 linhas, sem mudança de comportamento:

| antes | depois |
| --- | --- |
| `src/render/RenderServer.ts` (655) | `RenderServer.ts` (classe) + `RenderServerTypes.ts` (formas, `keyBelow`, `buildServerInstance`, grupos compartilhados) |
| `src/render/CleanDrawFastPath.ts` (887) | `CleanDrawFastPath.ts` (instalação) + `CleanSnapshot.ts` (instantâneo, vigias, `quickMatch`/`matrixMatch`/`restMatch`) |
| `src/render/native/NativeRenderer.ts` (1.063) | `NativeRenderer.ts` (classe) + `nativeRendererShared.ts` (constantes, formas, `vertexFormat`, `drawState`, flags) + `NativeGeometryStore.ts` + `NativeMaterialStore.ts` |

Os módulos antigos reexportam o que exportavam, então nenhum import de fora muda.

## Consequências

- Estimativa no DDD 00 (centro, ~2–3 mil candidatos por quadro): cai a comparação de 16 elementos por candidato
  parado. No Hermes sem JIT cada uma custa da ordem de 0,2–0,4 µs (16 leituras de `Float64Array` com acesso a
  `ro.object.matrixWorld.elements`, ou 16 `Math.fround`), ou seja **~0,4–1 ms por quadro** no `nativeProject`
  (a ADR-0677 punha o `matrixMatch` em ~⅓ do `check`). O C++ paga 16 comparações de double por candidato, na
  ordem de µs no total. A medição fica para a sessão principal (A/B com `?nativeMainPass=1`, poses fixas).
- O objeto que se move todo quadro paga o mesmo de hoje (a comparação acha diferença na primeira posição), mais
  o RS1 paga um `matrixMatch` no quadro seguinte ao movimento.
- Paridade: a versão só pode **pular** uma comparação cujo resultado seria "igual"; a ordem dos draws não muda
  (nada mexe em `z`, `renderOrder`, `id` nem no sort). Testes: `native/tests/world_versions_test.cpp` (host) e
  `tests/render/worldVersion*.test.ts` (JS).
