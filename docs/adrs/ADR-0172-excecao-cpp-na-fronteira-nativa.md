# 0172 - Exceção C++ na fronteira nativa não mata o processo

**Data:** 2026-07-31
**Status:** aceito

## Contexto

Um jogador (o próprio autor) perdeu a sessão num crash durante o **carregamento de
uma fase** no export de PC (`launcher.exe`, 2026-07-31 13:03:21). O
`error_log.txt` registrou **só** o backtrace do `onAbort`, sem nenhuma linha de
contexto — nem mensagem, nem tipo de erro, nem o arquivo que estava sendo lido.
Reabrir o jogo funcionou: o crash é intermitente, o pior tipo pra diagnosticar em
campo.

A leitura do backtrace descartou as duas suspeitas óbvias:

- **Não foi panic do wgpu/Rust** (o palpite que o próprio cabeçalho do handler
  imprime): `wgpu_native.dll` e `rapier_native.dll` são DLLs separadas no export
  e **nenhum frame do backtrace está nelas** — todos são `launcher.exe` ou
  `ucrtbase.dll`.
- **Não foi OOM da heap JS** (teto de 512 MB, ADR-0153): com
  `HERMESVM_EXCEPTION_ON_OOM=OFF` — que é como compilamos — o OOM do Hermes vai
  por `hermes_fatal` → `llvh::report_fatal_error`, que **imprime a causa e chama
  `abort()` direto, sem passar por `terminate`**. O backtrace tem `terminate`
  (frame #04) e o log não tem mensagem nenhuma.

Sobra o caminho `terminate → abort → raise(SIGABRT)`: **exceção C++** dentro do
`launcher.exe`. E medindo os caminhos um a um (tabela na SPEC-0173) o cerco
fecha mais: exceção que ninguém captura **não** chama `terminate` — vira a
exceção SEH `0xE06D7363` e cai no exception filter. Ter saído `terminate`
significa um caminho que o *chama*: `noexcept` violado, escape do callable de
uma `std::thread`, exceção durante unwind ou destrutor lançando.

O host tinha **zero** `try`/`catch` e **nenhum** `std::set_terminate`. Ou seja: o
crash mudo não é acidente, é o comportamento projetado por omissão. Qualquer
`std::bad_alloc`/`length_error` vindo de `std::vector::resize` num
`readAssetBytes`, de um `napi_create_arraybuffer` grande ou do transcoder basisu
derruba o jogo sem deixar rastro.

Pior: `io_pool` roda `readAssetBytes` **dentro de worker threads**. Exceção que
escapa da função de uma `std::thread` é `std::terminate` **imediato** — sem
passar por handler nenhum, sem log, sem chance de recuperação.

Alternativas pesadas:

1. **Deixar como está** e só melhorar o log. Barato, mas mantém "um asset
   corrompido/uma alocação grande = jogo fechado" — inaceitável num produto que
   vai pra Steam e Xbox, onde o jogador não tem console pra ler nada.
2. **`try`/`catch` em cada binding.** Cobre tudo, mas são ~68 arquivos e dezenas
   de callbacks: fatalmente alguém novo esquece, e o esquecimento é invisível
   até virar crash em campo.
3. **Blindar no funil.** Todo binding do host é registrado por `njs::setMethod`,
   e existe **exatamente uma** chamada de `napi_create_function` no host inteiro
   (`napi_util.cpp`). Um trampolim ali cobre 100% dos bindings, presentes e
   futuros, sem disciplina humana.

## Decisão

**Exceção C++ nunca atravessa a fronteira nativa→JS, e nunca mata o processo em
silêncio.**

1. **Trampolim no funil `njs::setMethod`** (alternativa 3): o callback real vai
   como `data` do `napi_create_function`, e o trampolim o executa dentro de
   `try`/`catch`. Exceção vira **erro JS** (`napi_throw_error`) com tipo e
   `what()` na mensagem, mais uma linha no `error_log.txt`. O JS decide o que
   fazer — o host segue vivo. Binding novo nasce blindado sem que ninguém
   precise lembrar.
2. **Worker do `io_pool` é uma fronteira de thread**: o corpo do loop roda em
   `try`/`catch`. A falha vira `done.ok = false` — que o JS já trata como
   "arquivo não encontrado" — em vez de `terminate`.
3. **`std::set_terminate`**: se ainda assim algo escapar, o handler registra
   **tipo (`typeid().name()`) e `what()`** antes do backtrace. Um crash mudo vira
   um crash com causa escrita. No MSVC esse handler é **por thread**, então ele é
   instalado também no início de cada worker (`installThreadCrashHandler`) — ver
   a tabela de comportamento medido na SPEC-0173.

Ponto que **não** muda: erro de programação continua fatal e visível. Não
engolimos exceção — ela vira erro JS logado, ou linha de log + abort. O que
acabou é o *silêncio*.

## Consequências

- **Ganho:** falha de I/O, asset corrompido ou pico de alocação viram erro
  tratável em vez de sessão perdida. Em campo, o `error_log.txt` passa a nomear a
  causa em vez de só a pilha.
- **Custo:** um `try`/`catch` por chamada de binding. O bloco só custa quando
  algo é lançado (zero-cost EH da MSVC no caminho feliz); os bindings de render
  são chamados por frame, então o caminho feliz importa — e ele não muda.
- **Risco assumido:** converter exceção em erro JS pode **mascarar** um bug que
  antes aparecia como crash imediato. Mitigado por a linha do `error_log.txt` ser
  sempre escrita, mesmo quando o JS engole o erro.
- **Limitação conhecida:** isto NÃO diagnostica retroativamente o crash de
  2026-07-31 — só garante que a próxima ocorrência venha nomeada. A causa exata
  segue em aberto até o próximo log.
- **Vale pro Xbox/GDK** (mesmo host): lá o jogador tem ainda menos acesso a
  console, e o certificado exige que o jogo não feche sozinho.

Especificação de comportamento e formato de log: SPEC-0173. Contexto de memória
do host: ADR-0153, SPEC-0152.
