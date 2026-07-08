# 0108 - KTX2 / Basis: texturas comprimidas no host nativo

**Data:** 2026-07-08
**Status:** aceito (Fase 1 — transcode → RGBA; Fases 2–3 pendentes)

## Contexto

M2 do PRD-0004 pede **KTX2**. O `assets.pak` do teste4 tem ~92 MB, quase tudo
textura PNG (soltas + embutidas em GLB). PNG é grande em disco e, decodificado,
ocupa RGBA cru na VRAM. KTX2 (container) + **Basis Universal** (supercompressão
ETC1S/UASTC) reduz o arquivo em ~4–8× e permite transcodar pro formato comprimido
da GPU (BC7/BC5) — menos disco **e** menos VRAM/banda.

No browser/Studio o `KTX2Loader` do three usa o transcoder Basis em **WASM**. O
host nativo (Hermes) **não roda WASM**, então precisa de um transcoder **nativo**.

## Decisão

Transcoder nativo via **basis_universal** (só a pasta `transcoder/`: headers + 1
`.cpp` + tabelas, pinado por commit no `fetch-deps.ps1`, estilo stb/miniaudio).

Faseado:

- **Fase 1 (esta):** `native/src/shims/ktx2.cpp` expõe `__cortexTranscodeKtx2(bytes)`
  → `{ width, height, data: RGBA }`, **espelhando o `image_decode`** (que faz o
  mesmo pra PNG via stb). Reusa o caminho de `writeTexture` RGBA que já existe —
  **zero mudança no shim WebGPU**. Ganho: arquivos KTX2/ETC1S minúsculos → o
  `.pak` despenca. (VRAM ainda é RGBA, como PNG.)
- **Fase 2:** formatos de bloco (BC7/BC5/BC1) no shim WebGPU (enums + createTexture
  + writeTexture com `bytesPerRow` em blocos 4×4) — transcode direto pro formato
  da GPU, ganhando VRAM/banda.
- **Fase 3:** pipeline de conversão PNG→KTX2 (texturas soltas primeiro; embutidas
  em GLB via `gltf-transform` depois) + converter os assets do teste4.

Engine: um loader de `.ktx2` que no **nativo** chama o shim (→ `DataTexture` RGBA)
e no **browser/Studio** usa o `KTX2Loader` do three (WASM). Mesma cena, mesma
URL de textura; o ambiente decide o caminho.

## Consequências

- Basis é a única forma de KTX2/Basis funcionar nos DOIS ambientes (WASM no
  browser, C++ no host) — sem ele, texturas comprimidas não portam pro console.
- Fase 1 não toca no shim WebGPU (baixo risco), mas o ganho é só de **disco**
  (não de VRAM) até a Fase 2.
- Basis compila como third-party (warnings suprimidos; defines
  `BASISD_SUPPORT_KTX2=1`, `BASISD_SUPPORT_KTX2_ZSTD=0` — o encoder do projeto
  não usa Zstd, evitando a dependência).
- Pinado por commit (`1b33fd5…`), atualizar deliberadamente.
