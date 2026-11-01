# ADR-0650 - `DecompressionStream` no host, com inflate em C++ (stb_image)

**Data:** 2026-11-01
**Status:** aceito

## Contexto

O export nativo do Port Hollow morre no boot ao montar a mineradora:

```
[js] [game] ERRO no boot: TypeError: undefined is not a function
    at ?anon_0_inflate (boot.bundle.js:20508:565)
    at decodeGray16 (boot.bundle.js:20508:681)
    at ?anon_0_setupQuarry (boot.bundle.js:20509:117)
```

O jogo decodifica o heightmap PNG de 16 bits (`utils/png16.ts`) pelo caminho padrão do navegador:
`new Blob([z]).stream().pipeThrough(new DecompressionStream('deflate'))` e `new Response(stream).arrayBuffer()`.
No host (Hermes) não existe `DecompressionStream`, nem `Blob.prototype.stream`, nem `ReadableStream`, e o
`Response` do `net.js` nem tem a assinatura do navegador (`new Response(body, init)`). Regra do native/: API fiel
ao navegador — o jogo não deve saber que está no host.

## Alternativas

1. **`fflate` (ou similar) no jogo**: resolve só esse jogo, muda o jogo por causa do host e duplica um
   descompressor em JS (mais lento que C++) — o usuário recusou: "de preferência que seja feito pelo c++".
2. **Inflate em JS dentro do shim do host**: fiel ao navegador, mas é código de terceiros (ou autoral) em JS
   rodando no Hermes, mais lento que nativo, para um trabalho que é pura CPU.
3. **zlib/miniz no `third_party`**: inflate e deflate completos, mas é dependência nova no `fetch-deps` e no CMake.
4. **Inflate do `stb_image` (escolhida)**: o host já compila o `stb_image` (decode de PNG), que traz um inflate
   de zlib completo (`stbi_zlib_decode_malloc_guesssize_headerflag` / `stbi_zlib_decode_noheader_malloc`). Zero
   dependência nova. O lado de streams fica em JS (`native/js/src/shims/streams.js`), que é o que dá para shimar
   em JS; o trabalho de CPU atravessa a ponte numa chamada só (`__cortexInflate(bytes, formato)`).

## Decisão

- C++: `native/src/shims/inflate.*` (puro, sem NAPI, testado no `cortex_host_tests`) faz `deflate` (zlib),
  `deflate-raw` e `gzip` (cabeçalho RFC 1952 lido à mão + inflate cru + conferência do `ISIZE`);
  `native/src/shims/decompression.*` registra `__cortexInflate`. A implementação do `stb_image` sai do
  `image_decode.cpp` para `stb_image_impl.cpp`, para o alvo de testes linkar o inflate sem NAPI.
- JS: `ReadableStream`/`WritableStream`/`DecompressionStream` mínimos e fiéis (leitor, `pipeThrough`, `pipeTo`,
  async iteration), `Blob.prototype.stream` e `Response(body, init)` aceitando `ReadableStream`. Detalhes na
  SPEC-0651.

## Consequências

- O jogo roda sem mudar. Qualquer código do navegador que use `DecompressionStream` passa a funcionar no host.
- O `DecompressionStream` acumula todos os chunks e descomprime no `close` do lado gravável (uma travessia de
  ponte). Não é incremental: ok para arquivos de asset; um stream gigante (centenas de MB) pede inflate por chunk.
- O inflate do stb **não confere o Adler-32** do zlib nem o CRC-32 do gzip (só o `ISIZE`). Dado corrompido que
  ainda for deflate válido passa; o navegador rejeitaria.
- **`CompressionStream` fica de fora**: o stb não tem deflate (o `stb_image_write` não está no `third_party`).
  Quando algum jogo precisar, a alternativa 3 (miniz) cobre os dois lados.
