# SPEC-0651 - `DecompressionStream`, `ReadableStream` e `Response(stream)` no host nativo

**Data:** 2026-11-01
**Status:** aceito

Decisão em ADR-0650.

## Contexto

O caminho que o Port Hollow usa para descomprimir o heightmap (e que é o idioma padrão do navegador):

```ts
const stream = new Blob([z]).stream().pipeThrough(new DecompressionStream('deflate'));
const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
```

Nenhuma das peças existia no host.

## Decisão

### Ponte C++ — `__cortexInflate(bytes, formato) → ArrayBuffer | null`

- `bytes`: `ArrayBuffer` ou `Uint8Array`. `formato`: `'deflate'` (zlib, RFC 1950), `'deflate-raw'` (RFC 1951)
  ou `'gzip'` (RFC 1952).
- Devolve `null` se o formato é desconhecido ou o dado não descomprime (o JS transforma em `TypeError`, como o
  navegador). Entrada vazia → `null` (o navegador também rejeita stream deflate vazio).
- gzip: lê `ID1 ID2 CM FLG MTIME XFL OS`, pula `FEXTRA`/`FNAME`/`FCOMMENT`/`FHCRC`, faz inflate cru do resto e
  confere o `ISIZE` (tamanho mod 2³²) do trailer. Um membro só (o navegador também lê só o primeiro).
- Núcleo puro em `native/src/shims/inflate.*` (`inflateBytes`); a ponte em `decompression.*` só copia o resultado
  para um `ArrayBuffer` (fonte `inflate` no `perf_arraybuffer`).

### JS — `native/js/src/shims/streams.js`

- `ReadableStream({ start(controller), pull(controller) })` com `controller.enqueue/close/error`; `getReader()` →
  `{ read() → Promise<{ value, done }>, releaseLock(), cancel() }`; `pipeThrough({ writable, readable })` (inicia o
  `pipeTo` e devolve o `readable`); `pipeTo(writable)`; `cancel()`; `locked`; `[Symbol.asyncIterator]`.
- `WritableStream({ write(chunk), close(), abort(reason) })` com `getWriter()` → `{ write, close, abort,
  releaseLock }`.
- `DecompressionStream(formato)`: formato desconhecido lança `TypeError` no construtor. O lado gravável acumula os
  chunks (`ArrayBuffer`/`ArrayBufferView`; outro tipo → erro); no `close` chama `__cortexInflate` uma vez e
  enfileira um `Uint8Array` no lado legível; `null` vira erro `TypeError` no legível.
- Instalados em `globalThis` só se o global ainda não existir (não pisa em implementação real, ex.: Node nos
  testes).

### JS — `net.js`

- `Blob.prototype.stream()` → `ReadableStream` com um `Uint8Array` dos bytes (cópia por view, sem copiar).
- `Blob.prototype.text()` (barato, mesmo padrão).
- `Response` com a assinatura do navegador: `new Response(body?, init?)`, `body` = `null`, string,
  `ArrayBuffer`, `ArrayBufferView`, `Blob` ou `ReadableStream`; `init.status` (padrão 200) define `ok`.
  `arrayBuffer()/text()/json()/blob()` leem o stream até o fim quando o corpo é stream. O `fetch` interno passa a
  montar a resposta por uma fábrica (`makeResponse(url, bytes, ok, status)`), com o mesmo resultado de antes.

## Consequências

- Testes: Vitest do shim (`tests/native/streams.test.ts`) com `__cortexInflate` emulado pelo `zlib` do Node (as
  três variantes, erro de dado ruim, o caminho exato do `png16.ts`); C++ do núcleo no `cortex_host_tests`
  (zlib/raw/gzip de bytes conhecidos, gzip com `FNAME`, `ISIZE` errado, lixo).
- Prova no host: export do Port Hollow passa do `setupQuarry` no boot.
- Fora: `CompressionStream` (ADR-0650), `TransformStream` genérico, backpressure/`highWaterMark` (as filas são
  ilimitadas), `tee()`, BYOB readers.
