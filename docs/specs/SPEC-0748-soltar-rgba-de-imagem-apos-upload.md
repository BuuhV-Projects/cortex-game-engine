# SPEC 0748 - Soltar o RGBA da imagem PNG/JPG depois do upload

**Data:** 2026-11-27
**Status:** implementado

## Contexto

No host nativo, toda imagem PNG/JPG vira um `ArrayBuffer` RGBA cru pelo `__cortexDecodeImage` (stb), no
`createImageBitmap` e no `Image` fake (`native/js/src/shims/image.js`). O bitmap (`{ width, height, rgba }`) fica
pendurado na textura do three para sempre, e o `Image` fake ainda guarda o RGBA num cache por URL que nunca
esvazia. Depois do `queue.copyExternalImageToTexture` os pixels já estão na GPU (o `wgpuQueueWriteTexture` copia na
hora, e os mips são gerados na GPU), mas a cópia em RAM continua viva como memória externa do Hermes.

A SPEC-0286 resolveu isso só para os mips KTX2 de GLB. No Port Hollow (export de 2026-11-27), com quase todas as
texturas em PNG/JPG, o `perf-log.txt` mostrou `external=3592MB` e `vram=4331MB`, com o processo em 8,4 GB: cada
textura existe duas vezes, uma na GPU e outra na RAM.

## Decisão

Escolha e alternativas no ADR-0749. Comportamento:

### 1. Bitmap que solta os pixels (`native/js/src/shims/image.js`)

O `createImageBitmap(fonte, opções)` decodifica na hora (como antes: largura, altura e `load` não mudam) e devolve
um bitmap que guarda também os **bytes comprimidos** da fonte (o PNG/JPG, 10 a 20 vezes menor que o RGBA) e se a
fonte foi invertida (`imageOrientation: 'flipY'`).

- `bitmap.rgba` é um getter: devolve os pixels; se já foram soltos, decodifica de novo dos bytes comprimidos (com a
  mesma inversão) e devolve o resultado, sem guardá-lo de novo como permanente (ele é solto no próximo upload).
- `bitmap.rgba = x` (atribuição) troca os pixels e deixa o bitmap **não soltável** (os pixels passam a ser a
  fonte da verdade, não há bytes comprimidos que os reproduzam).
- `bitmap.close()` solta os pixels e os bytes comprimidos (o bitmap não pode ser reenviado depois).
- Fonte já decodificada (outro bitmap ou o `Image` fake) passa direto, como hoje, apontando para a mesma fonte. Fonte
  soltável divide os pixels e os bytes comprimidos, sem forçar redecode.
- Vista parcial de um buffer maior (`Uint8Array` sobre o GLB, por exemplo) vira cópia só do trecho, para o bitmap
  não prender o buffer inteiro.

### 2. Soltar no upload (`queue.copyExternalImageToTexture`)

No `requestDevice` (`webgpu-extras.js`), uma vez por device, o shim embrulha o `copyExternalImageToTexture` da `GPUQueue` nativa: chama o nativo e, quando ele volta (os pixels
já foram copiados pela fila), chama o `__cortexReleasePixels()` da fonte, se ela tiver. Fonte sem esse método
(canvas, bitmap montado à mão) não muda.

### 3. `Image` fake com cache de bytes comprimidos

O cache por URL do `Image` fake guarda `{ width, height, bytes }` (os bytes comprimidos), não o RGBA. O `Image`
fake é ele mesmo soltável, com o mesmo getter `rgba`. Na primeira carga de uma URL decodifica na hora (como hoje);
numa URL já em cache, só preenche largura, altura e os bytes, e decodifica quando alguém ler `rgba`.

### 4. Contadores no `perf-log.txt`

A linha `heap-js=… external=… | arraybuffers: …` (SPEC-0188) ganha `img-solto=N/MB` (pixels soltos depois do
upload, acumulado) e `img-redecode=N` (quantas vezes um bitmap solto foi decodificado de novo). O shim mantém os
contadores em `globalThis.__cortexImageReleaseStats` (`image-pixels.js`) e o host os lê na hora de escrever a linha
(`shims::dumpImageReleaseStats`, `perf_arraybuffer.cpp`), logo depois do `arraybuffers:`. `img-redecode` alto
num quadro de jogo aponta textura reenviada todo quadro (`needsUpdate` em loop) e é sinal para olhar o jogo.

## Consequências

- A memória externa do Hermes cai do tamanho de todas as texturas RGBA para o tamanho dos PNG/JPG comprimidos.
- Reenviar uma textura já solta (`needsUpdate`, clone que sobe depois, `drawImage` no canvas 2D) custa um decode
  novo (stb; ~10 a 40 ms num 1024²). É raro em textura de modelo; textura que muda todo quadro deve ser
  `DataTexture`/canvas, não imagem.
- O pico do carregamento não muda: o decode continua na hora. O que muda é o vale depois do upload.
- Testes: `tests/native/image-release.test.ts` (getter, solta no upload, redecode com e sem flip, atribuição,
  `close`, cache de bytes do `Image` fake).
