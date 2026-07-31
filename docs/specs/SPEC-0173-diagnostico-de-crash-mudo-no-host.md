# 0173 - Diagnóstico de crash mudo no host nativo

**Data:** 2026-07-31
**Status:** aceito

## Contexto

O `error_log.txt` do export é o **único** rastro que temos quando o jogo fecha
sozinho na máquina do jogador — não há console num exe aberto por 2-cliques. No
crash de 2026-07-31 (carregamento de fase, ver ADR-0172) esse arquivo saiu com 40
frames de backtrace e **nenhuma linha de causa**. Dois buracos explicam o
silêncio:

1. **Sem `std::set_terminate`.** Quem chama `terminate` cai direto no `onAbort`,
   que só sabe imprimir a pilha. O tipo e o `what()` da exceção — a única
   informação que realmente aponta o culpado — se perdem.
2. **O stderr do Rust não é capturado.** O `installCrashHandler` redireciona o
   `FILE* stderr` do CRT com `freopen_s`, mas isso **não** mexe no
   `STD_ERROR_HANDLE` do Windows. `wgpu_native.dll` e `rapier_native.dll` são
   Rust: o texto do panic (`thread '…' panicked at …`, e o valioso
   `Caused by: …`) sai por `GetStdHandle(STD_ERROR_HANDLE)` e cai no vácuo. É
   por isso que o cabeçalho "provável wgpu/Rust" nunca vem acompanhado da
   mensagem do panic que o justificaria.

Além disso o cabeçalho do `onAbort` **afirma** uma causa ("provável wgpu/Rust")
que no crash real estava errada — atrapalhou a leitura em vez de ajudar.

## Decisão

### 1. Handler de `terminate` que nomeia a exceção

`installCrashHandler` registra `std::set_terminate`. O handler grava, **antes**
do backtrace:

```
==== TERMINATE (excecao C++ nao tratada) — 2026-07-31 13:03:21 ====
[crash] excecao: class std::bad_alloc — bad allocation
```

Obtido por `std::current_exception()` + `rethrow_exception` dentro de
`try`/`catch`:

- `catch (const std::exception& e)` → `typeid(e).name()` + `e.what()`;
- `catch (...)` → `excecao: tipo desconhecido (nao deriva de std::exception)`;
- sem exceção corrente → `terminate() chamado sem excecao corrente (noexcept
  violado, ou std::thread destruida sem join)` — que é diagnóstico por si só.

Depois: backtrace, restaura o handler default e segue o `abort` normal.

**O handler de `terminate` do MSVC é POR THREAD** — `set_terminate` no `main`
não vale pras outras (medido, ver abaixo). Por isso ele é exposto como
`core::installThreadCrashHandler()` e chamado no início de **toda** thread criada
pelo host (hoje só as workers do `io_pool`). Thread nova sem essa chamada volta a
morrer muda.

### 2. Capturar o stderr nativo (Rust) no mesmo arquivo

Junto do `freopen_s`, o `installCrashHandler` abre o `error_log.txt` com
`CreateFileA` (append, `FILE_SHARE_READ|WRITE`) e chama
`SetStdHandle(STD_ERROR_HANDLE, …)`. Assim panic de Rust e qualquer coisa escrita
direto no handle do sistema entram no arquivo, na ordem em que aconteceram.
Também define `RUST_BACKTRACE=1` (via `SetEnvironmentVariableA`, **sem
sobrescrever** se o usuário já tiver setado) — o panic passa a trazer a pilha
Rust, que é o que falta pra localizar um erro dentro do wgpu.

Só vale quando não há console (`GetConsoleWindow() == nullptr`), igual ao
`freopen_s` de hoje: rodando de um terminal (dev), o stderr fica onde está.

### 3. Cabeçalho do `onAbort` deixa de chutar

`"ABORT (panic — provável wgpu/Rust; ver linhas acima no stderr)"` vira
`"ABORT (abort/panic — a causa, quando houver, está nas linhas acima)"`. O
handler não tem como saber a origem; afirmar uma atrapalha.

### 4. Bindings napi blindados no funil (ADR-0172)

`njs::setMethod` passa a registrar um **trampolim**: o callback real vai como
`data` do `napi_create_function` e é executado dentro de `try`/`catch`. Em
exceção:

- linha no `error_log.txt`: `[napi] excecao C++ em <nome-do-binding>: <tipo> — <what>`;
- `napi_throw_error` com a mesma mensagem → o JS vê um erro normal;
- retorna `undefined`.

O trampolim repassa o mesmo `napi_callback_info`, então `argc`, `args`, `this` e
`unwrapThis` continuam funcionando sem nenhuma mudança nos bindings existentes.

### 5. Worker do `io_pool` blindada

A worker chama `installThreadCrashHandler()` ao nascer (rede de segurança) e o
corpo do `workerLoop` roda em `try`/`catch`. Exceção vira `done.ok = false`
(que o JS já trata como arquivo ausente) + linha no `error_log.txt` com a URL que
falhou. Sem isso, `std::vector::resize` num arquivo grande derruba o processo
sem log — o caminho mais provável de um crash intermitente **durante o
carregamento**, que é exatamente o sintoma relatado.

## Evidência medida (não deduzida)

Smoke test com o handler novo, um caminho de falha por execução, lendo o
`error_log.txt` resultante:

| caminho de falha | handler que pega | causa no log? |
| --- | --- | --- |
| exceção que ninguém captura | `onCrash`, exceção `0xE06D7363` | não (só a pilha) |
| exceção escapando de função `noexcept` | `onTerminate` | **sim** |
| exceção escapando do callable de `std::thread` | `onAbort` (mudo) | **não** |
| idem, com `installThreadCrashHandler()` na thread | `onTerminate` | **sim** |
| idem, com `try`/`catch` no corpo da thread | nenhum — **sobrevive** | sim, e segue jogando |

Duas conclusões que mudam o diagnóstico:

1. **Exceção simplesmente não capturada NÃO produz `terminate`** no MSVC: vira a
   exceção SEH `0xE06D7363` e cai no `SetUnhandledExceptionFilter`, com o
   cabeçalho "CRASH (exceção nativa)". Como o log do crash real trouxe **ABORT
   com `terminate` na pilha**, aquele crash veio de um caminho que *chama*
   `terminate` — `noexcept` violado, escape de `std::thread`, exceção durante
   unwind ou destrutor lançando. Isso **exclui** o caso mais banal e deixa a
   worker do `io_pool` como suspeita concreta (era a única thread do host, e o
   sintoma foi durante o carregamento).
2. A hipótese de que frames sem EH (o Hermes compila com `/EHs-c-`) forçariam
   `terminate` foi **testada e refutada**: no x64 toda função tem unwind info, a
   exceção atravessa e ainda cai no filtro. Não é por aí.

## Consequências

- O próximo crash desta classe chega com **tipo, mensagem e ponto** — em vez de
  40 frames de símbolos enganosos. (Sem PDB, o DbgHelp resolve para o export
  público mais próximo: nomes como `JSOutOfMemoryError` ou
  `hermes_napi_load_module` com offsets de +0xa000 são **ruído posicional**, não
  a função real. O log passa a não depender deles.)
- Falha de I/O e asset corrompido deixam de ser fatais.
- O `error_log.txt` passa a receber também o que o Rust escreve — inclusive
  mensagens não-fatais de panic recuperado. O arquivo cresce um pouco mais; segue
  em append, sem rotação (é diagnóstico raro, não telemetria).
- `RUST_BACKTRACE=1` deixa o panic do Rust mais lento e verboso — irrelevante,
  já que só ocorre quando o jogo já está morrendo.
- **Não** resolve retroativamente o crash de 2026-07-31: a causa exata continua
  desconhecida até a próxima ocorrência ser capturada com o log novo.

Testes: `native/tests/crash_handler_test.cpp` (TDR-0004) cobre o formato das
linhas do terminate handler. Decisão e alternativas: ADR-0172.
