# 0226 - Relógio de alta resolução no host

**Data:** 2026-09-20
**Status:** aceito

## Contexto

No host nativo, `performance.now()` é definido em
`native/js/src/shims/globals.js` como:

```js
globalThis.performance = globalThis.performance || { now: () => Date.now() };
```

Ou seja: **resolução de 1 milissegundo**. Isso torna impossível cronometrar
qualquer coisa que custe menos que um frame — e o que precisamos medir agora
custa **microssegundos por objeto**.

A medição que motivou isto (SPEC-0225) mostrou que 83% do render são trabalho
do `three` em JS: **73 us por draw**. Para decidir o que move para C++, é
preciso saber como esses 73 us se dividem entre as fases do render —
atualização de matriz de mundo, frustum culling e montagem da RenderList,
ordenação, e o `renderObject` com bindings. Sem isso, mover código para C++ é
escolher no chute o que reescrever.

O contorno usado até aqui foi **amplificação**: rodar a mesma função N vezes a
mais e dividir a diferença (foi assim que o `driveAI` foi medido em 23 ms). Ela
funciona, mas só serve para código que dá para chamar de novo sem efeito
colateral — não serve para as fases internas do renderer.

## Decisão

Expor um relógio monotônico de alta resolução do host, e usá-lo no
`performance.now()`:

- `native/src/shims/clock.{h,cpp}` — `__cortexNow()`, devolvendo
  **milissegundos como `double`**, com origem no start do processo, medido com
  `std::chrono::steady_clock`.
- `globals.js` passa a preferir `__cortexNow` e só cai no `Date.now()` quando
  ele não existir (browser, testes).

Milissegundos-como-double, e não microssegundos-inteiros, para casar com a
semântica de `performance.now()` do browser — código que já usa a API funciona
sem mudança, só passa a enxergar melhor.

`steady_clock` e não `system_clock`: o relógio não pode andar para trás quando
o sistema ajusta a hora.

## Consequências

- Tudo que já chama `performance.now()` no engine e nos jogos ganha resolução
  sem mudar uma linha — incluindo o `bootProfile` (SPEC-0217), que hoje mede
  fases de boot com granularidade de 1 ms.
- A origem passa a ser o **start do processo**, não a época Unix. Código que
  tratasse o retorno como timestamp absoluto quebraria — `performance.now()`
  nunca teve essa garantia, e o `Date.now()` continua disponível para quem
  precisa de data.
- Uma chamada a `steady_clock::now()` por invocação, mais a travessia NAPI.
  Não é para chamar em laço apertado sem pensar; é instrumento.

## Próximo passo (o que isto destrava)

Decompor os 73 us por draw nas fases do render, e só então decidir **qual
fase** vale mover para C++. A hipótese a testar é que a maior parte esteja no
`renderObject`/bindings, que roda por objeto por passe — e não na travessia de
matrizes, que muita gente assume ser o vilão.
