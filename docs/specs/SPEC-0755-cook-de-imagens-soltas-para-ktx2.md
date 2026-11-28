# SPEC 0755 - O cook converte imagens soltas para KTX2, por uma lista do jogo

**Data:** 2026-11-28
**Status:** implementado
**Relacionado:** SPEC-0750 (cook de JPG e 4096² nos GLB), ADR-0751, SPEC-0155 (KTX2 → BC7 no host), SPEC-0748, ADR-0756

## Contexto

O cook do export (`native/scripts/cook-assets.mjs`) converte para KTX2 só as texturas embutidas nos GLB. Imagens
soltas (PNG/JPG que o jogo carrega por URL) são copiadas como estão (`cook-assets.mjs:89-95`) e sobem para a GPU em
RGBA8 cru.

No export do Port Hollow, medido em 2026-11-28 no Ato 2:

- são 1264 texturas vivas na GPU, com 1,5 GB, e 735 MB delas em RGBA8;
- as maiores cruas são soltas:
  - o atlas do lote de NPCs, 8192×4096: 171 MB;
  - as 8 vagas do pacote de perto, 2048²: 171 MB;
  - ~100 pinturas de veículo de 512²: 136 MB;
  - o céu, 2048×1024: 53 MB.

O host também guarda na RAM de sistema a memória de upload que as subidas usaram. São ~1,5 GB write-combined de
blocos de 128 MB, que acompanham o volume total subido. Textura em BC7 sobe 4 vezes menos bytes: corta a VRAM e essa
RAM.

**Regra do usuário: textura nunca é reduzida.** A conversão mantém as dimensões da fonte.

## Decisão

### 1. A lista do jogo: `cookTextures` no `cortex.json`

O jogo diz quais imagens soltas cozer (opt-in; ADR-0756):

```json
"cookTextures": [
  { "files": "assets/vehicles/paint/*.png" },
  { "files": "assets/sky/Sunny_Day.png" },
  { "files": "assets/textures/ripple.png", "srgb": false, "replace": false }
]
```

| Campo | Padrão | Significado |
|---|---|---|
| `files` | (obrigatório) | um padrão glob (`*` dentro de uma pasta, `**` em subpastas, `?` um caractere) ou uma lista deles, relativo à pasta do jogo |
| `exclude` | `[]` | padrões que saem do conjunto |
| `srgb` | `true` | cor (`true`) ou dado linear (`false`); escolhe a métrica do encode, como no GLB (`ktx2-glb.mjs:90`): `srgb` e `rdoScalar` 1,0 na cor, linear e sem RDO no dado |
| `flipY` | `true` | a orientação com que o jogo usa a textura. Com `true`, como o `loadTexture` entrega o PNG, o cook grava as linhas já viradas, porque textura comprimida ignora o `flipY` no upload (`WebGPUTextureUtils.js:561-563`); com `false`, para quem põe `tex.flipY = false` |
| `replace` | `true` | no pak fica só o `.ktx2`; com `false`, o original também (quem lê o PNG na CPU) |

Um arquivo casado por duas entradas usa a primeira. Uma entrada que não casa nada avisa no log do export. A lista é
validada antes do build (`cookTexturesOf`, `native/scripts/cook-textures.mjs`): entrada sem `files`, padrão vazio ou
campo com tipo errado reprova o export com o índice da entrada. O glob é um casamento próprio (`globToRegExp`), sem
dependência nova. O `cookTextures` não vai para o `cortex.json` do runtime.

### 2. O cook

Só entram arquivos `.png`, `.jpg` e `.jpeg` (sem diferenciar maiúsculas): um padrão largo como `assets/x/**` nunca tira
um `.glb` do cook dele. Os padrões também não diferenciam maiúsculas, e a barra ou o `./` na frente sai. O problema
de instalação (encoder WASM ou basisu ausente, ou que não roda) avisa uma vez por export, não uma por imagem.

Para cada arquivo da lista:

- **Formato e dimensões** pelo header (`image-header.mjs`, SPEC-0750). Fonte fora de blocos 4×4 ou formato
  desconhecido avisa e fica com o original.
- **Encode** pelo `encodeKtx2` (WASM até 12.582.912 texels e basisu nativo acima, ADR-0751), com UASTC e os mesmos
  parâmetros do GLB, mais o flip das linhas quando `flipY`. Falha avisa e fica com o original. Nada é reduzido. Sem
  piso de tamanho: a lista é escolha do jogo.
- **O flip** é do próprio encoder nos dois caminhos, sem decodificar a fonte: o `encodeKtx2(bytes, { flipY })` chama o
  `setYFlip(true)` do `BasisEncoder` WASM e passa `-y_flip` ao basisu nativo (`basisuArgs`). Os dois viram as linhas
  da fonte antes dos mips. Conferido transcodando o KTX2 de volta para RGBA32 pelo `KTX2File` do módulo basis: com
  `flipY`, a primeira linha do nível 0 é a última da fonte.
- **Saída** ao lado do original: `<arquivo>.ktx2` (`paint_02.png` → `paint_02.png.ktx2`). Anexar a extensão evita a
  colisão de `x.png` com `x.jpg`.
- **Cache** como o do GLB: chave `sha1(COOK_VERSION + "loose-v1" + bytes + srgb + flipY)` em
  `<jogo>/.cortex-cache/ktx2/<chave>.ktx2`. Só a conversão bem-sucedida entra no cache: a que falhou tenta de novo no
  export seguinte (a fonte fora de 4×4 sai pelo header, sem encode). O `COOK_VERSION` não sobe: a política dos GLB não
  mudou, e o `loose-v1` separa a das imagens soltas.
- **Manifesto** `assets/cooked-textures.json`, no pak: `{ "<url do original>": "<url do .ktx2>" }`, só com quem
  converteu. Sem nenhuma conversão, o manifesto não é gravado.
- **`replace`:** o original sai do pak quando a conversão deu certo e `replace` é `true`.
- **Resumo no log:** convertidas, do cache, falhas por motivo, e o tamanho antes e depois (`looseConverted`,
  `looseCached`, `looseKept`, `looseKeptReasons`, `looseBefore`, `looseAfter` no `stats` do `cookAssets`). O encoder
  WASM ausente avisa uma vez por processo.

### 3. O `loadTexture` no host

O `loadTexture(url)` público (`src/scene/SceneAssets.ts`), no host nativo:

- lê o manifesto uma vez (ausente ou inválido = vazio, sem erro e sem log repetido); fora do host nem pede o arquivo;
- com `url` no manifesto, carrega o `.ktx2` pelo `loadKtx2` e devolve a `CompressedTexture` BC7 (com todos os mips do
  arquivo, `flipY = false`, `generateMipmaps = false`) no lugar da `Texture`. O resto do contrato não muda:
  - o cache por URL;
  - o `pixelated`;
  - o `colorSpace` fica com quem chama, como no PNG;
- solta os dados BC7 da CPU depois do primeiro upload (`releaseKtx2TexturesAfterUpload`, a versão por lista de texturas
  do `releaseKtx2DataAfterUpload`). Clonar essa textura depois do upload sobe uma cópia vazia: quem clona fica fora da
  lista. Duas chamadas juntas da mesma URL dividem a mesma carga;
- o `pixelated` põe mag e min em nearest e deixa só o nível 0, como o PNG pixelado (com a cadeia do arquivo, o
  WebGPU amostraria os mips menores);
- depois do primeiro upload, um `needsUpdate` na textura vira no-op com um aviso no `debug` (os dados já saíram da
  CPU e a GPU segue com a textura que tem), e um `clone()` avisa que a cópia sobe vazia.

No navegador, nada muda: o manifesto não existe no dev e o PNG carrega como antes.

`cookedTextureUrl(url): Promise<string | null>`, exportado (`src/scene/cookedTextures.ts`), diz se a URL tem `.ktx2`
cozido no host. Serve a quem carrega por outro caminho, como uma textura de tamanho fixo que troca os mips em tempo de
execução. É **assíncrona** de propósito: a primeira chamada lê o manifesto (uma vez por sessão) e as seguintes
respondem do que já foi lido, então não há ordem de preparo que o jogo precise garantir. Aceita a URL com `./` ou `/`
na frente. No navegador, sempre `null`. A URL do manifesto sai em `COOKED_TEXTURES_MANIFEST_URL`.

### 4. Fora do escopo

- O `AssetLoader.loadTexture` (o `TextureLoader` direto), o `terrainLayerTexture` e o fundo da UI
  (`RendererUiBackend`) seguem como estão. O jogo que quiser o KTX2 passa pelo `loadTexture` público.
- Paralelizar o encode: o loop continua serial, e o cache cobre os exports seguintes.

## Consequências

- O primeiro export com uma lista grande demora mais: centenas de imagens de 2048² no WASM. Os seguintes vêm do
  cache.
- O pak pode crescer: o KTX2 com UASTC+Zstd é maior que o JPG. O `replace` tira o original.
- O `.ktx2` sai em BC7 no host. Ele perde um pouco da cor (UASTC → BC7, visualmente quase igual), mas não muda de
  tamanho.

## Testes

- `tests/native/cookLooseTextures.test.ts` (o encoder mockado, passando pelo `planEncode` real):
  - a lista, com glob, `exclude`, a primeira entrada vencendo e a entrada vazia avisando;
  - a fonte fora de 4×4 e a falha ficando com o original;
  - o `replace`;
  - o manifesto;
  - o cache.
- `tests/native/encode-ktx2-flip.test.ts`: encode REAL de um PNG 8×8 (metade de cima vermelha) pelo WASM e pelo
  basisu nativo, com e sem `flipY`, lido de volta pelo `KTX2File` em RGBA32 (a linha de cima vira a de baixo); o
  `-y_flip` nos argumentos só com `flipY`.
- `tests/scene/loadTextureCooked.test.ts`:
  - o `loadTexture` com o manifesto devolvendo a `CompressedTexture`;
  - sem o manifesto, o PNG;
  - o `cookedTextureUrl`;
  - o cache por URL (também com duas chamadas juntas);
  - o `pixelated` e a liberação dos dados BC7 depois do upload;
  - o manifesto inválido e o navegador sem pedir o manifesto.
