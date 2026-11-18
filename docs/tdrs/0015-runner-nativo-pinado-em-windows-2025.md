# TDR-0015 — Runner do host nativo pinado em `windows-2025`

**Data:** 2026-11-18
**Status:** aceito

## Contexto

O host nativo (`cortex_host`, `cortex_host_tests`) compila no CI com **clang-cl**
(ADR-0122) usando os headers/libs do **MSVC** (vcvars) do runner. O compilador e
a STL do MSVC são de fornecedores diferentes, e a STL do MSVC tem um
`static_assert` que recusa um clang mais velho que o mínimo que ela suporta.

Os jobs rodavam em `windows-latest`. Em 2026-11 essa label migrou para uma imagem
nova com **Visual Studio 18 / MSVC 14.52.37025**, cuja STL passou a exigir
**Clang 22 ou mais novo** — mas o LLVM pré-instalado do runner segue o **20**. O
resultado é a compilação do host quebrando em qualquer arquivo que inclua um
header da STL:

```
yvals_core.h(923): error STL1000: Unexpected compiler version, expected Clang 22 or newer.
```

Não é uma mudança do nosso código: quebrou todo PR que compila o host, sem
nenhum commit nosso na toolchain. A imagem **`windows-2025`** ainda traz uma
combinação **consistente** — VS 2022 17.14, MSVC **14.44.35211** (toolset padrão)
e **LLVM 20.1.8** —, em que a STV do 14.44 aceita o clang 20.

## Decisão

Pinar os jobs que compilam o host nativo em **`windows-2025`** em vez de
`windows-latest`, e fixar o **toolset MSVC em `14.44`** no `vcvars` da composite
`build-native-host` (via `ilammy/msvc-dev-cmd` `toolset:`), para o par
clang 20 + MSVC 14.44 não depender de qual toolset a imagem elege por padrão.

Afeta os três pontos que invocam `build-native-host`: `pr.yml`, `build-ide.yml`
e `release.yml` (matrizes incluídas, com os respectivos `if: matrix.os`).

Alternativas descartadas:

- **Subir o clang do runner para 22+**: alinharia ao MSVC novo, mas o clang 22 é
  outra variável a validar (pode trazer suas próprias quebras) e deixaria a
  toolchain seguindo o `windows-latest`, que muda sem aviso — o mesmo problema
  voltaria na próxima bump da imagem.
- **Bypass com `_ALLOW_COMPILER_AND_STL_VERSION_MISMATCH`**: silenciaria o
  `static_assert`, mas a STL do 14.52 pode usar builtins que o clang 20 não tem —
  trocar um erro claro por falhas obscuras mais adiante.

## Consequências

- O CI do host roda numa toolchain fixa e internamente consistente
  (MSVC 14.44 + clang 20), independente de bumps do `windows-latest`.
- Quando o GitHub aposentar a imagem `windows-2025`, o job falha de forma clara
  ("imagem indisponível") — e aí a escolha é subir clang **e** MSVC juntos, numa
  combinação testada, atualizando este TDR.
- O host do usuário (export) não muda: continua com o clang-cl que o instalador
  embarca. Isto pina só o ambiente de CI.
