# ADR 0751 - Encoder nativo (basisu) para a textura acima do teto do WASM

**Data:** 2026-11-27
**Status:** aceito

## Contexto

O cook converte as texturas dos GLB para KTX2 pelo encoder basis em WASM (ADR-0108, SPEC-0750). O WASM lê PNG e JPG
(o 5º argumento do `setSliceSourceImage` é o `ldr_image_type`), mas recusa fonte com mais de **12.582.912 texels**
(`BASISU_ENCODER_MAX_SOURCE_IMAGE_PIXELS` do `basis_wrappers.cpp`, fixo na compilação da tag `v2_1_0r`): toda textura
de 4096² (16.777.216 texels) falhava. No Port Hollow, são as dos NPCs de missão no pacote de perto.

A primeira versão desta decisão reduzia a fonte pela metade até caber (4096² → 2048², decodificando o JPG pelo
`jpeg-js`). **O usuário reprovou: o cook nunca reduz textura**, porque a redução perde a qualidade das malhas dos NPCs
que a regra do jogo exige. A 4096² tem que sair 4096².

O cook roda no Node, tanto no checkout da engine quanto dentro do Studio empacotado (Electron, SPEC-0177).

## Decisão

A fonte acima do teto do WASM passa pelo **encoder nativo do basis_universal**: o CLI `basisu`, em C++, compilado do
**mesmo commit** do transcoder do host e do WASM (`e4f439fc9545b6a9e1fd26fc7ffd0c682c4b96d4`, tag `v2_1_0r`). Ele só
limita o lado a 16384 (`BASISU_MAX_IMAGE_DIMENSION`).

- O `encode-ktx2.mjs` lê formato e dimensões do header; até o teto usa o WASM, acima chama o exe por `execFile` com um
  arquivo temporário e os mesmos parâmetros do WASM (UASTC nível 1, RDO só na cor com dicionário de 1024, sRGB ou
  linear, mips, KTX2 com Zstd; a tabela está na SPEC-0750 §2).
- O exe é compilado na máquina pelo `native/scripts/build-basisu.ps1` (clang-cl + vcvars, como o host) a partir do
  fonte que o `fetch-deps.ps1` baixa e confere pelo sha256. Fica em `native/tools/basisu/` (fora do git) e o Studio o
  empacota em `extraResources`.
- Sem o exe, a textura grande fica com o original e o cook avisa (`ERR_NATIVE_ENCODER_MISSING`); nunca reduz.
- O `jpeg-js` e o decoder de PNG próprio saem: o WASM decodifica os dois formatos e o nativo lê o arquivo.

Alternativas:

- **Reduzir a fonte até caber no teto.** Reprovada pelo usuário: perde a qualidade das texturas dos NPCs de missão.
- **Recompilar o WASM com o teto maior.** Rejeitada: precisa do emsdk na máquina e no CI e de um artefato próprio para
  manter, e não resolve o limite de fundo, que é a memória do WASM32 (2 a 4 GB de espaço de endereço para a fonte, a
  cópia de trabalho do encoder, os mips e o RDO de uma 4096², com risco de estourar em lote). O teto existe por isso.
- **Encodar em faixas e montar o KTX2 à mão** (o UASTC tem blocos independentes). Rejeitada: exige remontar níveis,
  DFD e a supercompressão Zstd fora do basis, e os mips de cada faixa não enxergam a vizinha (costura nas bordas), com
  risco de KTX2 inválido.
- **Manter o original em RGBA8.** Rejeitada: era o estado anterior, 64 MB + mips de VRAM por textura de 4096².

## Consequências

- A 4096² sai em KTX2 de 4096² (no npc-139, 3 de 3, entre 2,9 s e 14,1 s por textura no nativo, que usa várias
  threads), e chega à GPU em BC7 de 16 MB + mips.
- O cook passa a depender de um **binário compilado localmente**. Quem não roda o `build-basisu.ps1` (inclusive o CI
  que gera o Studio, por enquanto) exporta com as texturas acima do teto mantidas, com aviso e contagem; o GLB nessa
  situação não entra no cache, para converter assim que o exe existir.
- Dois encoders para o mesmo formato: os parâmetros do nativo têm que acompanhar os do WASM. A tabela da SPEC-0750 e o
  teste dos argumentos (`encode-ktx2-jpg.test.ts`) cobram; mudar a política de encode (ADR-0119) é mudar os dois.
- O fonte baixado tem ~160 MB (o zip do commit inteiro; o CLI precisa de `encoder/`, `transcoder/` e `zstd/`).
- O build é só Windows (como o export nativo).
- JPG que o decoder do basis não lê (CMYK, aritmético) cai no aviso da SPEC-0750 e fica com o original.
