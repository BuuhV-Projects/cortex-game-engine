# SPEC-0247 — Script de build do host nativo

**Data:** 2026-09-22
**Status:** aceito

## Contexto

Desde que o passe de sombra nativo entrou na `main` (SPEC-0245), **compilar o
host deixou de ser opcional** para quem mexe no render: o C++ desenha o shadow
map, e uma mudança no engine que o afete só aparece depois de recompilar.

O repositório tem `native/scripts/fetch-deps.ps1` (baixa as dependências
pinadas), mas **nenhum script de build**. Quem quer compilar precisa saber de
cor quatro cuidados, e errar qualquer um deles falha de um jeito que **não
acusa erro**:

| cuidado | o que acontece se errar |
| --- | --- |
| rodar dentro do `vcvars64` | `cmake` não está no PATH — é o sintoma visível, e o único dos quatro que dá erro claro |
| `vcvars64` e `cmake` na **mesma** invocação do `cmd` | o ambiente do `vcvars64` só vale para o processo filho; em invocações separadas o segundo comando não o enxerga |
| passar o clang-cl por caminho completo | sem `-DCMAKE_*_COMPILER` o CMake pega o `cl.exe` da Build Tools **sem avisar**, e a validação acontece num compilador diferente do que gera o release |
| `native/build` **nunca** ser junction | o CMake guarda `CMAKE_HOME_DIRECTORY` no cache e passa a compilar os fontes de **outra worktree** em silêncio |

Durante a fase 4 esse script existiu num diretório temporário de sessão e foi
usado dezenas de vezes. Deixá-lo fora do repo significa que o conhecimento
acima se perde junto com o temporário.

## Decisão

`native/scripts/build-host.ps1`, ao lado do `fetch-deps.ps1`, com os quatro
cuidados **implementados e comentados no próprio arquivo** — a documentação
fica onde quem for mexer vai olhar.

Exposto por `yarn` para não exigir que se lembre da invocação:

| script | o que faz |
| --- | --- |
| `yarn build:host` | configura e compila o `cortex_host` |
| `yarn build:host --Limpar` | apaga `native/build` antes — **obrigatório quando fontes saem do `CMakeLists.txt`**, senão sobram `.obj` órfãos |
| `yarn build:host --Alvo cortex_host_tests` | só o harness de testes |

Parâmetros: `-Worktree` (padrão: a raiz do repo), `-Alvo` (padrão:
`cortex_host`), `-BuildType` (padrão: `Release`), `-Limpar`.

### O que o script NÃO faz

Não roda `fetch-deps.ps1`, não compila o engine e não empacota o Studio. Cada
um tem seu comando, e encadeá-los aqui esconderia qual etapa falhou — que é
justamente o problema que este script existe para resolver. A sequência
completa de rebuild fica documentada no `architecture.md`.

## Consequências

- Quem mexe no `native/` tem um caminho único e reproduzível, igual ao que a CI
  usa (TDR-0005 chama a mesma toolchain pela composite `build-native-host`).
- Os quatro cuidados deixam de ser conhecimento tácito.
- O script depende de `vswhere.exe` (vem com o instalador do Visual Studio) e
  do clang-cl em `C:\Program Files\LLVM`. Ambos são verificados no início, com
  mensagem dizendo o que instalar — em vez de falhar no meio do configure.
- É Windows-only, como o resto do caminho nativo hoje (o `crash_handler.cpp`
  inclui `<windows.h>` sem `#ifdef`).
