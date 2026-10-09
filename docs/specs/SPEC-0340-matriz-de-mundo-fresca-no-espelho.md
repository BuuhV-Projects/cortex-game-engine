# SPEC-0340 - Matriz de mundo fresca sob pedido no espelho nativo

**Data:** 2026-10-09
**Status:** aceito

## Contexto

Relato do usuário no export nativo do DDD 61: "as luzes dos carros estão
ficando pra trás e não acompanham o veículo, tanto da frente quanto de trás".
No navegador e no Studio não acontece.

As lentes/halos dos faróis (`entities/vehicleLights.ts` do jogo) são uma
`InstancedMesh` escrita no ÚLTIMO sistema do quadro a partir da pose do carro:

```ts
root.updateWorldMatrix(true, false);
const w = root.matrixWorld; // base de cada instância
```

Com o espelho de cena instalado (SPEC-0234), todo nó espelhado tem
`matrixWorld.elements` apontando para a memória do C++ e
`matrixWorldAutoUpdate = false` — o `three` não recalcula mais nada e o C++
recompõe as matrizes só em `NativeSceneMirror.update()`, chamado no render.
O `Object3D.updateWorldMatrix` do `three` (0.184) só escreve o `matrixWorld`
quando `matrixWorldAutoUpdate === true`; com `false` a chamada vira no-op e o
sistema lê a matriz que o C++ escreveu no render do quadro **anterior**.

No quadro N a carroceria é desenhada com a pose N (o C++ recompõe na hora do
render), mas as instâncias das luzes foram montadas com a pose N−1: ficam
`velocidade × dt` atrás (≈ 0,5 m a 60 km/h e 30 fps). Isso vale para farol e
lanterna, e para QUALQUER leitura de pose de mundo no meio do quadro no export:
`getWorldPosition`/`getWorldQuaternion`/`Box3.setFromObject` passam pelo mesmo
`updateWorldMatrix`. O defeito existe desde a SPEC-0234 (não veio da
SPEC-0322/0325).

## Decisão

`updateWorldMatrix` é a API **explícita** de "quero a matriz de mundo atual
deste nó". O espelho passa a honrá-la: ao enganchar um nó (mesmo ponto onde já
engancha `position`/`quaternion`/`scale`), instala um `updateWorldMatrix`
próprio que faz o que o `three` faria com `matrixWorldAutoUpdate = true` —
`matrix` local e `matrixWorld = pai.matrixWorld × matrix`, subindo pelos pais
quando pedido — escrevendo direto na fatia da memória nativa. O valor escrito é
o mesmo que o C++ calcularia no render, então não há conflito: o C++ sobrescreve
com o mesmo número.

Ao desenganchar (nó sai da cena ou o espelho desliga), o método próprio é
removido e o do protótipo volta.

`updateMatrixWorld` (a travessia em massa que o renderer chama na cena toda)
continua desligada pelo `matrixWorldAutoUpdate = false` — é o custo que o
espelho existe para eliminar. Só quem pede explicitamente paga a conta, como no
navegador.

## Consequências

- Luzes, mira, `getWorldPosition` etc. no export leem a pose do quadro corrente,
  igual ao navegador. Corrige o jogo sem tocar nele.
- Custo: uma multiplicação de matriz por nó da cadeia pedida — o mesmo do
  navegador. Quem chamava isso por quadro antes pagava só a recursão.
- Teste de paridade em `tests/core/NativeSceneMirror.test.ts`: move a raiz
  depois do `update()` e confere `updateWorldMatrix`/`getWorldPosition` de um
  filho contra a composição do `three` puro.
