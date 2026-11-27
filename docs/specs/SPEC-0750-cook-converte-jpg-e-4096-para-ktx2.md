# SPEC 0750 - O cook converte JPG e textura de 4096² para KTX2

**Data:** 2026-11-27
**Status:** implementado

## Contexto

O cook do export (ADR-0108, `native/scripts/cook-assets.mjs`) converte as texturas embutidas nos GLB para KTX2
(UASTC, que o host transcoda para BC7, SPEC-0155). No `assets.pak` do Port Hollow de 2026-11-27, **só 117 das 1.286
imagens de GLB saíram em KTX2**: 936 JPG e 233 PNG ficaram como estavam e chegaram à GPU em RGBA8 cru, quatro vezes
maiores que em BC7 (774 texturas vivas em RGBA8, cerca de 2 GB de VRAM).

Testando o `encodeKtx2` com as imagens do jogo:

- **todo JPG falha** ("encode: falhou (0 bytes)"), em qualquer tamanho. O 5º argumento do `setSliceSourceImage` é o
  `ldr_image_type` do basis (`cRGBA32` = 0, `cPNGImage` = 1, `cJPGImage` = 2); o cook passava `true` (= 1), então
  todo JPG era lido como PNG. O WASM lê JPG: faltava dizer o tipo certo;
- **PNG de 4096² também falha**: o WASM recusa fonte acima de um teto de texels (§2);
- a falha é silenciosa: o `convertGlbTextures` faz `continue` e mantém o original, e o export termina "ok".

**Regra do usuário: o cook nunca reduz textura.** As 4096² são as dos NPCs de missão no pacote de perto (SPEC-0256 do
Port Hollow); reduzir perderia a qualidade que a regra deles pede. Toda textura sai em KTX2 nas dimensões da fonte, ou
fica com o original e avisa.

## Decisão

O encoder da fonte acima do teto está no ADR-0751.

### 1. Formato e dimensões pelo header (`native/scripts/image-header.mjs`)

- O formato vem da assinatura dos bytes (PNG `89 50 4E 47`, JPG `FF D8`), não do `mimeType`.
- As dimensões vêm do header, sem decodificar: o IHDR do PNG e o primeiro segmento SOF do JPG (SOF0 a SOF15, menos
  DHT `C4`, JPG `C8` e DAC `CC`; baseline e progressivo). A leitura do JPG anda pelos tamanhos dos segmentos, pula os
  `FF` de enchimento e os marcadores sem tamanho (TEM, RST0 a RST7); chegar ao SOS ou ao EOI sem SOF dá
  `ERR_IMAGE_DECODE`.
- Formato desconhecido lança `ERR_IMAGE_FORMAT_UNKNOWN` com os primeiros bytes em hex (não "0 bytes").

### 2. Dentro do teto, o WASM; acima, o basisu nativo (`encode-ktx2.mjs`, `encode-ktx2-native.mjs`)

**Causa real da falha do PNG de 4096²** (medida com o `printErr` do emscripten ligado): o `basis_encoder::encode()`
do WASM recusa fonte com mais de **12.582.912 texels** (`BASISU_ENCODER_MAX_SOURCE_IMAGE_PIXELS` do
`basis_wrappers.cpp`, fixo na compilação do WASM da tag `v2_1_0r`):

> The total number of source texels to compress 16777216 is greater than 12582912, which is likely too large for WASM

O `planEncode(bytes)` lê o header e escolhe:

- **até 12.582.912 texels: o WASM**, com o tipo certo (`Module.ldr_image_type.cPNGImage` ou `cJPGImage`, largura e
  altura 0: o basis decodifica). O buffer de saída é calculado pelas dimensões (`outputBufferBytes`: 16 bytes por bloco
  4×4 do UASTC, mais um terço dos mips e 1 MB de folga para header, DFD e índice de níveis).
- **acima: o basisu nativo** (o CLI `basisu` do basis_universal em C++, mesmo commit `e4f439fc…` da tag `v2_1_0r`),
  que só limita o lado a 16384. A fonte vai para um temporário (`mkdtemp` no `os.tmpdir()`, com a extensão `.png` ou
  `.jpg`, que é o que o basisu usa para escolher o leitor), o exe roda por `execFile` e a pasta sai no `finally`. Os
  parâmetros repetem os do WASM:

| WASM | basisu |
| --- | --- |
| `setCreateKTX2File(true)` | `-ktx2` |
| `setMipGen(true)` | `-mipmap` |
| `setPerceptual`/`setMipSRGB(srgb)` | `-srgb` (cor) ou `-linear` (dados) |
| `setUASTC(true)` + `setPackUASTCFlags(1)` | `-uastc -uastc_level 1` |
| `setRDOUASTC` + `QualityScalar(x)` + `DictSize(1024)` (só com `rdoScalar > 0`) | `-uastc_rdo_l x -uastc_rdo_d 1024` |
| `setKTX2UASTCSupercompression(true)` | padrão do KTX2 UASTC (Zstd) |
| `uastc: false` + `setQualityLevel(q)` | `-etc1s -q q` |

O exe fica em `native/tools/basisu/basisu.exe` (fora do git), resolvido relativo ao script, como o WASM. **Sem o
exe**, a fonte acima do teto lança `ERR_NATIVE_ENCODER_MISSING` com a instrução (`rode
native/scripts/build-basisu.ps1`): o cook avisa e mantém a textura original. **Exe que não roda** (não inicia, sai
com erro, não grava o KTX2 ou passa de 5 min, `NATIVE_ENCODE_TIMEOUT_MS`) lança `ERR_NATIVE_ENCODER_FAILED`, com o
fim da saída dele no motivo. Não há redução em nenhum caminho.

### 2a. Dimensão fora dos blocos 4×4

O host monta o BC7 com as dimensões do KTX2 e o WebGPU exige o nível 0 em blocos 4×4 (`src/core/loadKtx2.ts` não
trata o resto). Fonte com largura ou altura fora de múltiplo de 4 lança `ERR_NOT_BLOCK_ALIGNED` e fica com o original.

### 2b. Piso da conversão por texels

O piso antigo (fonte abaixo de 16 KB não converte) media o arquivo, não a VRAM: um JPG de 256² tem cerca de 11 KB e
ficaria de fora. O piso passa a ser **64×64 texels** (`MIN_CONVERT_TEXELS`), checado antes do encode. Sem dimensões
legíveis, vale o piso antigo por bytes.

### 3. Falha não é mais silenciosa (`native/scripts/ktx2-glb.mjs`)

Cada textura que não converte gera um aviso com o GLB, o índice, as dimensões e o motivo (o basisu nativo ausente avisa uma vez por processo, como o encoder WASM ausente, e cada textura mantida conta no resumo)
(`[ktx2-glb] <glb> textura #i (L×A, mime): <motivo> — mantém o original`). O `stats` do cook ganha `texKept` (texturas
mantidas sem KTX2) e `texKeptReasons` (contagem por `code` do erro: `ERR_IMAGE_FORMAT_UNKNOWN`, `ERR_IMAGE_DECODE`,
`ERR_NOT_BLOCK_ALIGNED`, `ERR_NATIVE_ENCODER_MISSING`, `ERR_ENCODE_FAILED`, `outro`), e o `export-game.mjs` imprime a
linha quando não é zero. A textura continua com o original (o export não quebra). Só conta o GLB convertido no
export; o que vem do cache não reconta. O encoder WASM ausente (`ERR_BASIS_ENCODER_MISSING`) segue com o aviso único
da SPEC-0177.

### 4. Cache (`native/scripts/cook-assets.mjs`)

- `COOK_VERSION` sobe para `cook-v5`: o cache por hash tem GLB cozido sem os JPG e os 4096²; sem o salto, o export
  reusaria o cozido velho.
- O GLB com textura mantida por `ERR_NATIVE_ENCODER_MISSING` ou `ERR_NATIVE_ENCODER_FAILED` **não entra no cache**: é problema de instalação, e o
  export seguinte, já com o exe, tem que converter a textura em vez de reusar o GLB com o original. As outras falhas
  são da própria textura e cacheiam como antes.

### 5. Instalação do basisu

- `native/scripts/fetch-deps.ps1` baixa o zip do fonte no commit fixado
  (`github.com/BinomialLLC/basis_universal/archive/<sha>.zip`, ~160 MB) para `native/third_party/_downloads/basisu-src/`,
  confere o sha256 (`9e7a8c9b…596c9`) e extrai (pula se já extraído).
- `native/scripts/build-basisu.ps1` compila o alvo `basisu` com clang-cl e vcvars (a receita do `build-host.ps1`, com
  `-msse4.1`, Zstd, sem OpenCL nem exemplos) e copia para `native/tools/basisu/basisu.exe`. O CRT é **estático**
  (`CMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded`, política CMP0091; o `BASISU_STATIC` do basis não vale no clang-cl): o
  exe só importa a `KERNEL32.dll` e roda no Studio instalado sem o VC++ Redistributable. O script reprova o exe que
  ainda importe `MSVCP140`, `VCRUNTIME140` ou `api-ms-win-crt-*` (lido pelo `llvm-objdump`).
- O Studio empacota a pasta (`electron-builder.json`, `win.extraResources`, filtro `basisu.exe`). O
  `ensure-host-dirs.mjs` cria a pasta vazia quando o exe falta e avisa: o build do Studio não falha, e o export avisa
  por textura grande.

## Consequências

- JPG e 4096² chegam à GPU em BC7, nas dimensões originais: um quarto da VRAM e, com a SPEC-0286, sem cópia em RAM
  depois do upload. Uma 4096² em RGBA8 são 64 MB + mips; em BC7, 16 MB + mips.
- O `.glb` cozido fica **maior em disco** que o JPG original (o UASTC+RDO+Zstd não chega na taxa do JPG): o quarry_kit
  foi de 4,2 MB para 13,0 MB, o npc-139 de 9,8 MB para 31,7 MB. O `assets.pak` cresce na mesma proporção; a regra é
  VRAM, não disco (SPEC-0155).
- O primeiro export depois desta mudança reconverte todos os GLB com textura (`cook-v5`; no Port Hollow, cerca de mil
  texturas). Os seguintes usam o cache.
- O basisu é **compilado na máquina**, não baixado pronto (o basis_universal não publica o CLI no commit fixado). O CI
  que gera o instalador do Studio ainda não roda o `build-basisu.ps1`: até isso entrar, o Studio do CI sai sem o exe e
  o cook dele mantém as texturas acima do teto como estão (com aviso).
- **Só Windows:** o `build-basisu.ps1` compila só no Windows e o Studio empacota só o `basisu.exe` (o export nativo também é só Windows). Em outra plataforma o nome procurado é `basisu`, sem
  receita de build.
- PNG/JPG **soltos** (fora de GLB) continuam copiados como estão (o jogo os pede por URL). Fica para outra SPEC.
- Sem dependência nova de JavaScript: o `jpeg-js` da primeira versão desta SPEC saiu (o WASM lê JPG).

### Medições (2026-11-27, Node 22, basis `v2_1_0r`)

Cada KTX2 conferido pelo `KTX2File` do próprio módulo basis: identificador «KTX 20», dimensões do header,
`isValid`, `startTranscoding` e o `transcodeImage` do nível 0 para BC7.

Texturas de 4096² do `npc-139-skinned.glb` pelo basisu nativo (com os argumentos da tabela do §2):

| Imagem | KTX2 | Encode |
| --- | --- | --- |
| #0 PNG 4096², linear | 4096², 13 níveis, 6,64 MB | 2,9 s |
| #1 JPG 4096², sRGB (com RDO) | 4096², 13 níveis, 10,89 MB | 14,1 s |
| #2 JPG 4096², linear | 4096², 13 níveis, 11,67 MB | 3,9 s |

GLB inteiros pelo `node native/scripts/ktx2-glb.mjs <in> <out>`, lidos de volta pelo `pixelWidth`/`pixelHeight` do
header de cada imagem:

| GLB | Texturas em KTX2 | Dimensões | Tamanho | Tempo |
| --- | --- | --- | --- | --- |
| `npc-139-skinned.glb` | 3 de 3 (antes, 0) | 3 × 4096², 13 níveis, Zstd | 9,83 MB → 31,71 MB | 19 s |
| `quarry_kit.glb` | 64 de 64 (antes, 0) | 39 × 256², 15 × 512², 5 × 1024², 2 × 128², 2 × 512×256, 1 × 128×256 | 4,15 MB → 13,02 MB | 58 s |

Nenhuma textura mantida nos dois; as 67 transcodam para BC7.

### Testes

- `tests/native/encode-ktx2-jpg.test.ts`: formato pela assinatura; dimensões pelo IHDR e pelo SOF (JPG baseline e
  progressivo gerados pelo sharp, e um JPG montado à mão com `FF` de enchimento, TEM, APP e DHT antes do SOF); JPG sem
  SOF e formato desconhecido com o motivo; o plano (WASM dentro do teto, nativo acima, nas mesmas dimensões);
  `ERR_NOT_BLOCK_ALIGNED`; `ERR_NATIVE_ENCODER_MISSING` com a instrução; os argumentos do basisu contra os parâmetros
  do WASM; buffer pelas dimensões; com o WASM, JPG baseline e progressivo e PNG virando KTX2; com o exe, um PNG
  sintético de 3600² (acima do teto) virando KTX2 de 3600² e o temporário removido, e a cor (padrão, sRGB com RDO)
  saindo com a transfer function sRGB no DFD e a supercompressão Zstd.
- `tests/native/ktx2-glb-fallback.test.ts`: o aviso por textura com GLB, índice, dimensões e motivo, a contagem em
  `stats`, o piso por texels e o basisu ausente mantendo a textura grande com o motivo enquanto as outras convertem.
- `tests/native/cook-native-missing.test.ts`: o GLB com o basisu ausente ou que não roda não entra no cache; com
  falha da própria textura, entra.
- `tests/native/export-packaging.test.ts`: o Studio empacota `native/tools/basisu` com o filtro `basisu.exe`.
