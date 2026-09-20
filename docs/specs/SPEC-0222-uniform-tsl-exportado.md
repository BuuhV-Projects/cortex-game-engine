# 0222 - `uniform` TSL exportado pelo runtime

**Data:** 2026-09-20
**Status:** aceito

## Contexto

O `index-runtime.ts` já expõe o caminho de "montar pipeline de
pós-processamento à mão" (ADR-0035): `RenderPipeline` + `pass`, `mrt`,
`output`, `renderOutput`, `bloom`, `fxaa`. Falta a peça que torna esse caminho
**animável**: `uniform`.

Sem ela, um jogo que monta a própria pipeline não tem como variar um parâmetro
em runtime sem reconstruir o grafo de nós — o que recompila o shader e engasga
o frame. O contorno que sobrava era pegar carona no uniforme público de outro
nó (por exemplo `bloom(...).strength`), o que **obriga a manter esse nó no
grafo só pelo uniforme**, pagando os passes dele.

Foi exatamente o que aconteceu no `kart-racer`: o efeito de velocidade
(SPEC-0005 do jogo) usava `bloom(...).strength` como uniforme do borrão radial
e da vinheta, e por isso carregava o bloom do three — um passe mais 5 níveis de
mip, ~13 render passes por frame — dentro do JS, no host, onde o `PostFX` da
engine justamente já move bloom e vinheta para C++ (ADR-0149).

## Decisão

Exportar `uniform` de `three/tsl` junto dos demais nós TSL:

```ts
export { pass, mrt, output, renderOutput, uniform } from 'three/tsl';
```

É o mesmo módulo e a mesma categoria dos exports que já existem ali — não há
alternativa de design a pesar, por isso é spec e não ADR.

## Consequências

- Um jogo passa a declarar seus próprios uniformes (`const s = uniform(0)`;
  depois `s.value = …` por frame) sem reconstruir o grafo e sem arrastar nós
  que não quer.
- Mais um símbolo do three na superfície pública do runtime. É re-export puro:
  não há código nosso para manter, e a assinatura é a do three.
- `VENDOR_TYPE_MODULES` **não** muda: não é um módulo novo em `src/<subdir>`, e
  sim um símbolo a mais no `index-runtime.ts` já listado.
- Jogos vendorizados só enxergam o símbolo depois de re-vendorizar o
  `index.d.ts`.
