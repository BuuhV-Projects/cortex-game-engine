# 0146 - `transform-block-scoping` obrigatório no bundle nativo (Hermes quebra `let` em closure)

**Data:** 2026-07-23
**Status:** aceito

## Contexto

No export nativo do `teste4`, todas as fases do Mundo 3 renderizavam com a
geometria **preta**: skybox e planetas apareciam, mas tudo que dependia de luz
sumia. No Studio (browser/Dawn) o mesmo código rodava perfeito. O log do host
mostrava, repetidamente:

```
THREE.TSL: TypeError: Cannot read property 'oneMinus' of undefined "anonymous()"
    at setupOutput → getOutputNode → build → _renderObjectDirect
```

A pista que orientou o diagnóstico veio do playtest: **afastando a câmera as cores
voltavam, aproximando sumiam** — comportamento de sombra em cascata, não de
pós-processamento.

O bisect (cada rodada = ~40s: `vite build` + `export-game.mjs` + rodar com
`CORTEX_LAUNCH_QUERY=?level=…` e contar erros no log) descartou os suspeitos na
ordem: **PostFX** (desligado, erro continua), **névoa** (desligada, erro continua),
**environment/PMREM do skybox** (a `fase-1` usa o mesmo caminho e roda com zero
erro). Sobrou o **CSM**: só o Mundo 3 liga `csm: true`, e desligando ele o erro
some. A linha exata, extraída do bundle preservado, é do `CSMShadowNode`:

```js
for ( let i = 0; i < this.cascades; i ++ ) {
  …
  If( inRange, () => {
    …
    ret.subAssign( this._shadowNodes[ i ].oneMinus().mul( ratio ) ); // ← i errado
  } );
}
```

Instrumentando o host, `cascades = 4` e `_shadowNodes.length = 4` — o array estava
**correto**. O errado era o **índice**. A sonda que fechou o caso:

```js
const probes = []; for ( let k = 0; k < 3; k ++ ) probes.push( () => k );
probes.map( f => f() ).join( ',' )   // browser: "0,1,2"   ·   Hermes: "3,3,3"
```

**O Hermes não implementa o binding por iteração do `let`.** Uma closure criada
dentro de `for (let i…)` enxerga o valor **final** de `i`. No CSM isso vira
`_shadowNodes[4]` → `undefined` → exceção no build do shader → o material perde a
iluminação e renderiza preto. O `bundle.mjs` transpilava classes e arrow functions
(que o Hermes também não suporta), mas **não** block-scoping, então o `let` chegava
intacto ao runtime que o executa errado.

## Decisão

Adicionar **`@babel/plugin-transform-block-scoping`** ao passe do Babel no
`native/scripts/bundle.mjs`, junto de `transform-classes` e
`transform-arrow-functions`. O Babel reescreve o loop gerando a captura correta por
iteração — ou seja, aqui o transform **conserta** o runtime, não o degrada.

Validado no host: a sonda passa a devolver `0,1,2`, o erro TSL zera e a `space-1`
renderiza com iluminação e sombras corretas **com o CSM ligado**.

## Consequências

- **Não é um bug do CSM nem do three.** O CSM só foi o primeiro a exibir o
  sintoma, por indexar um array dentro de closure em loop. **Qualquer** código —
  nosso, do jogo ou de dependência — com closure capturando variável de loop estava
  silenciosamente corrompido no export, provavelmente com outros defeitos ainda não
  percebidos. Este ADR corrige a classe inteira, não o caso.
- O sintoma é **silencioso**: nada falha no build, no typecheck ou nos testes, que
  rodam em Node. Só aparece rodando o binário exportado.
- Regra derivada: **divergência Studio ↔ export nativo é, até prova em contrário,
  diferença de semântica do runtime** — não de shader/GPU. O caminho barato de
  diagnóstico é rodar `dist-native/launcher.exe` com `CORTEX_LAUNCH_QUERY` e ler o
  log; erro de JS aparece lá, e o bundle pode ser preservado rodando
  `native/scripts/bundle.mjs` direto (o `export-game.mjs` o apaga após o `hermesc`).
- Se aparecer outra divergência do tipo, o suspeito é a **lista de transforms do
  `bundle.mjs`**: ela precisa cobrir tudo que o Hermes não implementa direito.
