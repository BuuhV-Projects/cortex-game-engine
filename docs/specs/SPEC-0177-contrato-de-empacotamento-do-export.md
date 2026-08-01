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

## Consequências

- **O Studio instalado volta a exportar** — e o export sai com as texturas em
  KTX2/BC7, como no dev.
- **Instalador cresce ~1,5 MB** (gltf-transform ~1,3 MB + encoder WASM ~1,2 MB).
- **Adicionar um `import` bare novo em qualquer script do export exige pinar a
  dep no toolchain** — agora o CI cobra isso automaticamente (não depende mais
  de lembrar do "ponto de manutenção" do TDR-0003).
- **Recurso novo que o export leia de `engineRoot` continua sendo manual**: o
  teste cobre imports, não caminhos de arquivo montados em runtime. Ao usar um
  `path.join(engineRoot, …)` novo, incluir em `win.extraResources` e, de
  preferência, travar com um teste como o do `native/build`.
- Relaciona-se com TDR-0003 (empacotamento do export), ADR-0108 e ADR-0119
  (cook KTX2) e SPEC-0155 (converter por VRAM).
