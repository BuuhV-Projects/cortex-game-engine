# SPEC 0177 - Contrato de empacotamento do export: grafo de imports + encoder KTX2

**Data:** 2026-08-01
**Status:** aceito

## Contexto

O Studio instalado (build da pipeline do GitHub) falhava ao exportar um jogo:

```
Exportando (PC · com métricas) — bundle + bytecode + runtime…
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@gltf-transform/core'
  imported from …\resources\native\scripts\cook-assets.mjs
```

O TDR-0003 embarca no Studio Windows um **toolchain de export auto-contido**
(`native/export-toolchain/`) cujo `node_modules` é copiado pra
`resources/node_modules`. Ele pinava só o que o **`bundle.mjs`** importa
(esbuild, babel, three, three-mesh-bvh, zod) + o embed de ícone (png-to-ico,
rcedit).

Só que o export não é só o `bundle.mjs`: o `export-game.mjs` importa mais seis
módulos irmãos, e o **cook de assets** (`cook-assets.mjs` → `ktx2-glb.mjs`,
ADR-0108/0119, escrito DEPOIS do TDR-0003) importa `@gltf-transform/core` e
`@gltf-transform/extensions`. Essas duas são **devDependencies da engine** — em
dev resolvem do `node_modules` do repo, e por isso o export sempre funcionou na
máquina de quem desenvolve a engine. No `.exe` instalado não existem: o export
morre no primeiro `import` do `cook-assets.mjs`.

O teste `tests/native/export-packaging.test.ts` existia justamente pra travar
esse contrato, mas olhava **só o `bundle.mjs`** — o cook passou por baixo dele.

Segundo furo, do mesmo tipo e **silencioso**: o encoder WASM
(`native/tools/basis-encoder/`, baixado pelo `fetch-basis-encoder.mjs`) não está
em `win.extraResources`. Sem ele, `encodeKtx2()` lança ao ler
`basis_encoder.js`, o `catch { continue }` do `ktx2-glb.mjs` engole por textura
e o export termina **com sucesso, sem nenhuma textura em KTX2** — o jogo sai
maior em disco e bem maior em VRAM, sem nenhum aviso.

## Decisão

### 1. O toolchain pina as deps do GRAFO INTEIRO do export

`native/export-toolchain/package.json` passa a pinar também
`@gltf-transform/core` e `@gltf-transform/extensions` (4.4.1 — as mesmas
versões que a engine usa). O critério deixa de ser "o que o `bundle.mjs`
importa" e passa a ser **"todo import bare alcançável a partir do
`export-game.mjs`"**.

### 2. O encoder KTX2 vai no instalador

`electron-builder.json#win.extraResources` ganha
`native/tools/basis-encoder` → `native/tools/basis-encoder` (filtro
`basis_encoder.js`, `basis_encoder.wasm`). O CI já produz essa pasta no runner
Windows (`fetch-deps.ps1` chama `fetch-basis-encoder.mjs`, e `native/tools` está
no cache da action `build-native-host`), então é só empacotar.

### 3. Encoder ausente vira aviso, não silêncio

`encode-ktx2.mjs` valida a existência do encoder e lança um erro tipado
(`ERR_BASIS_ENCODER_MISSING`); `ktx2-glb.mjs` distingue esse caso do "encode
falhou pra esta textura": avisa **uma vez** no stdout do export
(`[ktx2-glb] encoder basis ausente — texturas seguem PNG`) e para de tentar.
O export continua (um jogo sem KTX2 roda), mas o dev vê o que aconteceu.

### 4. O teste passa a varrer o grafo, não um arquivo

`tests/native/export-packaging.test.ts`:

- caminha o grafo de imports **relativos** a partir de `native/scripts/export-game.mjs`
  (fecho transitivo) e exige que **todo import bare** (fora `node:*`) esteja
  pinado no `package.json` do toolchain;
- exige `native/tools/basis-encoder` em `win.extraResources`.

É o teste que teria pego este bug no CI em vez de no usuário.

### 5. Revisão (mesmo dia): deps que chegam por NOME, e o smoke isolado

A varredura estática do item 4 passou verde e o export **quebrou de novo** no
Studio instalado, agora no passo do bundle:

```
Error: Cannot find package '@babel/plugin-transform-block-scoping'
  imported from …\resources\babel-virtual-resolve-base.js
```

O `bundle.mjs` passa os plugins do Babel como **string** (`plugins: ['@babel/
plugin-transform-block-scoping', …]`) — o Babel resolve esse nome em runtime.
Nenhum `import` menciona o pacote, então **nenhum walker de imports o enxerga**.
O plugin entrou com o ADR-0146 (o `let` por iteração que o Hermes executa
errado) e o toolchain nunca foi atualizado.

As deps do export chegam, então, por **três** caminhos, e só o primeiro é
visível pra análise estática:

1. `import` nos scripts — ex.: `@gltf-transform/core` no cook;
2. `import` bare **dentro do `src/` da engine**, resolvido pelo esbuild em
   runtime — `three`, `three-mesh-bvh`, `zod`;
3. **nome em string**, resolvido pelo Babel (plugins/presets) ou por
   `require.resolve` — `@babel/plugin-transform-*`, `png-to-ico`, `rcedit`.

Perseguir cada caminho com um analisador novo é correr atrás do prejuízo. A
decisão é **rodar o export de verdade contra uma árvore isolada**:
`tests/native/export-isolated-smoke.test.ts` monta num tmp o mesmo layout que o
electron-builder produz em `resources/` (`native/scripts` + `native/js` + `src`
copiados) com **um único `node_modules`: o do toolchain**, e executa o
`bundle.mjs` real sobre uma fixture de jogo que importa a engine inteira. Dep
faltando por qualquer um dos três caminhos falha aqui — foi verificado
reproduzindo os dois bugs (o teste fica vermelho com a árvore de antes).

A fixture carrega uma **sonda** `for (let …)` com closure e o teste exige que
ela saia como `var` no bundle: se o plugin de block-scoping for removido da
lista um dia, o export não falha — ele produz um jogo com bug silencioso
(ADR-0146), e é isso que o assert pega.

Como o toolchain tem `node_modules` próprio, o job de testes do CI passa a
rodar `yarn install --frozen-lockfile` nele (`release.yml`, `build-ide.yml`).
Local, sem o toolchain instalado, o smoke **pula**; no CI (`process.env.CI`)
a ausência é **erro** — um smoke que some sozinho é pior que smoke nenhum.

## Consequências

- **O Studio instalado volta a exportar** — e o export sai com as texturas em
  KTX2/BC7, como no dev.
- **Instalador cresce ~1,5 MB** (gltf-transform ~1,3 MB + encoder WASM ~1,2 MB).
- **Adicionar dep nova ao export exige pinar no toolchain** — por `import`, por
  plugin do Babel ou por `require.resolve`, tanto faz: o smoke isolado quebra
  no CI. Não depende mais de lembrar do "ponto de manutenção" do TDR-0003 nem
  de prever a forma da dep.
- **O job de testes fica ~25 s mais lento** (install do toolchain + um bundle
  real da engine). É o preço de exercitar o caminho que só existe na máquina do
  usuário; os dois furos anteriores custaram duas releases quebradas.
- **`devDependency` da engine usada em runtime pelo export é a armadilha
  recorrente**: resolve em dev pelo `node_modules` do repo e some no `.exe`.
  Ao usar uma no `native/scripts/` (ou num caminho que o bundle alcance),
  pinar no toolchain — `@gltf-transform/*` e `@babel/plugin-transform-*` eram
  exatamente isso.
- **Recurso novo que o export leia de `engineRoot` continua sendo manual**: o
  teste cobre imports, não caminhos de arquivo montados em runtime. Ao usar um
  `path.join(engineRoot, …)` novo, incluir em `win.extraResources` e, de
  preferência, travar com um teste como o do `native/build`.
- Relaciona-se com TDR-0003 (empacotamento do export), ADR-0108 e ADR-0119
  (cook KTX2) e SPEC-0155 (converter por VRAM).
